import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';
import { registerTestUser } from './helpers/firebase_auth.js';

describe('Strategy Marketplace Endpoints', () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@strategytest.com' } },
    });

    const session = await registerTestUser(app, 'user@strategytest.com');
    accessToken = session.accessToken;
  });

  it('should list all active strategies', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/strategies',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.strategies.length).toBeGreaterThanOrEqual(10);
  });

  it('should filter strategies by asset class', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/strategies?assetClass=STOCKS',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.strategies.length).toBeGreaterThan(0);
    expect(body.strategies.every((s: any) => s.assetClass === 'STOCKS')).toBe(true);
  });

  it('should fetch recommended strategies for user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/strategies/recommended',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.recommended.length).toBe(3);
  });

  it('should fetch strategy detail by slug or ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/strategies/strat-momentum-alpha',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.strategy.name).toBe('Apex Momentum Alpha');
    expect(body.strategy.assetClass).toBe('STOCKS');
  });

  it('should select a strategy for the user and increment user count', async () => {
    const detailRes = await app.inject({
      method: 'GET',
      url: '/strategies/strat-momentum-alpha',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const strategyId = JSON.parse(detailRes.payload).strategy.id;

    const selectRes = await app.inject({
      method: 'POST',
      url: '/strategies/select',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { strategyId },
    });

    expect(selectRes.statusCode).toBe(200);
    const body = JSON.parse(selectRes.payload);
    expect(body.message).toBe('Strategy selected successfully');
    expect(body.agentState.currentStrategyId).toBe(strategyId);
  });
});
