import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import { setMockMarketHoursOpen, setMockRealQuote, clearMockRealQuotes } from '../lib/market/quote_engine.js';
import { fillPendingSimLimitOrders } from '../lib/execution_engine.js';

describe('A.3 Emergency stop outside market hours', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@emergencymarkethours.test' } },
    });
    clearMockRealQuotes();

    const session = await registerTestUser(app, 'trader@emergencymarkethours.test');
    userId = session.user.id;
    accessToken = session.accessToken;
  });

  it('SIM stock position close outside market hours is QUEUED and never fails with MARKET_CLOSED', async () => {
    // Market is CLOSED
    setMockMarketHoursOpen(false);

    // Give user an open SIM stock position
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId_mode: { userId, mode: 'SIM' } },
    });
    await prisma.position.create({
      data: {
        portfolioId: portfolio!.id,
        symbol: 'AAPL',
        quantity: 10,
        averageCost: new Prisma.Decimal(150),
      },
    });

    // Trigger Emergency Stop
    const res = await app.inject({
      method: 'POST',
      url: '/risk-vault/emergency-stop',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { assetClass: 'STOCKS' },
    });

    expect([200, 207]).toContain(res.statusCode);
    const body = JSON.parse(res.payload);
    expect(body.isEmergencyStopped ?? body.riskVault?.emergencyStop).toBe(true);

    // Check that close was reported as QUEUED, not failed with MARKET_CLOSED
    const queuedClose = body.closedPositions.find((p: any) => p.symbol === 'AAPL');
    expect(queuedClose).toBeDefined();
    expect(queuedClose.status).toBe('QUEUED');
    expect(queuedClose.mode).toBe('SIM');

    // Verify DB order exists with status QUEUED
    const dbOrder = await prisma.order.findFirst({
      where: { userId, symbol: 'AAPL', status: 'QUEUED' },
    });
    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('QUEUED');

    // Emergency stop stays active while queued closes exist
    const getVaultRes = await app.inject({
      method: 'GET',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const vaultBody = JSON.parse(getVaultRes.payload);
    expect(vaultBody.isEmergencyStopped).toBe(true);
    expect(vaultBody.queuedClosesCount).toBeGreaterThan(0);

    // Resume must be rejected with 409 EMERGENCY_STOP_ACTIVE
    const resumeRes = await app.inject({
      method: 'POST',
      url: '/risk-vault/resume',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { assetClass: 'STOCKS' },
    });
    expect(resumeRes.statusCode).toBe(409);
    expect(JSON.parse(resumeRes.payload).error).toBe('EMERGENCY_STOP_ACTIVE');

    // When market opens and real quote arrives, fillPendingSimLimitOrders fills the queued close
    setMockMarketHoursOpen(true);
    setMockRealQuote('AAPL', 155);

    const filledCount = await fillPendingSimLimitOrders();
    expect(filledCount).toBeGreaterThan(0);

    // Verify order is now FILLED and position closed
    const filledOrder = await prisma.order.findUnique({ where: { id: dbOrder!.id } });
    expect(filledOrder?.status).toBe('FILLED');

    const remainingPos = await prisma.position.findUnique({
      where: { portfolioId_symbol: { portfolioId: portfolio!.id, symbol: 'AAPL' } },
    });
    expect(remainingPos).toBeNull();

    // Now resume is permitted
    const resumeAllowed = await app.inject({
      method: 'POST',
      url: '/risk-vault/resume',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { assetClass: 'STOCKS' },
    });
    expect(resumeAllowed.statusCode).toBe(200);
  });
});
