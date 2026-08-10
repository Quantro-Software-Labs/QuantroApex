import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { validateTradeRisk } from '../lib/risk_enforcer.js';

const updateVaultSchema = z.object({
  dailyLossLimit: z.number().positive(),
  maxDrawdown: z.number().min(0.01).max(1.0),
  perTradeExposure: z.number().min(0.01).max(1.0),
  cryptoEnabled: z.boolean(),
  stocksEnabled: z.boolean(),
  forexEnabled: z.boolean(),
});

const validateTradeSchema = z.object({
  tradeValue: z.number().positive(),
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']),
  portfolioEquity: z.number().positive().optional(),
  realizedLossToday: z.number().min(0).optional(),
});

export async function riskVaultRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request, reply) => {
    const userId = getUserId(request);
    let riskVault = await prisma.riskVault.findUnique({ where: { userId } });

    if (!riskVault) {
      riskVault = await prisma.riskVault.create({
        data: {
          userId,
          dailyLossLimit: 500,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          cryptoEnabled: false,
          stocksEnabled: true,
          forexEnabled: false,
        },
      });
    }

    return reply.send({
      riskVault,
      isEmergencyStopped: riskVault.emergencyStoppedAt !== null,
    });
  });

  app.put('/', async (request, reply) => {
    const parsed = updateVaultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const data = parsed.data;

    const riskVault = await prisma.riskVault.upsert({
      where: { userId },
      create: {
        userId,
        dailyLossLimit: data.dailyLossLimit,
        maxDrawdown: data.maxDrawdown,
        perTradeExposure: data.perTradeExposure,
        cryptoEnabled: data.cryptoEnabled,
        stocksEnabled: data.stocksEnabled,
        forexEnabled: data.forexEnabled,
      },
      update: {
        dailyLossLimit: data.dailyLossLimit,
        maxDrawdown: data.maxDrawdown,
        perTradeExposure: data.perTradeExposure,
        cryptoEnabled: data.cryptoEnabled,
        stocksEnabled: data.stocksEnabled,
        forexEnabled: data.forexEnabled,
      },
    });

    return reply.send({ riskVault });
  });

  app.post('/emergency-stop', async (request, reply) => {
    const userId = getUserId(request);
    const now = new Date();

    const [riskVault] = await prisma.$transaction([
      prisma.riskVault.upsert({
        where: { userId },
        create: {
          userId,
          dailyLossLimit: 500,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          emergencyStoppedAt: now,
        },
        update: {
          emergencyStoppedAt: now,
        },
      }),
      prisma.agentState.upsert({
        where: { userId },
        create: { userId, isRunning: false, stoppedAt: now },
        update: { isRunning: false, stoppedAt: now },
      }),
      prisma.activityFeedEntry.create({
        data: {
          userId,
          eventType: 'EMERGENCY_STOP',
          message: 'Emergency Stop triggered. All trading activity halted.',
        },
      }),
    ]);

    return reply.send({
      message: 'Emergency stop activated successfully',
      emergencyStoppedAt: riskVault.emergencyStoppedAt,
    });
  });

  app.post('/resume', async (request, reply) => {
    const userId = getUserId(request);

    const [riskVault] = await prisma.$transaction([
      prisma.riskVault.upsert({
        where: { userId },
        create: {
          userId,
          dailyLossLimit: 500,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          emergencyStoppedAt: null,
        },
        update: {
          emergencyStoppedAt: null,
        },
      }),
      prisma.activityFeedEntry.create({
        data: {
          userId,
          eventType: 'TRADING_RESUMED',
          message: 'Trading activity resumed by user.',
        },
      }),
    ]);

    return reply.send({
      message: 'Trading activity resumed successfully',
      riskVault,
    });
  });

  app.post('/validate-trade', async (request, reply) => {
    const parsed = validateTradeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { tradeValue, assetClass, realizedLossToday, portfolioEquity } = parsed.data;

    let riskVault = await prisma.riskVault.findUnique({ where: { userId } });
    if (!riskVault) {
      riskVault = await prisma.riskVault.create({
        data: {
          userId,
          dailyLossLimit: 500,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          cryptoEnabled: false,
          stocksEnabled: true,
          forexEnabled: false,
        },
      });
    }

    let equity = portfolioEquity;

    if (!equity) {
      const portfolio = await prisma.portfolio.findFirst({ where: { userId, mode: 'SIM' } });
      equity = portfolio ? Number(portfolio.equity) : 100000;
    }

    const validation = validateTradeRisk({
      riskVault,
      portfolioEquity: equity,
      tradeValue,
      assetClass,
      realizedLossToday: realizedLossToday ?? 0,
    });

    return reply.send(validation);
  });
}
