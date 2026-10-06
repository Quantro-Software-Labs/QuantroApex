import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findUserProfile,
  upsertUserProfile,
  listOrders,
  findPortfolio,
  findOrderById,
  updateOrder,
} from '../lib/db/repos.js';
import { getUserId } from '../plugins/auth.js';
import { executeOrder, syncUserPendingOrders } from '../lib/execution_engine.js';
import { AlpacaClient, defaultBrokerClient } from '../lib/broker/alpaca_client.js';
import { resolveBrokerClient } from '../lib/broker/broker_resolver.js';
import { tradeLearningLogger } from '../lib/ai/trade_learning_logger.js';
import { assertKycVerified } from './kyc.js';
import { assertPlanFeature } from './subscriptions.js';

const TICKER_REGEX = /^[A-Z0-9.\-\/]+$/i;

const orderSchema = z.object({
  symbol: z
    .string()
    .min(1, 'Symbol is required')
    .max(15, 'Symbol must not exceed 15 characters')
    .regex(TICKER_REGEX, 'Symbol must be a valid ticker (letters, numbers, . - /)'),
  side: z.enum(['BUY', 'SELL', 'buy', 'sell']).transform((s) => s.toUpperCase() as 'BUY' | 'SELL'),
  orderType: z
    .enum([
      'MARKET',
      'LIMIT',
      'STOP',
      'STOP_LIMIT',
      'TRAILING_STOP',
      'market',
      'limit',
      'stop',
      'stop_limit',
      'trailing_stop',
    ])
    .default('MARKET')
    .transform((t) => t.toUpperCase().replace('-', '_') as 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TRAILING_STOP'),
  type: z.string().optional(), // alias for orderType
  quantity: z.number().positive().max(1_000_000, 'Quantity exceeds maximum allowed value'),
  limitPrice: z.number().positive().max(1_000_000, 'Limit price exceeds maximum allowed value').optional(),
  stopPrice: z.number().positive().optional(),
  trailingAmount: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  isOco: z.boolean().optional(),
  owner: z.enum(['APEX', 'MANUAL', 'apex', 'manual']).default('APEX').transform((o) => o.toUpperCase() as 'APEX' | 'MANUAL'),
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).default('STOCKS'),
  aiReasoning: z.string().max(500).optional(),
  isSimulated: z.boolean().optional(),
  /** Alias: mode LIVE ⇒ isSimulated false; SIM ⇒ true */
  mode: z.enum(['LIVE', 'SIM', 'live', 'sim']).optional(),
}).transform((data) => {
  let isSimulated = data.isSimulated;
  if (data.mode) {
    isSimulated = data.mode.toUpperCase() !== 'LIVE';
  }
  if (isSimulated === undefined) isSimulated = true;
  return { ...data, isSimulated };
});

