import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('QuantroApex V1 — End-to-End User Journey Test', () => {
  let app: FastifyInstance;
  const testEmail = `e2e_trader_${Date.now()}@quantroapex.test`;
  const password = 'QuietConfidence2026!';
  let accessToken: string;
  let userId: string;
  let strategyId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    // Cleanup test user data
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('Step 1: User Registration & Token Issuance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: testEmail,
        password,
        firstName: 'Apex',
        lastName: 'Trader',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.user).toHaveProperty('id');
    expect(body.user.email).toBe(testEmail.toLowerCase());
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');

    accessToken = body.accessToken;
    userId = body.user.id;
  });

  it('Step 2: Onboarding Flow (Path Selection & Completion)', async () => {
    // Select EXPRESS onboarding path
    const pathRes = await app.inject({
      method: 'POST',
      url: '/onboarding/path',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { path: 'EXPRESS', experienceLevel: 'PROFESSIONAL' },
    });
    expect(pathRes.statusCode).toBe(200);

    // Complete Onboarding with explicit Risk Vault limits ($1000 daily loss, 10% per trade exposure)
    const completeRes = await app.inject({
      method: 'POST',
      url: '/onboarding/complete',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        experienceLevel: 'PROFESSIONAL',
        tradingCapital: 50000,
        preferredTradingMode: 'SIM',
        globalBrainConsent: true,
        riskVault: {
          dailyLossLimit: 1000,
          maxDrawdown: 0.20,
          perTradeExposure: 0.10, // 10% max exposure per trade
          stocksEnabled: true,
          cryptoEnabled: true,
          forexEnabled: false,
        },
        notificationPrefs: {
          digestInterval: 'DAILY',
          pushEnabled: true,
          lossAlertsEnabled: true,
          milestoneAlerts: true,
        },
      },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeBody = JSON.parse(completeRes.payload);
    expect(completeBody.message).toBe('Onboarding completed successfully');
  });

  it('Step 3: Strategy Marketplace Browsing & Strategy Selection', async () => {
    // List strategies
    const listRes = await app.inject({
      method: 'GET',
      url: '/strategies',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.strategies.length).toBeGreaterThan(0);
    strategyId = listBody.strategies[0].id;

    // Select chosen strategy
    const selectRes = await app.inject({
      method: 'POST',
      url: '/strategies/select',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { strategyId },
    });
    expect(selectRes.statusCode).toBe(200);
    const selectBody = JSON.parse(selectRes.payload);
    expect(selectBody.userStrategy.isActive).toBe(true);
  });

  it('Step 4: Executing a Valid Trade Order & Verifying Portfolio Positions', async () => {
    // Buy 5 shares of AAPL at $150 ($750 trade value — well within $100,000 capital & 10% exposure limit)
    const orderRes = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 5,
        limitPrice: 150.0,
        assetClass: 'STOCKS',
        aiReasoning: 'E2E Validation Trade — Momentum signal confirmed.',
        isSimulated: true,
      },
    });

    expect(orderRes.statusCode).toBe(201);
    const orderBody = JSON.parse(orderRes.payload);
    expect(orderBody.success).toBe(true);
    expect(orderBody.order.status).toBe('FILLED');

    // Verify position exists in portfolio
    const posRes = await app.inject({
      method: 'GET',
      url: '/execution/positions',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(posRes.statusCode).toBe(200);
    const posBody = JSON.parse(posRes.payload);
    expect(posBody.positions.length).toBeGreaterThan(0);
    expect(posBody.positions[0].symbol).toBe('AAPL');
  });

  it('Step 5: Risk Vault Limit Enforcement (Blocking Over-Exposure)', async () => {
    // Attempt massive order exceeding perTradeExposure (e.g. 5,000 shares @ $150 = $750,000 > 10% of equity)
    const riskRes = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'NVDA',
        side: 'BUY',
        quantity: 5000,
        limitPrice: 150.0,
        assetClass: 'STOCKS',
        isSimulated: true,
      },
    });

    expect(riskRes.statusCode).toBe(422);
    const riskBody = JSON.parse(riskRes.payload);
    expect(riskBody.error).toBe('ExecutionRejected');
    expect(riskBody.code).toBe('EXPOSURE_LIMIT_EXCEEDED');
  });

  it('Step 6: Responding to Advisory Signals (APPROVE)', async () => {
    const advRes = await app.inject({
      method: 'POST',
      url: '/notifications/advisory/respond',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        signalId: 'sig_e2e_001',
        action: 'APPROVE',
        symbol: 'MSFT',
        side: 'BUY',
        quantity: 2,
      },
    });

    expect(advRes.statusCode).toBe(201);
    const advBody = JSON.parse(advRes.payload);
    expect(advBody.action).toBe('APPROVED');
    expect(advBody.trade).toBeDefined();
  });

  it('Step 7: Activity Feed Audit Trail Verification', async () => {
    const feedRes = await app.inject({
      method: 'GET',
      url: '/activity-feed',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(feedRes.statusCode).toBe(200);
    const feedBody = JSON.parse(feedRes.payload);
    expect(feedBody.entries.length).toBeGreaterThan(0);
  });

  it('Step 8: System Subsystem Health Checks', async () => {
    const detailedRes = await app.inject({
      method: 'GET',
      url: '/health/detailed',
    });
    expect(detailedRes.statusCode).toBe(200);
    const detailedBody = JSON.parse(detailedRes.payload);
    expect(detailedBody.status).toBe('HEALTHY');
    expect(detailedBody.subsystems.database.status).toBe('HEALTHY');

    const readyRes = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });
    expect(readyRes.statusCode).toBe(200);
  });
});
