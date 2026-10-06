/**
 * Firebase Auth middleware for Fastify.
 * Verifies Firebase ID tokens and upserts the local Prisma user.
 */
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';

export interface AuthUser {
  /** Internal Prisma user id */
  id: string;
  sub: string;
  firebaseUid: string;
  email: string | null;
  phone: string | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthUser;
    firebaseUid?: string;
    userEmail?: string | null;
    userId?: string;
  }
}

let firebaseApp: App | null = null;

export function initFirebaseAdmin(): void {
  if (firebaseApp || getApps().length > 0) {
    firebaseApp = getApps()[0] ?? firebaseApp;
    return;
  }

  const { projectId, clientEmail, privateKey } = config.firebase;
  if (!projectId || !clientEmail || !privateKey) {
    return;
  }

  firebaseApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getUserId(request: FastifyRequest): string {
  return request.user.sub;
}

export function getFirebaseUid(request: FastifyRequest): string {
  return request.user.firebaseUid;
}

async function upsertLocalUser(decoded: DecodedIdToken) {
  const email = decoded.email ?? null;
  const phone = decoded.phone_number ?? null;
  const name =
    decoded.name ||
    [decoded.email?.split('@')[0], phone].filter(Boolean).join(' ') ||
    'QuantroApex User';

  const user = await prisma.user.upsert({
    where: { firebaseUid: decoded.uid },
    update: {
      lastSeenAt: new Date(),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(decoded.name ? { name: decoded.name } : {}),
    },
    create: {
      firebaseUid: decoded.uid,
      email,
      phone,
      name,
      profile: { create: {} },
      onboardingProgress: { create: { path: 'NEWCOMER', currentStep: 1 } },
      agentState: { create: {} },
      notificationPrefs: { create: {} },
      subscription: { create: { plan: 'FREE' } },
      portfolios: {
        create: [
          { mode: 'LIVE', cashBalance: 0, equity: 0 },
          { mode: 'SIM', cashBalance: 100000, equity: 100000 },
        ],
      },
      riskVaults: {
        create: [
          {
            assetClass: 'STOCKS',
            dailyLossLimit: 500,
            maxDrawdown: 0.15,
            perTradeExposure: 0.05,
            assetsEnabled: true,
          },
          {
            assetClass: 'CRYPTO',
            dailyLossLimit: 500,
            maxDrawdown: 0.2,
            perTradeExposure: 0.05,
            assetsEnabled: false,
          },
          {
            assetClass: 'FOREX',
            dailyLossLimit: 500,
            maxDrawdown: 0.15,
            perTradeExposure: 0.05,
            assetsEnabled: false,
          },
          {
            assetClass: 'GLOBAL',
            dailyLossLimit: 1000,
            maxDrawdown: 0.2,
            perTradeExposure: 0.1,
            assetsEnabled: true,
          },
        ],
      },
    },
  });

  return user;
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorised', message: 'Missing Bearer token' });
  }

  const idToken = header.slice('Bearer '.length).trim();
  if (!idToken) {
    return reply.status(401).send({ error: 'Unauthorised', message: 'Missing Bearer token' });
  }

  try {
    // Dev/test bypass: firebase_dev:<uid>:<email_or_phone>
    if (
      (config.isDev || process.env.NODE_ENV === 'test') &&
      idToken.startsWith('firebase_dev:')
    ) {
      const parts = idToken.split(':');
      const firebaseUid = parts[1] || `dev_${Date.now()}`;
      const contact = parts[2] || 'dev@quantroapex.local';
      const isPhone = contact.startsWith('+');

      const user = await prisma.user.upsert({
        where: { firebaseUid },
        update: { lastSeenAt: new Date() },
        create: {
          firebaseUid,
          email: isPhone ? null : contact.toLowerCase(),
          phone: isPhone ? contact : null,
          name: 'QuantroApex User',
          profile: { create: {} },
          onboardingProgress: { create: { path: 'NEWCOMER', currentStep: 1 } },
          agentState: { create: {} },
          notificationPrefs: { create: {} },
          subscription: { create: { plan: 'FREE' } },
          portfolios: {
            create: [
              { mode: 'LIVE', cashBalance: 0, equity: 0 },
              { mode: 'SIM', cashBalance: 100000, equity: 100000 },
            ],
          },
          riskVaults: {
            create: [
              {
                assetClass: 'STOCKS',
                dailyLossLimit: 500,
                maxDrawdown: 0.15,
                perTradeExposure: 0.05,
              },
              {
                assetClass: 'CRYPTO',
                dailyLossLimit: 500,
                maxDrawdown: 0.2,
                perTradeExposure: 0.05,
                assetsEnabled: false,
              },
              {
                assetClass: 'FOREX',
                dailyLossLimit: 500,
                maxDrawdown: 0.15,
                perTradeExposure: 0.05,
                assetsEnabled: false,
              },
              {
                assetClass: 'GLOBAL',
                dailyLossLimit: 1000,
                maxDrawdown: 0.2,
                perTradeExposure: 0.1,
              },
            ],
          },
        },
      });

      request.user = {
        id: user.id,
        sub: user.id,
        firebaseUid,
        email: user.email,
        phone: user.phone,
      };
      request.firebaseUid = firebaseUid;
      request.userEmail = user.email ?? user.phone;
      request.userId = user.id;
      return;
    }

    initFirebaseAdmin();
    if (!firebaseApp && getApps().length === 0) {
      return reply.status(503).send({
        error: 'ServiceUnavailable',
        message: 'Firebase Admin is not configured',
      });
    }

    const decoded = await getAuth().verifyIdToken(idToken);
    const user = await upsertLocalUser(decoded);

    request.user = {
      id: user.id,
      sub: user.id,
      firebaseUid: decoded.uid,
      email: user.email,
      phone: user.phone,
    };
    request.firebaseUid = decoded.uid;
    request.userEmail = user.email ?? user.phone;
    request.userId = user.id;
  } catch (err: unknown) {
    console.error('=== AUTHENTICATION FAILURE DETAILED LOG ===');
    console.error(err);
    request.log?.error?.(err);
    // Firebase auth errors have a code like 'auth/id-token-expired'.
    // Anything else (DB connection, Prisma, network) is an infrastructure fault.
    const code: string =
      (err as { code?: string; errorInfo?: { code?: string } })?.code ??
      (err as { code?: string; errorInfo?: { code?: string } })?.errorInfo?.code ??
      '';
    const isAuthError =
      code.startsWith('auth/') ||
      code === 'ID_TOKEN_EXPIRED' ||
      code === 'ID_TOKEN_REVOKED' ||
      (err instanceof Error && /token|jwt|firebase/i.test(err.message));

    if (isAuthError) {
      return reply.status(401).send({
        error: 'Unauthorised',
        message: 'Invalid or expired token',
      });
    }

    // DB or network fault — don't lie to the client about the token being bad.
    return reply.status(503).send({
      error: 'ServiceUnavailable',
      message: 'Authentication service temporarily unavailable. Please try again.',
    });
  }
}

export default fp(async (app: FastifyInstance) => {
  initFirebaseAdmin();
  app.decorate('authenticate', authenticate);
});