const signalSchema = z.object({
  strategyId: z.string().optional(),
  symbol: z
    .string()
    .min(1)
    .max(15)
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
    const orderType = (data.type
      ? String(data.type).toUpperCase().replace('-', '_')
      : data.orderType) as 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TRAILING_STOP';

    if (!data.isSimulated) {
      try {
        await assertKycVerified(userId);
      } catch (err: any) {
        return reply.status(403).send({
          error: 'KYC_REQUIRED',
          message: err?.message ?? 'Identity verification required before live trading',
        });
      }
    }

    // Plan gates — server-side (UI flags alone are not enough)
    try {
      if (data.owner === 'MANUAL') {
        await assertPlanFeature(userId, 'manual_desk');
      } else if (!data.isSimulated && data.owner === 'APEX') {
        await assertPlanFeature(userId, 'autopilot');
      }
    } catch (err: any) {
      return reply.status(403).send({
        error: 'PLAN_REQUIRED',
        message: err?.message ?? 'Plan upgrade required',
        feature: data.owner === 'MANUAL' ? 'manual_desk' : 'autopilot',
      });
    }

    const profile = await findUserProfile(userId);
    const brokerClient = data.isSimulated
      ? undefined
      : resolveBrokerClient(data.assetClass, {
          alpacaApiKey: profile?.alpacaApiKey,
          alpacaSecretKey: profile?.alpacaSecretKey,
        });

    const result = await executeOrder({
      userId,
      symbol: data.symbol.toUpperCase(),
      side: data.side,
      orderType,
      quantity: data.quantity,
      limitPrice: data.limitPrice,
      stopPrice: data.stopPrice,
      trailingAmount: data.trailingAmount,
      takeProfit: data.takeProfit,
      stopLoss: data.stopLoss,
      isOco: data.isOco,
      owner: data.owner,
      assetClass: data.assetClass,
      aiReasoning: data.aiReasoning,
      isSimulated: data.isSimulated,
      brokerClient,
    });

    if (!result.success) {
      return reply.status(422).send({
        error: 'ExecutionRejected',
        code: result.code,
        message: result.reason,
      });
    }

    // Log training data sample for Global Brain V2 learning engine
    await tradeLearningLogger.logTrade({
      userId,
      symbol: data.symbol.toUpperCase(),
      assetClass: data.assetClass,
      side: data.side,
      quantity: data.quantity,
      price: result.trade?.fillPrice ?? data.limitPrice ?? 100.0,
      realizedPnl: result.trade?.realizedPnl ?? 0.0,
      isWin: (result.trade?.realizedPnl ?? 0) >= 0,
      technicalSnapshot: {
        rsi: 58.2,
        macd: 1.24,
        assetClass: data.assetClass,
      },
    });

    return reply.status(201).send(result);
  });

  app.get('/orders', async (request, reply) => {
    const userId = getUserId(request);
    await syncUserPendingOrders(userId);

    const parsed = ordersQuerySchema.safeParse(request.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;

    const { orders, total } = await listOrders(userId, { skip, take: limit });

    return reply.send({
      orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  app.get('/positions', async (request, reply) => {
    const userId = getUserId(request);
    await syncUserPendingOrders(userId);

    const profile = await findUserProfile(userId);

    if (profile?.isBrokerConnected && profile.alpacaApiKey && profile.alpacaSecretKey) {
      try {
        const client = new AlpacaClient({
          apiKey: profile.alpacaApiKey,
          apiSecret: profile.alpacaSecretKey,
        });
        const [account, positions] = await Promise.all([
          client.getAccount(),
          client.getPositions(),
        ]);

        const mappedPositions = positions.map((p, idx) => ({
          id: `alpaca_${p.symbol}_${idx}`,
          symbol: p.symbol,
          quantity: p.qty,
          averageCost: p.avgEntryPrice,
          marketValue: p.marketValue,
        }));

        return reply.send({
          portfolio: {
            cashBalance: account.cash,
            equity: account.portfolioValue,
            positions: mappedPositions,
          },
          positions: mappedPositions,
          isLiveBroker: true,
        });
      } catch (err) {
        // Fall back to SIM portfolio if Alpaca API call fails
      }
    }

    const portfolio = await findPortfolio(userId, 'SIM');

    return reply.send({
      portfolio: portfolio || { cashBalance: 100000, equity: 100000, positions: [] },
      positions: portfolio?.positions || [],
    });
  });

  app.post('/orders/:id/cancel', async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const order = await findOrderById(id);

    if (!order || order.userId !== userId) {
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

    const updated = await updateOrder(id, { status: 'CANCELLED' });

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

  // ── Broker Credentials Endpoints ──────────────────────────────────────────
  app.get('/broker-credentials', async (request, reply) => {
    const userId = getUserId(request);
    const profile = await findUserProfile(userId);

    const isConnected = profile?.isBrokerConnected ?? false;
    const apiKey = profile?.alpacaApiKey;
    const maskedKey = apiKey && apiKey.length > 4 ? `PK...${apiKey.slice(-4)}` : null;

    return reply.send({
      isBrokerConnected: isConnected,
      maskedApiKey: maskedKey,
      brokerName: 'Alpaca Securities',
    });
  });

  app.post('/broker-credentials', async (request, reply) => {
    const brokerCredsSchema = z.object({
      apiKey: z.string().min(6, 'API Key is required'),
      secretKey: z.string().min(6, 'Secret Key is required'),
    });

    const parsed = brokerCredsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { apiKey, secretKey } = parsed.data;

    await upsertUserProfile(userId, {
      alpacaApiKey: apiKey,
      alpacaSecretKey: secretKey,
      isBrokerConnected: true,
    });

    const maskedKey = `PK...${apiKey.slice(-4)}`;

    return reply.send({
      message: 'Alpaca credentials saved & broker connected.',
      isBrokerConnected: true,
      maskedApiKey: maskedKey,
    });
  });

  app.delete('/broker-credentials', async (request, reply) => {
    const userId = getUserId(request);

    await upsertUserProfile(userId, {
      alpacaApiKey: null,
      alpacaSecretKey: null,
      isBrokerConnected: false,
    });

    return reply.send({
      message: 'Broker connection disconnected.',
      isBrokerConnected: false,
      maskedApiKey: null,
    });
  });
}
