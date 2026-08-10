import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('Simulation Mode Endpoints', () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@simtest.com' } },
    });

    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'trader@simtest.com',
        password: 'Password123!',
      },
    });

    const body = JSON.parse(regRes.payload);
    accessToken = body.accessToken;
  });

  it('should fetch simulation summary with default $100,000 capital', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/simulation/summary',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.activeMode).toBe('SIM');
    expect(body.simPortfolio.cashBalance).toBe(100000);
  });

  it('should toggle execution mode between SIM and LIVE', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/simulation/toggle-mode',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mode: 'LIVE' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.mode).toBe('LIVE');
  });

  it('should generate simulated market tick', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/simulation/generate-ticks',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { symbol: 'AAPL' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.tick.symbol).toBe('AAPL');
    expect(body.tick.price).toBeGreaterThan(0);
  });

  it('should reset paper trading account to $100,000 capital', async () => {
    // Execute a trade first
    await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        limitPrice: 150,
        assetClass: 'STOCKS',
      },
    });

    // Reset account
    const response = await app.inject({
      method: 'POST',
      url: '/simulation/reset',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.cashBalance).toBe(100000);
    expect(body.positions.length).toBe(0);
  });
});
