import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config/index.js';
import jwtPlugin from './plugins/jwt.js';
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

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isDev ? 'info' : 'warn' },
    bodyLimit: 65536, // 64 KB — more than enough for all API payloads
  });

  // ── Security Headers ──────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // relaxed for API-only server
    crossOriginEmbedderPolicy: false, // required for WebSocket compatibility
  });

  // ── CORS ─────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile clients, curl, server-to-server)
      if (!origin) return callback(null, true);
      const allowed = config.corsOrigin.split(',').map((o) => o.trim());
      // In dev, allow all. In production, only whitelisted origins.
      if (config.isDev || allowed.includes('*') || allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      global: true,
      max: 120,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({
        error: 'TooManyRequests',
        message: 'Too many requests. Please slow down and try again shortly.',
      }),
    });
  }

  // ── WebSocket & JWT ───────────────────────────────────────────────────────
  await app.register(websocket, {
    options: { maxPayload: 65536 }, // 64 KB per WebSocket frame
  });
  await app.register(jwtPlugin);

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(onboardingRoutes, { prefix: '/onboarding' });
  await app.register(riskVaultRoutes, { prefix: '/risk-vault' });
  await app.register(strategyRoutes, { prefix: '/strategies' });
  await app.register(executionRoutes, { prefix: '/execution' });
  await app.register(simulationRoutes, { prefix: '/simulation' });
  await app.register(activityFeedRoutes, { prefix: '/activity-feed' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.register(notificationRoutes, { prefix: '/notifications' });

  // ── Global Error Handler ─────────────────────────────────────────────────
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
