import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { AssetClass, RiskLevel } from '@prisma/client';

const querySchema = z.object({
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).optional(),
  riskLevel: z.enum(['CONSERVATIVE', 'GROWTH', 'AGGRESSIVE', 'EXPERIMENTAL']).optional(),
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(50).default(20),
});

const selectSchema = z.object({
  strategyId: z.string().min(1),
});

export async function strategyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    const filters: any = { isActive: true };
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;

    if (parsed.success) {
      if (parsed.data.assetClass) filters.assetClass = parsed.data.assetClass;
      if (parsed.data.riskLevel) filters.riskLevel = parsed.data.riskLevel;
    }

    const [strategies, total] = await Promise.all([
      prisma.strategy.findMany({
        where: filters,
        orderBy: { activeUserCount: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.strategy.count({ where: filters }),
    ]);

    return reply.send({
      strategies,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  app.get('/recommended', async (request, reply) => {
    const userId = getUserId(request);

    // Select only the fields needed — avoids over-fetching profile/full riskVault
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        experienceLevel: true,
        riskVault: {
          select: { stocksEnabled: true, cryptoEnabled: true, forexEnabled: true },
        },
      },
    });

    const riskVault = user?.riskVault;
    const allowedAssetClasses: AssetClass[] = [];
    if (riskVault?.stocksEnabled ?? true) allowedAssetClasses.push(AssetClass.STOCKS);
    if (riskVault?.cryptoEnabled) allowedAssetClasses.push(AssetClass.CRYPTO);
    if (riskVault?.forexEnabled) allowedAssetClasses.push(AssetClass.FOREX);

    let targetRisk: RiskLevel = RiskLevel.GROWTH;
    if (user?.experienceLevel === 'NEWCOMER') {
      targetRisk = RiskLevel.CONSERVATIVE;
    } else if (user?.experienceLevel === 'PROFESSIONAL') {
      targetRisk = RiskLevel.AGGRESSIVE;
    }

    const effectiveAssetClasses =
      allowedAssetClasses.length > 0 ? allowedAssetClasses : [AssetClass.STOCKS];

    // Single query: fetch target risk first, then fill remainder with any other active strategies
    const recommended = await prisma.strategy.findMany({
      where: {
        isActive: true,
        assetClass: { in: effectiveAssetClasses },
      },
      orderBy: [{ riskLevel: 'asc' }, { activeUserCount: 'desc' }],
      take: 6, // fetch extra to allow client-side risk preference filtering
    });

    // Sort preferred risk level first
    const sorted = [
      ...recommended.filter((s) => s.riskLevel === targetRisk),
      ...recommended.filter((s) => s.riskLevel !== targetRisk),
    ].slice(0, 3);

    return reply.send({ recommended: sorted });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const strategy = await prisma.strategy.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
    });

    if (!strategy) {
      return reply.status(404).send({ error: 'NotFound', message: 'Strategy not found', details: {} });
    }

    return reply.send({ strategy });
  });

  app.post('/select', async (request, reply) => {
    const parsed = selectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid strategy selection',
        details: parsed.error.flatten(),
      });
    }

    const userId = getUserId(request);
    const { strategyId } = parsed.data;

    const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      return reply.status(404).send({ error: 'NotFound', message: 'Strategy not found', details: {} });
    }

    const [userStrategy, agentState] = await prisma.$transaction([
      prisma.userStrategy.upsert({
        where: { userId_strategyId: { userId, strategyId } },
        create: { userId, strategyId, isActive: true },
        update: { isActive: true },
      }),
      prisma.agentState.upsert({
        where: { userId },
        create: { userId, currentStrategyId: strategyId, phase: 'SEED' },
        update: { currentStrategyId: strategyId },
      }),
      prisma.strategy.update({
        where: { id: strategyId },
        data: { activeUserCount: { increment: 1 } },
      }),
    ]);

    return reply.send({
      message: 'Strategy selected successfully',
      userStrategy,
      agentState,
      strategy,
    });
  });
}
