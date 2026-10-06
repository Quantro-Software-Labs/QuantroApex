import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { validateTradeRisk } from '../lib/risk_enforcer.js';

const updateVaultSchema = z.object({
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX', 'GLOBAL']).default('STOCKS'),
  dailyLossLimit: z.number().positive(),
  maxDrawdown: z.number().min(0.01).max(1.0),
  perTradeExposure: z.number().min(0.01).max(1.0),
  assetsEnabled: z.boolean().optional(),
  cryptoEnabled: z.boolean().optional(),
  stocksEnabled: z.boolean().optional(),
  forexEnabled: z.boolean().optional(),
});

const validateTradeSchema = z.object({
  tradeValue: z.number().positive(),
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).default('STOCKS'),
  portfolioEquity: z.number().positive().optional(),
  peakEquity: z.number().positive().optional(),
  realizedLossToday: z.number().optional(),
  globalRealizedLossToday: z.number().optional(),
});

export async function riskVaultRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const { assetClass } = request.query as { assetClass?: string };
    const cls = (assetClass?.toUpperCase() || 'STOCKS') as
      | 'STOCKS'
      | 'CRYPTO'
      | 'FOREX'
      | 'GLOBAL';

    let riskVault = await prisma.riskVault.findUnique({
      where: { userId_assetClass: { userId, assetClass: cls } },
    });

    if (!riskVault) {
      riskVault = await prisma.riskVault.create({
        data: {
          userId,
          assetClass: cls,
          dailyLossLimit: cls === 'GLOBAL' ? 1000 : 500,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          assetsEnabled: cls === 'STOCKS' || cls === 'GLOBAL',
        },
      });
    }

    const globalVault = await prisma.riskVault.findUnique({
      where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
    });

    return reply.send({
      riskVault,
      globalVault,
      isEmergencyStopped:
        Boolean(riskVault.emergencyStop || riskVault.emergencyStoppedAt) ||
        Boolean(globalVault?.emergencyStop || globalVault?.emergencyStoppedAt),
    });
  });

  app.get('/all', async (request, reply) => {
    const userId = getUserId(request);
    const vaults = await prisma.riskVault.findMany({ where: { userId } });
    return reply.send({ vaults });
  });

  app.put('/', async (request, reply) => {
    const parsed = updateVaultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const data = parsed.data;

    const riskVault = await prisma.riskVault.upsert({
      where: { userId_assetClass: { userId, assetClass: data.assetClass } },
      create: {
        userId,
        assetClass: data.assetClass,
        dailyLossLimit: data.dailyLossLimit,
        maxDrawdown: data.maxDrawdown,
        perTradeExposure: data.perTradeExposure,
        assetsEnabled: data.assetsEnabled ?? true,
        cryptoEnabled: data.cryptoEnabled ?? false,
        stocksEnabled: data.stocksEnabled ?? true,
        forexEnabled: data.forexEnabled ?? false,
      },
      update: {
        dailyLossLimit: data.dailyLossLimit,
        maxDrawdown: data.maxDrawdown,
        perTradeExposure: data.perTradeExposure,
        ...(data.assetsEnabled !== undefined && { assetsEnabled: data.assetsEnabled }),
        ...(data.cryptoEnabled !== undefined && { cryptoEnabled: data.cryptoEnabled }),
        ...(data.stocksEnabled !== undefined && { stocksEnabled: data.stocksEnabled }),
        ...(data.forexEnabled !== undefined && { forexEnabled: data.forexEnabled }),
      },
    });

    return reply.send({ riskVault });
  });

  app.post('/emergency-stop', async (request, reply) => {
    const userId = getUserId(request);
    const body = z
      .object({ assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX', 'GLOBAL']).default('GLOBAL') })
      .safeParse(request.body ?? {});
    const cls = body.success ? body.data.assetClass : 'GLOBAL';
    const now = new Date();

    const riskVault = await prisma.riskVault.upsert({
      where: { userId_assetClass: { userId, assetClass: cls } },
      create: {
        userId,
        assetClass: cls,
        dailyLossLimit: 500,
        maxDrawdown: 0.15,
        perTradeExposure: 0.05,
        emergencyStop: true,
        emergencyStoppedAt: now,
      },
      update: { emergencyStop: true, emergencyStoppedAt: now },
    });

    await prisma.agentState.upsert({
      where: { userId },
      create: { userId, isRunning: false, stoppedAt: now },
      update: { isRunning: false, stoppedAt: now },
    });

    await prisma.activityFeedEntry.create({
      data: {
        userId,
        eventType: 'EMERGENCY_STOP',
        message:
          cls === 'GLOBAL'
            ? 'Global emergency stop activated. All trading paused.'
            : `${cls} emergency stop activated.`,
      },
    });

    return reply.send({ riskVault, isEmergencyStopped: true });
  });

  app.post('/resume', async (request, reply) => {
    const userId = getUserId(request);
    const body = z
      .object({ assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX', 'GLOBAL']).default('GLOBAL') })
      .safeParse(request.body ?? {});
    const cls = body.success ? body.data.assetClass : 'GLOBAL';

    const riskVault = await prisma.riskVault.upsert({
      where: { userId_assetClass: { userId, assetClass: cls } },
      create: {
        userId,
        assetClass: cls,
        dailyLossLimit: 500,
        maxDrawdown: 0.15,
        perTradeExposure: 0.05,
        emergencyStop: false,
        emergencyStoppedAt: null,
      },
      update: { emergencyStop: false, emergencyStoppedAt: null },
    });

    await prisma.activityFeedEntry.create({
      data: {
        userId,
        eventType: 'TRADING_RESUMED',
        message: `${cls} trading resumed.`,
      },
    });

    return reply.send({ riskVault, isEmergencyStopped: false });
  });

  app.post('/validate-trade', async (request, reply) => {
    const parsed = validateTradeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const data = parsed.data;
    const [classVault, globalVault, portfolio] = await Promise.all([
      prisma.riskVault.findUnique({
        where: { userId_assetClass: { userId, assetClass: data.assetClass } },
      }),
      prisma.riskVault.findUnique({
        where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
      }),
      prisma.portfolio.findFirst({ where: { userId, mode: 'SIM' } }),
    ]);

    const result = validateTradeRisk({
      riskVault: classVault,
      globalVault,
      portfolioEquity: data.portfolioEquity ?? Number(portfolio?.equity ?? 100000),
      tradeValue: data.tradeValue,
      assetClass: data.assetClass,
      peakEquity: data.peakEquity,
      realizedLossToday: data.realizedLossToday,
      globalRealizedLossToday: data.globalRealizedLossToday,
    });

    // Legacy clients expect EMERGENCY_STOPPED for any emergency halt
    const code =
      result.code === 'GLOBAL_EMERGENCY_STOP' || result.code === 'CLASS_EMERGENCY_STOP'
        ? 'EMERGENCY_STOPPED'
        : result.code;

    return reply.send({ ...result, code });
  });
}
