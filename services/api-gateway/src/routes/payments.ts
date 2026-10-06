import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUserId } from '../plugins/auth.js';
import { paystackClient } from '../lib/payments/paystack_client.js';

const initializeSchema = z.object({
  amount: z.number().positive(), // Naira; converted to kobo
  email: z.string().email().optional(),
  currency: z.string().default('NGN').optional(),
  callbackUrl: z.string().url().optional(),
  plan: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const verifySchema = z.object({
  reference: z.string().min(1),
});

const subscriptionSchema = z.object({
  plan: z.string().min(1),
  customer: z.string().min(1).optional(),
  startDate: z.string().optional(),
});

export async function paymentRoutes(app: FastifyInstance) {
  // Webhook — no auth (verified via Paystack signature)
  app.post('/webhook', async (request, reply) => {
    const signature = String(request.headers['x-paystack-signature'] || '');
    const rawBody =
      typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body ?? {});

    const valid = await paystackClient.verifyWebhookSignature(rawBody, signature);
    if (!valid && paystackClient.isConfigured()) {
      return reply.status(401).send({ error: 'InvalidSignature' });
    }

    const event = (typeof request.body === 'object' ? request.body : {}) as {
      event?: string;
      data?: { reference?: string; status?: string; amount?: number };
    };

    process.stdout.write(
      JSON.stringify({
        event: 'paystack_webhook',
        type: event.event,
        reference: event.data?.reference,
        timestamp: new Date().toISOString(),
      }) + '\n',
    );

    return reply.send({ received: true });
  });

  app.register(async (authed) => {
    authed.addHook('preHandler', app.authenticate);

    authed.post('/initialize', async (request, reply) => {
      const parsed = initializeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parsed.error.flatten(),
        });
      }

      const userId = getUserId(request);
      const email = parsed.data.email || request.user.email;
      if (!email) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'email is required',
        });
      }

      const amountKobo = Math.round(parsed.data.amount * 100);
      const result = await paystackClient.initializeTransaction({
        email,
        amount: amountKobo,
        currency: parsed.data.currency ?? 'NGN',
        callbackUrl: parsed.data.callbackUrl,
        plan: parsed.data.plan,
        metadata: { ...parsed.data.metadata, userId },
      });

      return reply.status(201).send({
        authorizationUrl: result.authorizationUrl,
        accessCode: result.accessCode,
        reference: result.reference,
        publicKey: paystackClient.getPublicKey(),
      });
    });

    authed.get('/verify/:reference', async (request, reply) => {
      const { reference } = request.params as { reference: string };
      const parsed = verifySchema.safeParse({ reference });
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parsed.error.flatten(),
        });
      }

      const result = await paystackClient.verifyTransaction(parsed.data.reference);
      return reply.send({
        verified: result.status,
        reference: result.reference,
        amount: result.amount,
        currency: result.currency,
        paidAt: result.paidAt,
      });
    });

    authed.post('/subscriptions', async (request, reply) => {
      const parsed = subscriptionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parsed.error.flatten(),
        });
      }

      const customer = parsed.data.customer || request.user.email;
      if (!customer) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'customer email is required',
        });
      }

      const result = await paystackClient.createSubscription({
        customer,
        plan: parsed.data.plan,
        startDate: parsed.data.startDate,
      });

      return reply.status(201).send({
        subscriptionCode: result.subscriptionCode,
        emailToken: result.emailToken,
        status: result.status,
      });
    });
  });
}

/** Alias for agents that import paymentsRoutes */
export const paymentsRoutes = paymentRoutes;
