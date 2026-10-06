/**
 * Paystack subscriptions — NGN plans with server-side feature gating.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { paystackClient } from '../lib/payments/paystack_client.js';
import { posthog } from '../lib/analytics/posthog_client.js';
import type { PlanTier } from '@prisma/client';

const PLAN_CODES: Record<string, string> = {
  CORE: process.env.PAYSTACK_PLAN_CORE ?? '',
  PRO: process.env.PAYSTACK_PLAN_PRO ?? '',
  ELITE: process.env.PAYSTACK_PLAN_ELITE ?? '',
};

const FEATURE_GATES: Record<string, PlanTier[]> = {
  autopilot: ['CORE', 'PRO', 'ELITE'],
  manual_desk: ['PRO', 'ELITE'],
  smc_tools: ['PRO', 'ELITE'],
  unlimited_capital: ['ELITE'],
};

export function planAllows(plan: PlanTier, feature: string): boolean {
  if (plan === 'FREE' && feature === 'advisory') return true;
  const allowed = FEATURE_GATES[feature];
  if (!allowed) return true;
  return allowed.includes(plan);
}

export async function assertPlanFeature(userId: string, feature: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = (sub?.plan ?? 'FREE') as PlanTier;
  if (!planAllows(plan, feature)) {
    const err = new Error(`Plan upgrade required for feature: ${feature}`) as Error & {
      statusCode?: number;
      name?: string;
      code?: string;
    };
    err.statusCode = 403;
    err.name = 'PLAN_REQUIRED';
    err.code = 'PLAN_REQUIRED';
    throw err;
  }
}

export async function subscriptionsRoutes(app: FastifyInstance) {
  app.post('/webhook', async (request, reply) => {
    const signature = String(request.headers['x-paystack-signature'] || '');
    const rawBody =
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    if (paystackClient.isConfigured()) {
      const valid = await paystackClient.verifyWebhookSignature(rawBody, signature);
      if (!valid) return reply.status(401).send({ error: 'InvalidSignature' });
    } else if (process.env.NODE_ENV === 'production') {
      return reply.status(503).send({ error: 'PaystackNotConfigured' });
    }

    const event = request.body as {
      event?: string;
      data?: { customer?: { email?: string }; plan?: { plan_code?: string } };
    };

    if (event.event === 'subscription.disable' && event.data?.customer?.email) {
      const user = await prisma.user.findFirst({
        where: { email: event.data.customer.email },
      });
      if (user) {
        await prisma.subscription.updateMany({
          where: { userId: user.id },
          data: { cancelledAt: new Date(), plan: 'FREE' },
        });
      }
    }

    if (event.event === 'charge.success' && event.data?.customer?.email) {
      const user = await prisma.user.findFirst({
        where: { email: event.data.customer.email },
      });
      if (user) {
        const planCode = event.data.plan?.plan_code ?? '';
        let plan: PlanTier = 'CORE';
        if (planCode === PLAN_CODES.PRO) plan = 'PRO';
        if (planCode === PLAN_CODES.ELITE) plan = 'ELITE';
        await prisma.subscription.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            plan,
            paystackEmail: event.data.customer.email,
            activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          update: {
            plan,
            cancelledAt: null,
            activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    return reply.send({ received: true });
  });

  app.register(async (authed) => {
    authed.addHook('preHandler', app.authenticate);

    authed.post('/initialise', async (request, reply) => {
      const schema = z.object({
        plan: z.enum(['CORE', 'PRO', 'ELITE']),
        email: z.string().email().optional(),
        callbackUrl: z.string().url().optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }

      const userId = getUserId(request);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const email = parsed.data.email || user?.email;
      if (!email) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Email is required for Paystack checkout',
        });
      }

      const planCode = PLAN_CODES[parsed.data.plan];
      const amounts: Record<string, number> = { CORE: 2900000, PRO: 7900000, ELITE: 19900000 };
      const result = await paystackClient.initializeTransaction({
        email,
        amount: amounts[parsed.data.plan],
        plan: planCode || undefined,
        callbackUrl: parsed.data.callbackUrl,
        metadata: { userId, plan: parsed.data.plan },
      });

      posthog.capture({
        distinctId: userId,
        event: 'upgrade_viewed',
        properties: { plan: parsed.data.plan },
      });

      return reply.status(201).send({
        authorizationUrl: result.authorizationUrl,
        accessCode: result.accessCode,
        reference: result.reference,
        publicKey: paystackClient.getPublicKey(),
      });
    });

    authed.post('/verify', async (request, reply) => {
      const schema = z.object({
        reference: z.string().min(1),
        plan: z.enum(['CORE', 'PRO', 'ELITE']).default('CORE'),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError' });
      }

      const userId = getUserId(request);
      const result = await paystackClient.verifyTransaction(parsed.data.reference);
      if (result.status !== 'success') {
        return reply.status(400).send({ error: 'PaymentNotSuccessful', status: result.status });
      }

      const sub = await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: parsed.data.plan,
          paystackCode: parsed.data.reference,
          activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          plan: parsed.data.plan,
          paystackCode: parsed.data.reference,
          cancelledAt: null,
          activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      posthog.capture({
        distinctId: userId,
        event: 'upgrade_completed',
        properties: { plan: parsed.data.plan },
      });

      return reply.send({ subscription: sub });
    });

    authed.get('/current', async (request, reply) => {
      const userId = getUserId(request);
      const sub = await prisma.subscription.findUnique({ where: { userId } });
      const plan = sub?.plan ?? 'FREE';
      return reply.send({
        plan,
        activeUntil: sub?.activeUntil ?? null,
        cancelledAt: sub?.cancelledAt ?? null,
        features: {
          advisory: true,
          simulation: true,
          autopilot: planAllows(plan, 'autopilot'),
          manualDesk: planAllows(plan, 'manual_desk'),
          smcTools: planAllows(plan, 'smc_tools'),
          unlimitedCapital: planAllows(plan, 'unlimited_capital'),
        },
      });
    });

    authed.post('/cancel', async (request, reply) => {
      const userId = getUserId(request);
      const sub = await prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan: 'FREE', cancelledAt: new Date() },
        update: { cancelledAt: new Date(), plan: 'FREE' },
      });
      return reply.send({ subscription: sub });
    });
  });
}
