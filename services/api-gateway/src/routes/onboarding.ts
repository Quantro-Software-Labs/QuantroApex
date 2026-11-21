import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findUserBundle,
  updateUser,
  upsertOnboardingProgress,
  findOnboardingProgress,
  upsertUserProfile,
  upsertRiskVault,
  upsertNotificationPrefs,
  findStrategyByIdOrSlug,
  findFirstStrategy,
  upsertUserStrategy,
  upsertAgentState,
} from '../lib/db/repos.js';
import type { DigestInterval } from '../lib/db/types.js';
import { getUserId } from '../plugins/auth.js';
import { safeProfile } from './auth.js';
import { percentInputSchema, toDecimalFraction } from '../lib/risk/limit_helpers.js';

const pathSchema = z.object({
  path: z.enum(['NEWCOMER', 'EXPRESS']),
  experienceLevel: z.enum(['NEWCOMER', 'INTERMEDIATE', 'PROFESSIONAL']).optional(),
});

const stepSchema = z.object({
  currentStep: z.number().int().min(1).max(20),
  // Restrict state values to primitives only — prevents arbitrary JSON injection
  state: z
    .record(z.union([z.string().max(500), z.number(), z.boolean()]))
    .optional(),
});

const completeSchema = z.object({
  experienceLevel: z.enum(['NEWCOMER', 'INTERMEDIATE', 'PROFESSIONAL']).default('NEWCOMER'),
  globalBrainConsent: z.boolean().default(false),
  riskProfile: z.record(z.any()).optional(),
  tradingCapital: z.number().positive(),
  preferredTradingMode: z.enum(['SIM', 'LIVE']).default('SIM'),
  strategyId: z.string().optional(),
  riskVault: z.object({
    dailyLossLimit: z.number().positive(),
    maxDrawdown: percentInputSchema,
    perTradeExposure: percentInputSchema,
    cryptoEnabled: z.boolean().default(false),
    stocksEnabled: z.boolean().default(true),
    forexEnabled: z.boolean().default(false),
  }),
  notificationPrefs: z.object({
    digestInterval: z.string().default('daily'),
    milestoneAlerts: z.boolean().default(true),
    lossThresholdPct: z.number().optional(),
    lossAlertsEnabled: z.boolean().default(true),
    pushEnabled: z.boolean().default(true),
  }).optional(),
});

