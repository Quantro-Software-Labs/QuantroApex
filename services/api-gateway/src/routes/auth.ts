import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../lib/auth.js';
import { getUserId } from '../plugins/auth.js';

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

async function issueTokens(
  app: FastifyInstance,
  userId: string,
  email: string,
) {
  const accessToken = app.jwt.sign({ sub: userId, email });
  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: getRefreshTokenExpiry(),
    },
  });

  return { accessToken, refreshToken };
}

// Consistent user shape — never include passwordHash
function safeUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  experienceLevel: string;
  onboardingCompletedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    experienceLevel: user.experienceLevel,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // Per-route stricter rate limits on auth endpoints
  app.post(
    '/register',
    { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Invalid registration data',
          details: parsed.error.flatten(),
        });
      }

      const { email, password, firstName, lastName } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'Email already registered',
          details: {},
        });
      }

      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          firstName,
          lastName,
          profile: { create: {} },
          onboardingProgress: { create: { path: 'NEWCOMER', currentStep: 1 } },
          agentState: { create: {} },
          notificationPrefs: { create: {} },
          portfolios: {
            create: [
              { mode: 'LIVE', cashBalance: 0, equity: 0 },
              { mode: 'SIM', cashBalance: 100000, equity: 100000 },
            ],
          },
        },
      });

      const tokens = await issueTokens(app, user.id, user.email);

      return reply.status(201).send({
        user: safeUser(user),
        ...tokens,
      });
    },
  );

  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Invalid login credentials format',
          details: parsed.error.flatten(),
        });
      }

      const { email, password } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      // Constant-time-safe: always check password even if user is not found
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password',
          details: {},
        });
      }

      const tokens = await issueTokens(app, user.id, user.email);

      return reply.send({
        user: safeUser(user),
        ...tokens,
      });
    },
  );

  app.post('/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid refresh token format',
        details: parsed.error.flatten(),
      });
    }

    const tokenHash = hashToken(parsed.data.refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
        details: {},
      });
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });
    const tokens = await issueTokens(app, stored.user.id, stored.user.email);

    return reply.send(tokens);
  });

  app.post('/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = getUserId(request);
    await prisma.refreshToken.deleteMany({ where: { userId } });
    return reply.send({ message: 'Logged out successfully', details: {} });
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
              // Whitelist fields — exclude proprietary rules/backtestSummary
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
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'NotFound', message: 'User not found', details: {} });
    }

    return reply.send({
      ...safeUser(user),
      profile: user.profile,
      onboardingProgress: user.onboardingProgress,
      agentState: user.agentState,
    });
  });
}
