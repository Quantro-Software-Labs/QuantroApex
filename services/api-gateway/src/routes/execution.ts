import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { executeOrder } from '../lib/execution_engine.js';
import { defaultBrokerClient } from '../lib/broker/alpaca_client.js';

const TICKER_REGEX = /^[A-Z0-9.\-\/]+$/i;

const orderSchema = z.object({
  symbol: z
    .string()
    .min(1, 'Symbol is required')
    .max(10, 'Symbol must not exceed 10 characters')
    .regex(TICKER_REGEX, 'Symbol must be a valid ticker (letters, numbers, . - /)'),
  side: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  quantity: z.number().positive().max(1_000_000, 'Quantity exceeds maximum allowed value'),
  limitPrice: z.number().positive().max(1_000_000, 'Limit price exceeds maximum allowed value').optional(),
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).default('STOCKS'),
  aiReasoning: z.string().max(500).optional(),
  isSimulated: z.boolean().default(true),
});

const signalSchema = z.object({
  strategyId: z.string().optional(),
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(TICKER_REGEX, 'Symbol must be a valid ticker'),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive().max(1_000_000).default(10),
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).default('STOCKS'),
  reasoning: z.string().max(500),
});

const ordersQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
});

export async function executionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/order', async (request, reply) => {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const data = parsed.data;

    const result = await executeOrder({
      userId,
      symbol: data.symbol.toUpperCase(),
      side: data.side,
      orderType: data.orderType,
      quantity: data.quantity,
      limitPrice: data.limitPrice,
      assetClass: data.assetClass,
      aiReasoning: data.aiReasoning,
      isSimulated: data.isSimulated,
    });

    if (!result.success) {
      return reply.status(422).send({
        error: 'ExecutionRejected',
        code: result.code,
        message: result.reason,
      });
    }

    return reply.status(201).send(result);
  });

  app.get('/orders', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = ordersQuerySchema.safeParse(request.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        include: { trades: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { userId } }),
    ]);

    return reply.send({
      orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  app.get('/positions', async (request, reply) => {
    const userId = getUserId(request);
    const portfolio = await prisma.portfolio.findFirst({
      where: { userId, mode: 'SIM' },
      include: { positions: true },
    });

    return reply.send({
      portfolio: portfolio || { cashBalance: 100000, equity: 100000, positions: [] },
      positions: portfolio?.positions || [],
    });
  });

  app.post('/orders/:id/cancel', async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const order = await prisma.order.findFirst({
      where: { id, userId },
    });

    if (!order) {
      return reply.status(404).send({ error: 'NotFound', message: 'Order not found' });
    }

    if (order.status === 'FILLED' || order.status === 'CANCELLED') {
      return reply.status(400).send({ error: 'InvalidState', message: 'Order cannot be cancelled' });
    }

    if (order.brokerOrderId) {
      try {
        await defaultBrokerClient.cancelOrder(order.brokerOrderId);
      } catch (_) {
        // Ignore broker cancellation error if order is already processed
      }
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return reply.send({ message: 'Order cancelled successfully', order: updated });
  });

  app.post('/signal', async (request, reply) => {
    const parsed = signalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const data = parsed.data;

    const result = await executeOrder({
      userId,
      symbol: data.symbol.toUpperCase(),
      side: data.side,
      orderType: 'MARKET',
      quantity: data.quantity,
      assetClass: data.assetClass,
      aiReasoning: data.reasoning,
      isSimulated: true,
    });

    if (!result.success) {
      return reply.status(422).send({
        error: 'ExecutionRejected',
        code: result.code,
        message: result.reason,
      });
    }

    return reply.status(201).send(result);
  });
}
