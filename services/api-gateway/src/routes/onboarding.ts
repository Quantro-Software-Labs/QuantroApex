import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';

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
    maxDrawdown: z.number().min(0.01).max(1.0),
    perTradeExposure: z.number().min(0.01).max(1.0),
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        onboardingProgress: true,
        riskVault: true,
        notificationPrefs: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'NotFound', message: 'User not found' });
    }

    return reply.send({
      experienceLevel: user.experienceLevel,
      onboardingCompletedAt: user.onboardingCompletedAt,
      progress: user.onboardingProgress,
      profile: user.profile,
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

    const [updatedUser, progress] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          experienceLevel: experienceLevel ?? (path === 'EXPRESS' ? 'PROFESSIONAL' : 'NEWCOMER'),
        },
      }),
      prisma.onboardingProgress.upsert({
        where: { userId },
        create: {
          userId,
          path,
          currentStep: 1,
        },
        update: {
          path,
          currentStep: 1,
        },
      }),
    ]);

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

    const existingProgress = await prisma.onboardingProgress.findUnique({ where: { userId } });
    const mergedState = {
      ...((existingProgress?.state as object) ?? {}),
      ...(state ?? {}),
    };

    const progress = await prisma.onboardingProgress.upsert({
      where: { userId },
      create: {
        userId,
        currentStep,
        state: mergedState,
      },
      update: {
        currentStep,
        state: mergedState,
      },
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

    await prisma.$transaction(async (tx) => {
      // 1. Update User
      await tx.user.update({
        where: { id: userId },
        data: {
          experienceLevel: data.experienceLevel,
          onboardingCompletedAt: now,
        },
      });

      // 2. Upsert Profile
      await tx.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          riskProfile: data.riskProfile ?? {},
          tradingCapital: data.tradingCapital,
          preferredTradingMode: data.preferredTradingMode,
          globalBrainConsent: data.globalBrainConsent,
        },
        update: {
          riskProfile: data.riskProfile ?? {},
          tradingCapital: data.tradingCapital,
          preferredTradingMode: data.preferredTradingMode,
          globalBrainConsent: data.globalBrainConsent,
        },
      });

      // 3. Upsert Risk Vault
      await tx.riskVault.upsert({
        where: { userId },
        create: {
          userId,
          dailyLossLimit: data.riskVault.dailyLossLimit,
          maxDrawdown: data.riskVault.maxDrawdown,
          perTradeExposure: data.riskVault.perTradeExposure,
          cryptoEnabled: data.riskVault.cryptoEnabled,
          stocksEnabled: data.riskVault.stocksEnabled,
          forexEnabled: data.riskVault.forexEnabled,
        },
        update: {
          dailyLossLimit: data.riskVault.dailyLossLimit,
          maxDrawdown: data.riskVault.maxDrawdown,
          perTradeExposure: data.riskVault.perTradeExposure,
          cryptoEnabled: data.riskVault.cryptoEnabled,
          stocksEnabled: data.riskVault.stocksEnabled,
          forexEnabled: data.riskVault.forexEnabled,
        },
      });

      // 4. Upsert Notification Preferences
      if (data.notificationPrefs) {
        const rawInterval = (data.notificationPrefs.digestInterval || 'DAILY').toUpperCase();
        const digestInterval = (['OFF', 'DAILY', 'WEEKLY'].includes(rawInterval) ? rawInterval : 'DAILY') as any;

        await tx.notificationPreferences.upsert({
          where: { userId },
          create: {
            userId,
            digestInterval,
            milestoneAlerts: data.notificationPrefs.milestoneAlerts,
            lossThresholdPct: data.notificationPrefs.lossThresholdPct,
            lossAlertsEnabled: data.notificationPrefs.lossAlertsEnabled,
            pushEnabled: data.notificationPrefs.pushEnabled,
          },
          update: {
            digestInterval,
            milestoneAlerts: data.notificationPrefs.milestoneAlerts,
            lossThresholdPct: data.notificationPrefs.lossThresholdPct,
            lossAlertsEnabled: data.notificationPrefs.lossAlertsEnabled,
            pushEnabled: data.notificationPrefs.pushEnabled,
          },
        });
      }

      // 5. Update Onboarding Progress
      await tx.onboardingProgress.update({
        where: { userId },
        data: {
          completedAt: now,
        },
      });

      // 6. Connect Strategy if provided
      if (data.strategyId) {
        await tx.userStrategy.upsert({
          where: { userId_strategyId: { userId, strategyId: data.strategyId } },
          create: { userId, strategyId: data.strategyId, isActive: true },
          update: { isActive: true },
        });

        await tx.agentState.upsert({
          where: { userId },
          create: { userId, currentStrategyId: data.strategyId, phase: 'SEED' },
          update: { currentStrategyId: data.strategyId },
        });
      }
    });

    return reply.send({
      message: 'Onboarding completed successfully',
      completedAt: now,
    });
  });
}
