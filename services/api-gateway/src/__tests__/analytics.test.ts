import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';
import { registerTestUser } from './helpers/firebase_auth.js';
import { setMockRealQuote, clearMockRealQuotes } from '../lib/market/quote_engine.js';

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

    const session = await registerTestUser(app, 'trader@analyticstest.com');
    accessToken = session.accessToken;
  });

  afterEach(() => {
    clearMockRealQuotes();
  });

  it('should fetch performance metrics', async () => {
    const user = await prisma.user.findFirst({ where: { email: 'trader@analyticstest.com' } });
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId_mode: { userId: user!.id, mode: 'SIM' } },
    });

    // Create 10 closed trades so winRate is computed
    for (let i = 0; i < 10; i++) {
      const order = await prisma.order.create({
        data: {
          userId: user!.id,
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'MARKET',
          quantity: 1,
          status: 'FILLED',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });
      await prisma.trade.create({
        data: {
          orderId: order.id,
          fillPrice: 200,
          fillQuantity: 1,
          realizedPnl: 50,
          filledAt: new Date(Date.now() - (10 - i) * 3600000),
        },
      });
    }

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
    const user = await prisma.user.findFirst({ where: { email: 'trader@analyticstest.com' } });
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId_mode: { userId: user!.id, mode: 'SIM' } },
    });

    // Create 30 equity snapshots within the past month
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      await prisma.equitySnapshot.create({
        data: {
          userId: user!.id,
          portfolioId: portfolio!.id,
          mode: 'SIM',
          equity: 100000 + (30 - i) * 100,
          cashBalance: 100000,
          createdAt: new Date(now - i * 24 * 60 * 60 * 1000),
        },
      });
    }

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