export async function onboardingRoutes(app: FastifyInstance) {
  // All onboarding routes require authentication
  app.addHook('preHandler', app.authenticate);

  app.get('/progress', async (request, reply) => {
    const userId = getUserId(request);
    const user = await findUserBundle(userId);

    if (!user) {
      return reply.status(404).send({ error: 'NotFound', message: 'User not found' });
    }

    return reply.send({
      experienceLevel: user.experienceLevel,
      onboardingCompletedAt: user.onboardingCompletedAt,
      progress: user.onboardingProgress,
      profile: safeProfile(user.profile),
      riskVault: user.riskVault,
      notificationPrefs: user.notificationPrefs,
    });
  });

  app.post('/path', async (request, reply) => {
    const parsed = pathSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { path, experienceLevel } = parsed.data;

    const updatedUser = await updateUser(userId, {
      experienceLevel: experienceLevel ?? (path === 'EXPRESS' ? 'PROFESSIONAL' : 'NEWCOMER'),
    });
    const progress = await upsertOnboardingProgress(userId, {
      path,
      currentStep: 1,
    });

    return reply.send({
      experienceLevel: updatedUser.experienceLevel,
      progress,
    });
  });

  app.post('/step', async (request, reply) => {
    const parsed = stepSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { currentStep, state } = parsed.data;

    const existingProgress = await findOnboardingProgress(userId);
    const mergedState = {
      ...((existingProgress?.state as object) ?? {}),
      ...(state ?? {}),
    };

    const progress = await upsertOnboardingProgress(userId, {
      currentStep,
      state: mergedState,
    });

    return reply.send({ progress });
  });

  app.post('/complete', async (request, reply) => {
    const parsed = completeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const data = parsed.data;
    const now = new Date();

    // Percent inputs (0 < value <= 100): divide by 100 to store decimal fraction.
    // 1 is 1% (0.01), never 100%.
    const maxDrawdown = toDecimalFraction(data.riskVault.maxDrawdown);
    const perTradeExposure = toDecimalFraction(data.riskVault.perTradeExposure);

    // 1. Update User
    await updateUser(userId, {
      experienceLevel: data.experienceLevel,
      onboardingCompletedAt: now,
    });

    // 2. Upsert Profile
    await upsertUserProfile(userId, {
      riskProfile: data.riskProfile ?? {},
      tradingCapital: data.tradingCapital,
      preferredTradingMode: data.preferredTradingMode,
      globalBrainConsent: data.globalBrainConsent,
    });

    // 3. Upsert four Risk Vaults (STOCKS, CRYPTO, FOREX, GLOBAL)
    // Store exactly what the user chose — no loosening multipliers!
    const vaultBase = {
      dailyLossLimit: data.riskVault.dailyLossLimit,
      maxDrawdown,
      perTradeExposure,
      cryptoEnabled: data.riskVault.cryptoEnabled,
      stocksEnabled: data.riskVault.stocksEnabled,
      forexEnabled: data.riskVault.forexEnabled,
    };
    await Promise.all([
      upsertRiskVault(userId, {
        ...vaultBase,
        assetClass: 'STOCKS',
        assetsEnabled: data.riskVault.stocksEnabled,
      }),
      upsertRiskVault(userId, {
        ...vaultBase,
        assetClass: 'CRYPTO',
        assetsEnabled: data.riskVault.cryptoEnabled,
      }),
      upsertRiskVault(userId, {
        ...vaultBase,
        assetClass: 'FOREX',
        assetsEnabled: data.riskVault.forexEnabled,
      }),
      upsertRiskVault(userId, {
        ...vaultBase,
        assetClass: 'GLOBAL',
        assetsEnabled: true,
      }),
    ]);

    // 4. Upsert Notification Preferences
    if (data.notificationPrefs) {
      const rawInterval = (data.notificationPrefs.digestInterval || 'DAILY').toUpperCase();
      const digestInterval = (
        ['OFF', 'DAILY', 'WEEKLY'].includes(rawInterval) ? rawInterval : 'DAILY'
      ) as DigestInterval;

      await upsertNotificationPrefs(userId, {
        digestInterval,
        milestoneAlerts: data.notificationPrefs.milestoneAlerts,
        lossThresholdPct: data.notificationPrefs.lossThresholdPct,
        lossAlertsEnabled: data.notificationPrefs.lossAlertsEnabled,
        pushEnabled: data.notificationPrefs.pushEnabled,
      });
    }

    // 5. Upsert Onboarding Progress
    await upsertOnboardingProgress(userId, {
      path: data.experienceLevel === 'PROFESSIONAL' ? 'EXPRESS' : 'NEWCOMER',
      currentStep: 9,
      completedAt: now,
    });

    // 6. Connect Strategy safely if provided or pick default
    let strategyToConnect: string | null = null;
    if (data.strategyId) {
      let strat = await findStrategyByIdOrSlug(data.strategyId);
      if (!strat && data.strategyId.includes('_')) {
        strat = await findStrategyByIdOrSlug(data.strategyId.replace(/_/g, '-'));
      }
      if (strat) {
        strategyToConnect = strat.id;
      }
    }

    if (!strategyToConnect) {
      const defaultStrat = await findFirstStrategy({});
      if (defaultStrat) {
        strategyToConnect = defaultStrat.id;
      }
    }

    if (strategyToConnect) {
      await upsertUserStrategy(userId, strategyToConnect);
      await upsertAgentState(userId, {
        currentStrategyId: strategyToConnect,
        phase: 'SEED',
      });
    }

    return reply.send({
      message: 'Onboarding completed successfully',
      completedAt: now,
    });
  });
}
