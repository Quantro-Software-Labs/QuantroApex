import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config/index.js';
import firebaseAuthPlugin from './plugins/firebase_auth.js';
import { initSentry } from './lib/monitoring/sentry.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { riskVaultRoutes } from './routes/risk_vault.js';
import { strategyRoutes } from './routes/strategies.js';
import { executionRoutes } from './routes/execution.js';
import { simulationRoutes } from './routes/simulation.js';
import { activityFeedRoutes } from './routes/activity_feed.js';
import { analyticsRoutes } from './routes/analytics.js';
import { notificationRoutes } from './routes/notifications.js';
import { aiRoutes } from './routes/ai.js';
import { marketRoutes } from './routes/market.js';
import { learningRoutes } from './routes/learning.js';
import { paymentRoutes } from './routes/payments.js';
import { kycRoutes } from './routes/kyc.js';
import { patternsRoutes } from './routes/patterns.js';
import { backtestRoutes } from './routes/backtest.js';
import { waitlistRoutes } from './routes/waitlist.js';
import { usersRoutes } from './routes/users.js';
import { subscriptionsRoutes } from './routes/subscriptions.js';

export async function buildApp() {
  initSentry();

  const app = Fastify({
    logger: { level: config.isDev ? 'info' : 'warn' },
    bodyLimit: 65536,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = config.corsOrigin.split(',').map((o) => o.trim());
      if (config.isDev || allowed.includes('*') || allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  if (process.env.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      global: true,
      max: config.rateLimitMax,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({
        error: 'TooManyRequests',
        message: 'Too many requests. Please slow down and try again shortly.',
      }),
    });
  }

  await app.register(websocket, { options: { maxPayload: 65536 } });
  await app.register(firebaseAuthPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(onboardingRoutes, { prefix: '/onboarding' });
  await app.register(riskVaultRoutes, { prefix: '/risk-vault' });
  await app.register(strategyRoutes, { prefix: '/strategies' });
  await app.register(executionRoutes, { prefix: '/execution' });
  await app.register(simulationRoutes, { prefix: '/simulation' });
  await app.register(activityFeedRoutes, { prefix: '/activity-feed' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(marketRoutes, { prefix: '/market' });
  await app.register(learningRoutes, { prefix: '/learning' });
  await app.register(paymentRoutes, { prefix: '/payments' });
  await app.register(subscriptionsRoutes, { prefix: '/subscriptions' });
  await app.register(kycRoutes, { prefix: '/kyc' });
  await app.register(patternsRoutes, { prefix: '/patterns' });
  await app.register(backtestRoutes, { prefix: '/backtest' });
  await app.register(waitlistRoutes, { prefix: '/waitlist' });

  app.setErrorHandler((error: any, _request, reply) => {
    app.log.error(error);
    const statusCode = error?.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error?.name ?? 'InternalServerError',
      message: statusCode === 500 ? 'An unexpected error occurred' : error?.message,
      details: {},
    });
  });

  return app;
}
