import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import { AlpacaClient } from '../lib/broker/alpaca_client.js';
import { CcxtClient } from '../lib/broker/ccxt_client.js';
import { OandaClient } from '../lib/broker/oanda_client.js';
import { getSessionCloseForDayOrder, isDayOrderExpired } from '../lib/trading_day.js';
import { pruneOldEquitySnapshots } from '../lib/execution_engine.js';
import { setMockRealQuote, clearMockRealQuotes } from '../lib/market/quote_engine.js';
import { config } from '../config/index.js';

describe('Part A: Gateway Leftovers Hardening & Verification', () => {
  let app: FastifyInstance;
  let testUser: { id: string; email: string };
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const session = await registerTestUser(app);
    testUser = session.user;
    accessToken = session.accessToken;
  });

  afterAll(async () => {
    clearMockRealQuotes();
    await app.close();
  });

  // ── 1. Broker Clients Production Enforcement ──────────────────────────────
  describe('1. Broker clients throw outside test mode without credentials', () => {
    it('AlpacaClient throws outside NODE_ENV=test when unconfigured', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const client = new AlpacaClient({});
        await expect(client.getAccount()).rejects.toThrow(/credentials not configured/i);
        await expect(client.createOrder({} as any)).rejects.toThrow(/credentials not configured/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('CcxtClient throws outside NODE_ENV=test when unconfigured', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const client = new CcxtClient({});
        await expect(client.getAccount()).rejects.toThrow(/credentials not configured/i);
        await expect(client.createOrder({} as any)).rejects.toThrow(/credentials not configured/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('OandaClient throws outside NODE_ENV=test when unconfigured', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const client = new OandaClient({});
        await expect(client.getAccount()).rejects.toThrow(/credentials not configured/i);
        await expect(client.createOrder({} as any)).rejects.toThrow(/credentials not configured/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  // ── 2. DAY Order Expiry Across Weekend & DST Change ────────────────────────
  describe('2. DAY order expiry at 4:00 PM America/New_York session close', () => {
    it('order placed during trading hours expires at 4:00 PM same day', () => {
      // Wednesday 2026-10-14 at 10:30 AM EDT (14:30 UTC)
      const placed = new Date('2026-10-14T14:30:00Z');
      const close = getSessionCloseForDayOrder(placed);

      // EDT is UTC-4: 16:00 EDT = 20:00 UTC
      expect(close.toISOString()).toBe('2026-10-14T20:00:00.000Z');

      const beforeClose = new Date('2026-10-14T19:59:59Z');
      expect(isDayOrderExpired(placed, beforeClose)).toBe(false);

      const afterClose = new Date('2026-10-14T20:00:01Z');
      expect(isDayOrderExpired(placed, afterClose)).toBe(true);
    });

    it('order placed after close or across a weekend targets next trading session', () => {
      // Friday 2026-10-16 at 6:00 PM EDT (after market close, 22:00 UTC)
      const fridayNight = new Date('2026-10-16T22:00:00Z');
      const close = getSessionCloseForDayOrder(fridayNight);

      // Session close must be Monday 2026-10-19 at 16:00 EDT (20:00 UTC)
      expect(close.toISOString()).toBe('2026-10-19T20:00:00.000Z');

      // Saturday must NOT be expired
      const saturday = new Date('2026-10-17T15:00:00Z');
      expect(isDayOrderExpired(fridayNight, saturday)).toBe(false);

      // Monday 3:30 PM EDT (19:30 UTC) must NOT be expired
      const mondayMidday = new Date('2026-10-19T19:30:00Z');
      expect(isDayOrderExpired(fridayNight, mondayMidday)).toBe(false);

      // Monday 4:05 PM EDT (20:05 UTC) MUST be expired
      const mondayAfterClose = new Date('2026-10-19T20:05:00Z');
      expect(isDayOrderExpired(fridayNight, mondayAfterClose)).toBe(true);
    });

    it('handles US DST change correctly (EDT UTC-4 to EST UTC-5 in November)', () => {
      // US DST ends Sunday Nov 1, 2026.
      // Order placed Monday Nov 2, 2026 (now in EST = UTC-5).
      // 16:00 EST = 21:00 UTC!
      const novOrder = new Date('2026-11-02T15:00:00Z'); // 10:00 AM EST
      const close = getSessionCloseForDayOrder(novOrder);

      expect(close.toISOString()).toBe('2026-11-02T21:00:00.000Z');

      const at2059Utc = new Date('2026-11-02T20:59:00Z'); // 15:59 EST
      expect(isDayOrderExpired(novOrder, at2059Utc)).toBe(false);

      const at2101Utc = new Date('2026-11-02T21:01:00Z'); // 16:01 EST
      expect(isDayOrderExpired(novOrder, at2101Utc)).toBe(true);
    });
  });

  // ── 3. Emergency Stop Manual Reset Requirement ────────────────────────────
  describe('3. Emergency stop never clears itself & requires explicit reset', () => {
    it('resume blocked with 409 if queued orders remain, succeeds only when empty', async () => {
      // 1. Trigger emergency stop
      await app.inject({
        method: 'POST',
        url: '/risk-vault/emergency-stop',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      // 2. Insert a queued order
      const queuedOrder = await prisma.order.create({
        data: {
          userId: testUser.id,
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'MARKET',
          quantity: 1,
          status: 'QUEUED',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      // 3. Attempt resume -> must be rejected with 409 EMERGENCY_STOP_ACTIVE
      const resumeBlockedRes = await app.inject({
        method: 'POST',
        url: '/risk-vault/resume',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { assetClass: 'GLOBAL' },
      });
      expect(resumeBlockedRes.statusCode).toBe(409);
      expect(JSON.parse(resumeBlockedRes.payload).error).toBe('EMERGENCY_STOP_ACTIVE');

      // 4. Resolve the queued order
      await prisma.order.update({
        where: { id: queuedOrder.id },
        data: { status: 'FILLED' },
      });

      // 5. Emergency stop is STILL active until explicit resume
      const vaultStillStopped = await prisma.riskVault.findUnique({
        where: { userId_assetClass: { userId: testUser.id, assetClass: 'GLOBAL' } },
      });
      expect(vaultStillStopped?.emergencyStop).toBe(true);

      // 6. Explicit resume succeeds now that no orders are queued
      const resumeSuccessRes = await app.inject({
        method: 'POST',
        url: '/risk-vault/resume',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { assetClass: 'GLOBAL' },
      });
      expect(resumeSuccessRes.statusCode).toBe(200);

      const vaultResumed = await prisma.riskVault.findUnique({
        where: { userId_assetClass: { userId: testUser.id, assetClass: 'GLOBAL' } },
      });
      expect(vaultResumed?.emergencyStop).toBe(false);
    });
  });

  // ── 4. Analytics Retention (7 days for 5-min snapshots, daily forever) ────
  describe('4. Equity snapshots retention pruning', () => {
    it('prunes intraday snapshots older than 7 days, keeping daily snapshots', async () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const dayKey = tenDaysAgo.toISOString().slice(0, 10);

      // Create 3 intraday snapshots on that day
      const simPort = await prisma.portfolio.findFirstOrThrow({
        where: { userId: testUser.id, mode: 'SIM' },
      });

      await prisma.equitySnapshot.createMany({
        data: [
          {
            userId: testUser.id,
            portfolioId: simPort.id,
            mode: 'SIM',
            equity: 100000,
            cashBalance: 90000,
            createdAt: new Date(`${dayKey}T10:00:00Z`),
          },
          {
            userId: testUser.id,
            portfolioId: simPort.id,
            mode: 'SIM',
            equity: 100500,
            cashBalance: 90000,
            createdAt: new Date(`${dayKey}T12:00:00Z`),
          },
          {
            userId: testUser.id,
            portfolioId: simPort.id,
            mode: 'SIM',
            equity: 101000,
            cashBalance: 90000,
            createdAt: new Date(`${dayKey}T16:00:00Z`), // Last of the day
          },
        ],
      });

      // Run pruning
      const pruned = await pruneOldEquitySnapshots(7);
      expect(pruned).toBeGreaterThanOrEqual(2);

      // Check remaining snapshots for that day: exactly 1 snapshot remains (the last one)
      const remaining = await prisma.equitySnapshot.findMany({
        where: {
          userId: testUser.id,
          createdAt: {
            gte: new Date(`${dayKey}T00:00:00Z`),
            lte: new Date(`${dayKey}T23:59:59Z`),
          },
        },
      });
      expect(remaining.length).toBe(1);
      expect(Number(remaining[0].equity)).toBe(101000);
    });
  });

  // ── 5. Raw-Body Webhook Parser & Normal JSON Scoping ──────────────────────
  describe('5. Raw-body parser applies only to webhooks with 1 MB limit', () => {
    it('normal routes parse standard JSON and do not have rawBody', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 250,
          dailyLossLimitUnit: 'USD',
        },
      });
      expect(res.statusCode).toBe(200);
    });

    it('webhook rejects body exceeding 1 MB limit with 413', async () => {
      // 1.1 MB payload
      const hugeString = 'A'.repeat(1024 * 1024 + 100);
      const res = await app.inject({
        method: 'POST',
        url: '/subscriptions/webhook',
        headers: {
          'content-type': 'application/json',
          'x-paystack-signature': 'dummy_sig',
        },
        payload: JSON.stringify({ huge: hugeString }),
      });
      expect(res.statusCode).toBe(413);
    });
  });

  // ── 6. Spread & Slippage Returned on SIM Fills ─────────────────────────────
  describe('6. Spread and slippage configurable and returned on SIM fills', () => {
    it('returns halfSpreadBps and slippageBps on SIM fill', async () => {
      setMockRealQuote('NVDA', 120);

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'NVDA',
          side: 'BUY',
          orderType: 'MARKET',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.halfSpreadBps).toBe(config.trading.spreadAndSlippage.stocks.halfSpreadBps);
      expect(body.slippageBps).toBe(config.trading.spreadAndSlippage.stocks.slippageBps);
    });
  });

  // ── 7. Config Endpoint & LIVE Trading Disabled ────────────────────────────
  describe('7. GET /config and LIVE trading disabled by default', () => {
    it('GET /config returns liveTradingEnabled false by default', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/config',
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.liveTradingEnabled).toBe(false);
    });

    it('LIVE order is rejected with 403 LIVE_DISABLED', async () => {
      setMockRealQuote('AAPL', 150);

      await prisma.kYCVerification.upsert({
        where: { userId: testUser.id },
        create: { userId: testUser.id, status: 'VERIFIED' },
        update: { status: 'VERIFIED' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          orderType: 'MARKET',
          quantity: 1,
          isSimulated: false, // LIVE
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('LIVE_DISABLED');
    });
  });

  // ── 8. Tick Generator 404 in Non-Test ──────────────────────────────────────
  describe('8. /simulation/generate-ticks returns 404 outside test mode', () => {
    it('returns 404 when NODE_ENV is production', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const res = await app.inject({
          method: 'POST',
          url: '/simulation/generate-ticks',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: { symbol: 'AAPL', tickCount: 5 },
        });
        expect(res.statusCode).toBe(404);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });
});
