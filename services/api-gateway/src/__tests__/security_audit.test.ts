import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import type { FastifyInstance } from 'fastify';
import { registerTestUser } from './helpers/firebase_auth.js';
import { computeTradeMetrics, buildEquityCurve } from '../lib/analytics/metrics.js';
import { planAllows } from '../routes/subscriptions.js';
import { PaystackClient } from '../lib/payments/paystack_client.js';

describe('Financial calculation verification (pure)', () => {
  it('win rate excludes breakevens and is never inflated to 100% on open-only books', () => {
    const m = computeTradeMetrics([
      { realizedPnl: 10 },
      { realizedPnl: -5 },
      { realizedPnl: 0 },
    ]);
    expect(m.closedTrades).toBe(2);
    expect(m.winRate).toBeCloseTo(0.5);
    expect(m.profitFactor).toBeCloseTo(2);
  });

  it('empty book has zero win rate (not 1.0)', () => {
    expect(computeTradeMetrics([]).winRate).toBe(0);
    expect(computeTradeMetrics([{ realizedPnl: 0 }]).winRate).toBe(0);
  });

  it('equity curve accumulates PnL correctly', () => {
    const pts = buildEquityCurve(100_000, [100, -50, 25]);
    expect(pts).toEqual([
      { tradeIndex: 1, equity: 100100 },
      { tradeIndex: 2, equity: 100050 },
      { tradeIndex: 3, equity: 100075 },
    ]);
  });

  it('plan gates: FREE cannot use manual_desk; PRO can', () => {
    expect(planAllows('FREE', 'manual_desk')).toBe(false);
    expect(planAllows('CORE', 'manual_desk')).toBe(false);
    expect(planAllows('PRO', 'manual_desk')).toBe(true);
    expect(planAllows('CORE', 'autopilot')).toBe(true);
  });

  it('Paystack HMAC rejects bad signatures', async () => {
    const client = new PaystackClient({
      secretKey: 'sk_test_audit_secret',
      publicKey: 'pk_test',
    });
    const raw = JSON.stringify({ event: 'charge.success' });
    expect(await client.verifyWebhookSignature(raw, 'bad_sig')).toBe(false);
    const good = createHmac('sha512', 'sk_test_audit_secret').update(raw).digest('hex');
    expect(await client.verifyWebhookSignature(raw, good)).toBe(true);
  });
});

/**
 * Sprint 10 — security audit (integration). Skips cleanly when local DB schema is absent.
 */
describe('Sprint 10 security audit (API)', () => {
  let app: FastifyInstance;
  let dbReady = false;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    try {
      await prisma.user.findFirst({ take: 1 });
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  beforeEach(async () => {
    if (!dbReady) return;
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@securityaudit.test' } },
    });
  });

  it.skipIf(!dbReady)(
    'POST /execution/order with mode LIVE and unverified KYC returns 403',
    async () => {
      const session = await registerTestUser(app, 'live@securityaudit.test');
      await prisma.kYCVerification.deleteMany({ where: { userId: session.user.id } });

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${session.accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          limitPrice: 150,
          mode: 'LIVE',
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error).toBe('KYC_REQUIRED');
    },
  );

  it.skipIf(!dbReady)('SIM orders still allowed without KYC', async () => {
    const session = await registerTestUser(app, 'sim@securityaudit.test');
    const res = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 1,
        limitPrice: 150,
        mode: 'SIM',
        assetClass: 'STOCKS',
      },
    });
    expect([201, 422]).toContain(res.statusCode);
    if (res.statusCode === 403) {
      expect(JSON.parse(res.payload).error).not.toBe('KYC_REQUIRED');
    }
  });

  it.skipIf(!dbReady)(
    'MANUAL owner order on FREE plan returns PLAN_REQUIRED 403',
    async () => {
      const session = await registerTestUser(app, 'desk@securityaudit.test');
      await prisma.subscription.deleteMany({ where: { userId: session.user.id } });

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${session.accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          limitPrice: 100,
          owner: 'MANUAL',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error).toBe('PLAN_REQUIRED');
    },
  );

  it.skipIf(!dbReady)('User A cannot read User B orders', async () => {
    const a = await registerTestUser(app, 'alice@securityaudit.test');
    const b = await registerTestUser(app, 'bob@securityaudit.test');

    await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        symbol: 'MSFT',
        side: 'BUY',
        quantity: 2,
        limitPrice: 300,
        assetClass: 'STOCKS',
      },
    });

    const bOrders = await app.inject({
      method: 'GET',
      url: '/execution/orders',
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(bOrders.statusCode).toBe(200);
    const body = JSON.parse(bOrders.payload);
    const list = body.orders ?? body.data ?? (Array.isArray(body) ? body : []);
    const leaked = list.some((o: { symbol?: string }) => o.symbol === 'MSFT');
    expect(leaked).toBe(false);
  });

  it.skipIf(!dbReady)('emergency stop blocks validate-trade via API', async () => {
    const session = await registerTestUser(app, 'risk@securityaudit.test');
    await app.inject({
      method: 'POST',
      url: '/risk-vault/emergency-stop',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const val = await app.inject({
      method: 'POST',
      url: '/risk-vault/validate-trade',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { tradeValue: 100, assetClass: 'STOCKS' },
    });
    expect(val.statusCode).toBe(200);
    expect(JSON.parse(val.payload).allowed).toBe(false);
  });
});
