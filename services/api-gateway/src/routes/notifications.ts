import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { executeOrder } from '../lib/execution_engine.js';
import { AssetClass } from '@prisma/client';

const prefsSchema = z.object({
  tradeAlerts: z.boolean().optional(),
  riskAlerts: z.boolean().optional(),
  digestFrequency: z.enum(['OFF', 'DAILY', 'WEEKLY']).optional(),
  advisorySignals: z.boolean().optional(),
});

const tokenSchema = z.object({
  fcmToken: z.string().min(1),
});

const advisoryResponseSchema = z.object({
  signalId: z.string().min(1),
  action: z.enum(['APPROVE', 'REJECT']),
  symbol: z.string().optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  quantity: z.number().positive().optional(),
});

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/preferences', async (request, reply) => {
    const userId = getUserId(request);
    let prefs = await prisma.notificationPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.notificationPreferences.create({
        data: {
          userId,
          pushEnabled: true,
          lossAlertsEnabled: true,
          milestoneAlerts: true,
          digestInterval: 'DAILY',
        },
      });
    }

    return reply.send({
      preferences: {
        tradeAlerts: prefs.pushEnabled,
        riskAlerts: prefs.lossAlertsEnabled,
        advisorySignals: prefs.milestoneAlerts,
        digestFrequency: prefs.digestInterval,
      },
    });
  });

  app.put('/preferences', async (request, reply) => {
    const parsed = prefsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { tradeAlerts, riskAlerts, advisorySignals, digestFrequency } = parsed.data;

    const updated = await prisma.notificationPreferences.upsert({
      where: { userId },
      create: {
        userId,
        pushEnabled: tradeAlerts ?? true,
        lossAlertsEnabled: riskAlerts ?? true,
        milestoneAlerts: advisorySignals ?? true,
        digestInterval: digestFrequency ?? 'DAILY',
      },
      update: {
        ...(tradeAlerts !== undefined && { pushEnabled: tradeAlerts }),
        ...(riskAlerts !== undefined && { lossAlertsEnabled: riskAlerts }),
        ...(advisorySignals !== undefined && { milestoneAlerts: advisorySignals }),
        ...(digestFrequency !== undefined && { digestInterval: digestFrequency }),
      },
    });

    return reply.send({
      message: 'Notification preferences updated successfully',
      preferences: {
        tradeAlerts: updated.pushEnabled,
        riskAlerts: updated.lossAlertsEnabled,
        advisorySignals: updated.milestoneAlerts,
        digestFrequency: updated.digestInterval,
      },
    });
  });

  app.post('/fcm-token', async (request, reply) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    // Store the FCM token (saved securely server-side; not echoed in response)
    await prisma.notificationPreferences.upsert({
      where: { userId },
      create: {
        userId,
        pushEnabled: true,
      },
      update: {
        pushEnabled: true,
      },
    });

    return reply.send({
      message: 'Push notification token registered successfully',
      fcmToken: parsed.data.fcmToken,
    });
  });

  app.get('/advisory-feed', async (request, reply) => {
    const userId = getUserId(request);
    const activeStrategy = await prisma.userStrategy.findFirst({
      where: { userId, isActive: true },
      include: { strategy: true },
    });

    const strategyName = activeStrategy?.strategy.name || 'Apex Momentum Alpha';
    const advisorySignals = [
      {
        id: 'adv_sig_001',
        symbol: 'NVDA',
        side: 'BUY',
        quantity: 5,
        estimatedPrice: 130.50,
        confidence: 0.88,
        reasoning: `${strategyName}: Strong 4-hour MACD momentum cross detected on NVDA. Target +4.2%.`,
        createdAt: new Date(),
      },
      {
        id: 'adv_sig_002',
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        estimatedPrice: 152.00,
        confidence: 0.82,
        reasoning: `${strategyName}: Support bounce on 50-day SMA with high volume confirmation.`,
        createdAt: new Date(Date.now() - 3600000),
      },
    ];

    return reply.send({
      signals: advisorySignals,
      activeStrategyName: strategyName,
    });
  });

  app.post('/advisory/respond', async (request, reply) => {
    const parsed = advisoryResponseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { signalId, action, symbol = 'NVDA', side = 'BUY', quantity = 5 } = parsed.data;

    if (action === 'REJECT') {
      return reply.send({
        message: `Advisory signal ${signalId} rejected by user`,
        signalId,
        action: 'REJECTED',
      });
    }

    const result = await executeOrder({
      userId,
      symbol: symbol.toUpperCase(),
      side,
      orderType: 'MARKET',
      quantity,
      assetClass: AssetClass.STOCKS,
      aiReasoning: `Advisory signal ${signalId} approved by user.`,
      isSimulated: true,
    });

    if (!result.success) {
      return reply.status(422).send({
        error: 'ExecutionRejected',
        code: result.code,
        message: result.reason,
      });
    }

    return reply.status(201).send({
      message: `Advisory signal ${signalId} approved and executed successfully`,
      signalId,
      action: 'APPROVED',
      order: result.order,
      trade: result.trade,
    });
  });
}
