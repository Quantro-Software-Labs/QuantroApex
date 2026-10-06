/**
 * Auth routes — Firebase owns credentials; API only exposes profile sync.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/firebase_auth.js';
import { posthog } from '../lib/analytics/posthog_client.js';
import { sendWelcomeEmail } from '../lib/email/resend_client.js';

function safeUser(user: {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  experienceLevel: string;
  preferredMarket: string;
  onboardingCompletedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    experienceLevel: user.experienceLevel,
    preferredMarket: user.preferredMarket,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

export async function authRoutes(app: FastifyInstance) {
  /** Soft redirect for old clients — password reset is Firebase-owned */
  app.post('/forgot-password', async (_request, reply) => {
    return reply.send({
      message: 'Password reset is handled by Firebase Auth.',
      provider: 'firebase',
    });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = getUserId(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        onboardingProgress: true,
        agentState: {
          include: {
            currentStrategy: {
              select: {
                id: true,
                name: true,
                slug: true,
                assetClass: true,
                riskLevel: true,
                description: true,
              },
            },
          },
        },
        subscription: true,
        kycVerification: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'NotFound', message: 'User not found' });
    }

    return reply.send({
      ...safeUser(user),
      profile: user.profile,
      onboardingProgress: user.onboardingProgress,
      agentState: user.agentState,
      subscription: user.subscription,
      kycVerification: user.kycVerification,
    });
  });

  app.patch('/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(120).optional(),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      preferredMarket: z.string().min(2).max(64).optional(),
      experienceLevel: z.enum(['NEWCOMER', 'INTERMEDIATE', 'PROFESSIONAL']).optional(),
      globalBrainConsent: z.boolean().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { name, firstName, lastName, preferredMarket, experienceLevel, globalBrainConsent } =
      parsed.data;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(preferredMarket !== undefined && { preferredMarket }),
        ...(experienceLevel !== undefined && { experienceLevel }),
      },
    });

    if (globalBrainConsent !== undefined) {
      await prisma.userProfile.upsert({
        where: { userId },
        create: { userId, globalBrainConsent },
        update: { globalBrainConsent },
      });
    }

    posthog.capture({
      distinctId: userId,
      event: 'profile_updated',
      properties: { preferred_market: preferredMarket },
    });

    return reply.send({ message: 'Profile updated', user: safeUser(user) });
  });

  /** Alias for PATCH /users/profile per product brief */
  app.put('/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    return app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      headers: request.headers as Record<string, string>,
      payload: request.body as object,
    }).then((res) => reply.status(res.statusCode).send(res.json()));
  });

  app.post('/welcome-email', { preHandler: [app.authenticate] }, async (request, reply) => {
    const email = request.user.email;
    if (email) {
      await sendWelcomeEmail(email, request.user.email?.split('@')[0] || 'Trader');
    }
    return reply.send({ message: 'Welcome email queued' });
  });

  app.post('/logout', { preHandler: [app.authenticate] }, async (_request, reply) => {
    return reply.send({ message: 'Signed out. Clear the Firebase session on the client.' });
  });
}

export { getUserId };
