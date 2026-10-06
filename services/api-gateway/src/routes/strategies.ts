import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listStrategies,
  findStrategyByIdOrSlug,
  findStrategyById,
  upsertUserStrategy,
  upsertAgentState,
  incrementStrategyActiveUsers,
  findUserById,
  findRiskVault,
} from '../lib/db/repos.js';
import type { AssetClass, RiskLevel } from '../lib/db/types.js';
import { getUserId } from '../plugins/auth.js';

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
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;

    const { strategies, total } = await listStrategies({
      assetClass: parsed.success ? parsed.data.assetClass : undefined,
      riskLevel: parsed.success ? parsed.data.riskLevel : undefined,
      skip: (page - 1) * limit,
      take: limit,
    });

    return reply.send({
      strategies,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  app.get('/recommended', async (request, reply) => {
    const userId = getUserId(request);

    const [user, riskVault] = await Promise.all([
      findUserById(userId),
      findRiskVault(userId),
    ]);

    const allowedAssetClasses: AssetClass[] = [];
    if (riskVault?.stocksEnabled ?? true) allowedAssetClasses.push('STOCKS');
    if (riskVault?.cryptoEnabled) allowedAssetClasses.push('CRYPTO');
    if (riskVault?.forexEnabled) allowedAssetClasses.push('FOREX');

    let targetRisk: RiskLevel = 'GROWTH';
    if (user?.experienceLevel === 'NEWCOMER') {
      targetRisk = 'CONSERVATIVE';
    } else if (user?.experienceLevel === 'PROFESSIONAL') {
      targetRisk = 'AGGRESSIVE';
    }

    const effectiveAssetClasses =
      allowedAssetClasses.length > 0 ? allowedAssetClasses : (['STOCKS'] as AssetClass[]);

    const { strategies: recommended } = await listStrategies({ take: 20 });
    const filtered = recommended
      .filter((s) => effectiveAssetClasses.includes(s.assetClass))
      .sort((a, b) => {
        if (a.riskLevel !== b.riskLevel) return a.riskLevel.localeCompare(b.riskLevel);
        return b.activeUserCount - a.activeUserCount;
      })
      .slice(0, 6);

    const sorted = [
      ...filtered.filter((s) => s.riskLevel === targetRisk),
      ...filtered.filter((s) => s.riskLevel !== targetRisk),
    ].slice(0, 3);

    return reply.send({ recommended: sorted });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const strategy = await findStrategyByIdOrSlug(id);

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

    const strategy = await findStrategyById(strategyId);
    if (!strategy) {
      return reply.status(404).send({ error: 'NotFound', message: 'Strategy not found', details: {} });
    }

    const userStrategy = await upsertUserStrategy(userId, strategyId);
    const agentState = await upsertAgentState(userId, {
      currentStrategyId: strategyId,
      phase: 'SEED',
    });
    await incrementStrategyActiveUsers(strategyId);

    return reply.send({
      message: 'Strategy selected successfully',
      userStrategy,
      agentState,
      strategy,
    });
  });
}
