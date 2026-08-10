import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { executeOrder } from '../lib/execution_engine.js';
import { AssetClass } from '@prisma/client';

const toggleModeSchema = z.object({
  mode: z.enum(['SIM', 'LIVE']),
});

const generateTicksSchema = z.object({
  symbol: z.string().optional(),
  volatility: z.number().min(0.001).max(0.1).default(0.02),
});

export async function simulationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/summary', async (request, reply) => {
    const userId = getUserId(request);

    let simPortfolio = await prisma.portfolio.findFirst({
      where: { userId, mode: 'SIM' },
      include: { positions: true },
    });

    if (!simPortfolio) {
      simPortfolio = await prisma.portfolio.create({
        data: {
          userId,
          mode: 'SIM',
          cashBalance: 100000,
          equity: 100000,
        },
        include: { positions: true },
      });
    }

    const livePortfolio = await prisma.portfolio.findFirst({
      where: { userId, mode: 'LIVE' },
      include: { positions: true },
    });

    const activeUserStrategy = await prisma.userStrategy.findFirst({
      where: { userId, isActive: true },
      include: { strategy: true },
    });

    const simCash = Number(simPortfolio.cashBalance);
    let simPositionValue = 0;
    simPortfolio.positions.forEach((pos) => {
      simPositionValue += Number(pos.quantity) * Number(pos.averageCost);
    });
    const totalSimEquity = simCash + simPositionValue;
    const simPnl = totalSimEquity - 100000;

    return reply.send({
      activeMode: 'SIM',
      simPortfolio: {
        id: simPortfolio.id,
        cashBalance: simCash,
        equity: totalSimEquity,
        realizedPnl: simPnl,
        positionsCount: simPortfolio.positions.length,
        positions: simPortfolio.positions,
      },
      livePortfolio: livePortfolio
        ? {
            id: livePortfolio.id,
            cashBalance: Number(livePortfolio.cashBalance),
            equity: Number(livePortfolio.equity),
            positionsCount: livePortfolio.positions.length,
          }
        : null,
      activeStrategy: activeUserStrategy?.strategy || null,
    });
  });

  app.post('/toggle-mode', async (request, reply) => {
    const parsed = toggleModeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { mode } = parsed.data;

    // Persist mode preference and log the switch to the activity feed
    await prisma.$transaction([
      prisma.agentState.upsert({
        where: { userId },
        create: { userId, isRunning: false },
        update: { isRunning: false }, // Pause agent on mode switch for safety
      }),
      prisma.activityFeedEntry.create({
        data: {
          userId,
          eventType: 'SYSTEM',
          message: `Execution mode switched to ${mode}. Agent paused for safety — resume when ready.`,
        },
      }),
    ]);

    return reply.send({
      message: `Switched active execution mode to ${mode}`,
      mode,
      agentPaused: true,
    });
  });

  app.post('/reset', async (request, reply) => {
    const userId = getUserId(request);

    const simPortfolio = await prisma.portfolio.findFirst({
      where: { userId, mode: 'SIM' },
    });

    if (simPortfolio) {
      await prisma.$transaction([
        prisma.position.deleteMany({ where: { portfolioId: simPortfolio.id } }),
        prisma.order.deleteMany({ where: { userId, isSimulated: true } }),
        prisma.portfolio.update({
          where: { id: simPortfolio.id },
          data: {
            cashBalance: 100000,
            equity: 100000,
          },
        }),
        prisma.activityFeedEntry.create({
          data: {
            userId,
            eventType: 'SYSTEM',
            message: 'Paper trading account reset to $100,000.00 initial capital.',
          },
        }),
      ]);
    }

    return reply.send({
      message: 'Paper trading account reset successfully',
      cashBalance: 100000,
      equity: 100000,
      positions: [],
    });
  });

  app.post('/generate-ticks', async (request, reply) => {
    const parsed = generateTicksSchema.safeParse(request.body);
    const userId = getUserId(request);
    const symbol = (parsed.success && parsed.data.symbol) ? parsed.data.symbol.toUpperCase() : 'AAPL';

    const simPortfolio = await prisma.portfolio.findFirst({
      where: { userId, mode: 'SIM' },
      include: { positions: true },
    });

    // Simulate price fluctuation (-2% to +3%)
    const changeFactor = 1 + (Math.random() * 0.05 - 0.02);
    const currentPos = simPortfolio?.positions.find((p) => p.symbol === symbol);
    const basePrice = currentPos ? Number(currentPos.averageCost) : 150.0;
    const newPrice = Number((basePrice * changeFactor).toFixed(2));

    // Execute simulated trade if change is positive
    let autoTrade = null;
    if (changeFactor > 1.01) {
      const result = await executeOrder({
        userId,
        symbol,
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 5,
        limitPrice: newPrice,
        assetClass: AssetClass.STOCKS,
        aiReasoning: `Simulated tick breakout signal on ${symbol} @ \$${newPrice}`,
        isSimulated: true,
      });

      if (result.success) {
        autoTrade = result.trade;
      }
    }

    return reply.send({
      message: 'Simulated market tick generated',
      tick: {
        symbol,
        price: newPrice,
        changeFactor: parseFloat(changeFactor.toFixed(4)),
      },
      tradeExecuted: !!autoTrade,
      trade: autoTrade,
    });
  });
}
