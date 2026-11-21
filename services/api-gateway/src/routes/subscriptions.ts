/**
 * Paystack subscriptions — NGN plans with server-side feature gating.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import {
  paystackClient,
  SERVER_PRICE_TABLE,
  getPlanByCodeOrName,
  PaymentsUnavailableError,
} from '../lib/payments/paystack_client.js';
import { posthog } from '../lib/analytics/posthog_client.js';
import { rawBodyPreParsingHook, RAW_BODY_MAX_BYTES } from '../lib/security/raw_body.js';
import type { PlanTier } from '@prisma/client';

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
  // Mobile store billing endpoints (Section C.5)
  // Until store billing exists, return 501 and grant nothing
  const mobileIapHandler = async (_request: any, reply: any) => {
    return reply.status(501).send({
      error: 'NOT_IMPLEMENTED',
      message: 'Mobile store in-app purchases are not supported yet.',
    });
  };

  app.post('/in-app-purchase/verify', mobileIapHandler);
  app.post('/verify-iap', mobileIapHandler);
  app.post('/mobile/verify', mobileIapHandler);

  // Paystack Webhook (Section C.4)
  // Verify x-paystack-signature as HMAC-SHA512 over RAW request body bytes using timingSafeEqual
  app.post(
    '/webhook',
    {
      bodyLimit: RAW_BODY_MAX_BYTES,
      preParsing: rawBodyPreParsingHook,
    },
    async (request, reply) => {
    const signature = String(request.headers['x-paystack-signature'] || '');
    const rawBody = (request as any).rawBody || (typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}));

    if (!paystackClient.isConfigured() && process.env.NODE_ENV !== 'test') {
      return reply.status(503).send({ error: 'PaystackNotConfigured' });
    }

    const isValid = paystackClient.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return reply.status(401).send({ error: 'InvalidSignature' });
    }

    const event = request.body as {
      event?: string;
      id?: string | number;
      data?: {
        id?: string | number;
        reference?: string;
        amount?: number;
        currency?: string;
        status?: string;
        customer?: { email?: string; customer_code?: string };
        plan?: { plan_code?: string; name?: string };
        metadata?: Record<string, any>;
        paid_at?: string;
      };
    };

    const eventReference = event.data?.reference || (event.id ? String(event.id) : undefined);

    // Idempotent processing by event reference / id
    if (eventReference) {
      const existingTx = await prisma.paymentTransaction.findUnique({
        where: { reference: eventReference },
      });
      if (existingTx) {
        return reply.send({ received: true, alreadyProcessed: true });
      }
    }

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

    if (event.event === 'charge.success' && event.data) {
      const planCode = event.data.plan?.plan_code || event.data.metadata?.plan;
      const planInfo = getPlanByCodeOrName(planCode);

      // Section C.4: An unknown plan code grants nothing and logs a warning. Never default to CORE.
      if (!planInfo) {
        app.log.warn(
          { planCode, eventReference },
          'Unknown plan code received in Paystack webhook; granting nothing.',
        );
        return reply.send({ received: true, ignored: 'UNKNOWN_PLAN' });
      }

      // Check amount and currency match price table
      const eventAmount = event.data.amount;
      const eventCurrency = event.data.currency || 'NGN';
      if (eventAmount !== planInfo.amountKobo || eventCurrency !== planInfo.currency) {
        app.log.warn(
          { eventAmount, expectedAmount: planInfo.amountKobo, eventCurrency },
          'Webhook amount or currency mismatch with server price table; granting nothing.',
        );
        return reply.send({ received: true, ignored: 'AMOUNT_MISMATCH' });
      }

      const targetEmail = event.data.customer?.email;
      const targetUserId = event.data.metadata?.userId;

      const user = targetUserId
        ? await prisma.user.findUnique({ where: { id: targetUserId } })
        : targetEmail
        ? await prisma.user.findFirst({ where: { email: targetEmail } })
        : null;

      if (user && eventReference) {
        await prisma.$transaction(async (tx) => {
          await tx.paymentTransaction.create({
            data: {
              userId: user.id,
              reference: eventReference,
              plan: planInfo.plan,
              amount: planInfo.amountKobo,
              currency: planInfo.currency,
              channel: 'paystack',
              status: 'success',
              paidAt: event.data?.paid_at ? new Date(event.data.paid_at) : new Date(),
              metadata: event.data?.metadata ?? {},
            },
          });

          await tx.subscription.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              plan: planInfo.plan,
              paystackCode: eventReference,
              paystackEmail: targetEmail || user.email,
              activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            update: {
              plan: planInfo.plan,
              paystackCode: eventReference,
              paystackEmail: targetEmail || user.email,
              cancelledAt: null,
              activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
        });
      }
    }

    return reply.send({ received: true });
  });

  app.register(async (authed) => {
    authed.addHook('preHandler', app.authenticate);

    // Section C.1: Server-side price table: plan code to amount (kobo) and currency.
    // Client sends only plan code; server sets amount.
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

      const planInfo = SERVER_PRICE_TABLE[parsed.data.plan];
      if (!planInfo) {
        return reply.status(400).send({ error: 'InvalidPlan', message: 'Unknown plan selected' });
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

      try {
        const result = await paystackClient.initializeTransaction({
          email,
          amount: planInfo.amountKobo,
          currency: planInfo.currency,
          plan: planInfo.planCode,
          callbackUrl: parsed.data.callbackUrl,
          metadata: { userId, plan: planInfo.plan, planCode: planInfo.planCode },
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
      } catch (err: any) {
        if (err instanceof PaymentsUnavailableError || err?.code === 'PAYMENTS_UNAVAILABLE') {
          return reply.status(503).send({
            error: 'PAYMENTS_UNAVAILABLE',
            message: 'Payments are currently unavailable.',
          });
        }
        throw err;
      }
    });

    // Section C.2: /subscriptions/verify
    // Ignore any plan or amount from client. Call Paystack GET /transaction/verify/:reference.
    // Grant plan only if success AND amount, currency, plan match price table AND reference belongs to user.
    // Store reference with unique constraint so it can be used once.
    authed.post('/verify', async (request, reply) => {
      const schema = z.object({
        reference: z.string().min(1),
        // Plan/amount are ignored from body if sent
        plan: z.string().optional(),
        amount: z.number().optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError' });
      }

      const userId = getUserId(request);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const reference = parsed.data.reference;

      // 1. Check unique reference constraint before calling broker
      const existingTx = await prisma.paymentTransaction.findUnique({
        where: { reference },
      });
      if (existingTx) {
        return reply.status(400).send({
          error: 'REFERENCE_ALREADY_USED',
          message: 'This payment reference has already been verified and processed.',
        });
      }

      let result;
      try {
        result = await paystackClient.verifyTransaction(reference);
      } catch (err: any) {
        if (err instanceof PaymentsUnavailableError || err?.code === 'PAYMENTS_UNAVAILABLE') {
          return reply.status(503).send({
            error: 'PAYMENTS_UNAVAILABLE',
            message: 'Payments are currently unavailable.',
          });
        }
        return reply.status(502).send({
          error: 'PaystackVerificationFailed',
          message: err?.message || 'Failed to verify transaction with payment provider',
        });
      }

      // 2. Status must be success
      if (result.status !== 'success') {
        return reply.status(400).send({ error: 'PaymentNotSuccessful', status: result.status });
      }

      // 3. Reference must belong to this user
      const txUserId = result.metadata?.userId;
      const txEmail = result.customer?.email;
      const belongsToUser =
        (txUserId && txUserId === userId) ||
        (!txUserId && txEmail && user?.email && txEmail.toLowerCase() === user.email.toLowerCase());

      if (!belongsToUser) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Payment transaction reference does not belong to this user.',
        });
      }

      // 4. Resolve plan from verification payload (server price table), NEVER from client body
      const verifiedPlanCode = result.planCode || result.metadata?.planCode || result.metadata?.plan;
      const planInfo = getPlanByCodeOrName(verifiedPlanCode);

      if (!planInfo) {
        return reply.status(400).send({
          error: 'UNKNOWN_PLAN',
          message: 'Transaction plan could not be identified or is unknown.',
        });
      }

      // 5. Amount & currency must strictly match the price table
      if (result.amount !== planInfo.amountKobo || (result.currency && result.currency !== planInfo.currency)) {
        return reply.status(400).send({
          error: 'PLAN_AMOUNT_MISMATCH',
          message: `Payment amount (${result.amount} ${result.currency}) does not match price table for plan ${planInfo.plan} (${planInfo.amountKobo} ${planInfo.currency}).`,
        });
      }

      // 6. Grant plan in a transaction and store reference with unique constraint
      const sub = await prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.create({
          data: {
            userId,
            reference,
            plan: planInfo.plan,
            amount: planInfo.amountKobo,
            currency: planInfo.currency,
            channel: 'paystack',
            status: 'success',
            paidAt: result.paidAt ? new Date(result.paidAt) : new Date(),
            metadata: result.metadata ?? {},
          },
        });

        return tx.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: planInfo.plan,
            paystackCode: reference,
            paystackEmail: user?.email,
            activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          update: {
            plan: planInfo.plan,
            paystackCode: reference,
            paystackEmail: user?.email,
            cancelledAt: null,
            activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      });

      posthog.capture({
        distinctId: userId,
        event: 'upgrade_completed',
        properties: { plan: planInfo.plan },
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
