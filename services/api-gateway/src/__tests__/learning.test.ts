import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';
import { tradeLearningLogger } from '../lib/ai/trade_learning_logger.js';
import { registerTestUser } from './helpers/firebase_auth.js';

describe('Global Brain V2 AI Training Engine & Learning Routes', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const session = await registerTestUser(app);
    authToken = session.accessToken;
    userId = session.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should log trade learning sample via TradeLearningLogger', async () => {
    const entry = await tradeLearningLogger.logTrade({
      userId,
      symbol: 'EUR/USD',
      assetClass: 'FOREX',
      side: 'BUY',
      quantity: 1.0,
      price: 1.0854,
      realizedPnl: 45.20,
      isWin: true,
    });

    expect(entry).toBeDefined();
    expect(entry?.symbol).toBe('EUR/USD');
    expect(entry?.assetClass).toBe('FOREX');
    expect(entry?.isWin).toBe(true);
  });

  it('should fetch V2 learning stats via GET /learning/stats', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/learning/stats',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.user).toHaveProperty('totalSamples');
    expect(json.user).toHaveProperty('modelReadinessPct');
    expect(json.global).toHaveProperty('v2TargetModel');
  });
});
