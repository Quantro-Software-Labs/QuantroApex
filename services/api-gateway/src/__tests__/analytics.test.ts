import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('Performance & Analytics Endpoints', () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@analyticstest.com' } },
    });

    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'trader@analyticstest.com',
        password: 'Password123!',
      },
    });

    const body = JSON.parse(regRes.payload);
    accessToken = body.accessToken;
  });

  it('should fetch performance metrics', async () => {
    // Execute a trade
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

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/metrics',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.metrics.totalTrades).toBeGreaterThan(0);
    expect(body.metrics.winRate).toBeGreaterThan(0);
  });

  it('should fetch equity curve time series for 1M timeframe', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/equity-curve?timeframe=1M',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.timeframe).toBe('1M');
    expect(body.points.length).toBeGreaterThan(25);
    expect(body.points[0].equity).toBeGreaterThan(0);
  });

  it('should fetch trade history log', async () => {
    await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'NVDA',
        side: 'BUY',
        quantity: 5,
        limitPrice: 200,
        assetClass: 'STOCKS',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/trade-history',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.trades.length).toBeGreaterThan(0);
    expect(body.trades[0].symbol).toBe('NVDA');
  });
});
