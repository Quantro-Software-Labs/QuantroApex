import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';

describe('E.1 Analytics Real Data vs Insufficient Data', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;
  let portfolioId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@analyticsdata.test' } },
    });

    const session = await registerTestUser(app, 'trader@analyticsdata.test');
    userId = session.user.id;
    accessToken = session.accessToken;

    const port = await prisma.portfolio.findUnique({
      where: { userId_mode: { userId, mode: 'SIM' } },
    });
    portfolioId = port!.id;
  });

  it('returns null with reason INSUFFICIENT_DATA when closed trades < 10 or daily snapshots < 20', async () => {
    // 3 closed trades (< 10)
    for (let i = 0; i < 3; i++) {
      const order = await prisma.order.create({
        data: {
          userId,
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
          fillPrice: 150,
          fillQuantity: 1,
          realizedPnl: 10,
          filledAt: new Date(),
        },
      });
    }

    // 5 daily snapshots (< 20)
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await prisma.equitySnapshot.create({
        data: {
          userId,
          portfolioId,
          mode: 'SIM',
          equity: 100000 + i * 50,
          cashBalance: 100000,
          createdAt: new Date(now - (5 - i) * 24 * 3600 * 1000),
        },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/metrics',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const metrics = body.metrics;

    // Metrics with insufficient data must be null with reason INSUFFICIENT_DATA
    expect(metrics.winRate).toBeNull();
    expect(metrics.winRateReason).toBe('INSUFFICIENT_DATA');
    expect(metrics.profitFactor).toBeNull();

    expect(metrics.sharpeRatio).toBeNull();
    expect(metrics.sharpeRatioReason).toBe('INSUFFICIENT_DATA');
    expect(metrics.maxDrawdown).toBeNull();
    expect(metrics.maxDrawdownReason).toBe('INSUFFICIENT_DATA');

    expect(metrics.insufficientData).toBe(true);

    // Hardcoded Sharpe 1.45 must NOT appear
    expect(metrics.sharpeRatio).not.toBe(1.45);
  });

  it('computes real winRate, annualized Sharpe (risk-free 0) and max drawdown when data requirements are met', async () => {
    // 10 closed trades (8 wins, 2 losses -> 80% win rate)
    for (let i = 0; i < 10; i++) {
      const isWin = i < 8;
      const order = await prisma.order.create({
        data: {
          userId,
          symbol: 'MSFT',
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
          realizedPnl: isWin ? 50 : -20,
          filledAt: new Date(Date.now() - (10 - i) * 3600 * 1000),
        },
      });
    }

    // 25 distinct daily snapshots
    const now = Date.now();
    for (let i = 24; i >= 0; i--) {
      // Simulate steadily growing equity with a slight drawdown
      const equityVal = i > 5 ? 100000 + (25 - i) * 200 : 103000 - (5 - i) * 100;
      await prisma.equitySnapshot.create({
        data: {
          userId,
          portfolioId,
          mode: 'SIM',
          equity: equityVal,
          cashBalance: 100000,
          createdAt: new Date(now - i * 24 * 3600 * 1000),
        },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/metrics',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const metrics = body.metrics;

    // Win rate computed (8/10 = 0.8)
    expect(metrics.winRate).toBeCloseTo(0.8);
    expect(metrics.winRateReason).toBeUndefined();

    // Sharpe ratio computed (not null, states risk-free rate 0 and basis)
    expect(typeof metrics.sharpeRatio).toBe('number');
    expect(metrics.sharpeRatioReason).toBeUndefined();
    expect(metrics.sharpeRatioRiskFreeRate).toBe(0);
    expect(metrics.sharpeRatioBasis).toBe('DAILY_ANNUALIZED_252');

    // Max drawdown computed (not null)
    expect(typeof metrics.maxDrawdown).toBe('number');
    expect(metrics.maxDrawdownReason).toBeUndefined();

    expect(metrics.insufficientData).toBe(false);
  });

  it('equity curve contains only real snapshot points with no sine wave noise', async () => {
    const now = Date.now();
    const createdEquities = [100000, 101000, 102500, 102000, 104000];

    for (let i = 0; i < createdEquities.length; i++) {
      await prisma.equitySnapshot.create({
        data: {
          userId,
          portfolioId,
          mode: 'SIM',
          equity: createdEquities[i],
          cashBalance: 100000,
          createdAt: new Date(now - (5 - i) * 24 * 3600 * 1000),
        },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/equity-curve?timeframe=1M',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.points.length).toBe(createdEquities.length);
    expect(body.points[0].equity).toBe(100000);
    expect(body.points[body.points.length - 1].equity).toBe(104000);
  });
});
