import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { config } from '../config/index.js';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import { AlpacaClient } from '../lib/broker/alpaca_client.js';
import {
  setMockRealQuote,
  clearMockRealQuotes,
  setMockMarketHoursOpen,
} from '../lib/market/quote_engine.js';
import { getTradingDayStart } from '../lib/trading_day.js';
import {
  reconcilePendingSubmitOrders,
  syncAllPortfoliosMarkToMarket,
} from '../lib/execution_engine.js';
import { apexAgentLoop } from '../lib/agent/apex_agent_loop.js';
import { encryptSecret } from '../lib/security/encryption.js';

describe('Trustworthy Hardening — Auth, Simulation, Risk, Emergency Stop & Onboarding', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    (config.trading as any).liveTradingEnabled = true;
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    (config.trading as any).liveTradingEnabled = false;
    await app.close();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@trustworthy.test' } },
    });

    const session = await registerTestUser(app, 'trader@trustworthy.test');
    accessToken = session.accessToken;
    userId = session.user.id;
  });

  afterEach(() => {
    clearMockRealQuotes();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Dev Auth Bypass Hardening
  // =========================================================================
  describe('1. Dev Auth Bypass Hardening', () => {
    it('dev token rejected outside test mode (when ALLOW_DEV_AUTH is not true)', async () => {
      const orig = process.env.ALLOW_DEV_AUTH;
      try {
        process.env.ALLOW_DEV_AUTH = 'false';
        const res = await app.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { authorization: 'Bearer firebase_dev:fake_uid:fake@trustworthy.test' },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        process.env.ALLOW_DEV_AUTH = orig;
      }
    });

    it('dev token rejected outside test mode (when NODE_ENV is development or production)', async () => {
      const orig = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';
        const res = await app.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { authorization: 'Bearer firebase_dev:fake_uid:fake@trustworthy.test' },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        process.env.NODE_ENV = orig;
      }
    });
  });

  // =========================================================================
  // 2. Pure Simulator: SIM Never Calls Alpaca; LIVE Without Keys Fails 400
  // =========================================================================
  describe('2. Pure Simulation & Broker Isolation', () => {
    it('SIM orders never call the Alpaca client (spy on it)', async () => {
      const alpacaSpy = vi.spyOn(AlpacaClient.prototype, 'createOrder');

      setMockRealQuote('AAPL', 150);
      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 2,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.order.status).toBe('FILLED');
      expect(alpacaSpy).not.toHaveBeenCalled();
    });

    it('LIVE without user keys returns 400', async () => {
      // Mark user as KYC verified and plan as PRO so they reach broker credentials validation
      await prisma.kYCVerification.upsert({
        where: { userId },
        create: {
          userId,
          status: 'VERIFIED',
          documentType: 'PASSPORT',
          countryCode: 'US',
          verifiedAt: new Date(),
        },
        update: { status: 'VERIFIED' },
      });

      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan: 'PRO' },
        update: { plan: 'PRO' },
      });

      setMockRealQuote('AAPL', 150);
      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 2,
          isSimulated: false,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('BROKER_CREDENTIALS_MISSING');
    });

    it('rejects order when no real quote is available (never fills against random-walk or $100 fallbacks)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'XYZ99',
          side: 'BUY',
          quantity: 2,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('NO_REAL_QUOTE');
    });
  });

  // =========================================================================
  // 3. Server-Side Risk Enforcement: Daily Loss Limit & NY Midnight Boundary
  // =========================================================================
  describe('3. Risk Vault Server-Side Enforcement', () => {
    it('computes trading day boundary correctly for stocks (America/New_York) and crypto (UTC)', () => {
      // 2026-01-15T03:00:00Z is Jan 14 at 22:00 (10 PM) in New York (EST, UTC-5).
      // Day start for STOCKS should be 2026-01-14T05:00:00.000Z.
      const nightDate = new Date('2026-01-15T03:00:00.000Z');
      const stocksStart = getTradingDayStart('STOCKS', nightDate);
      expect(stocksStart.toISOString()).toBe('2026-01-14T05:00:00.000Z');

      // 2026-01-15T06:00:00Z is Jan 15 at 01:00 (1 AM) in New York (EST, UTC-5).
      // Day start for STOCKS should be 2026-01-15T05:00:00.000Z.
      const morningDate = new Date('2026-01-15T06:00:00.000Z');
      const morningStocksStart = getTradingDayStart('STOCKS', morningDate);
      expect(morningStocksStart.toISOString()).toBe('2026-01-15T05:00:00.000Z');

      // For CRYPTO, day start is always UTC midnight.
      const cryptoStart = getTradingDayStart('CRYPTO', nightDate);
      expect(cryptoStart.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    });

    it('daily loss limit blocks the next order after losses cross the limit, including across the New York midnight boundary', async () => {
      // Setup user risk vault with $500 daily loss limit and generous exposure
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 500,
          maxDrawdown: 50,
          perTradeExposure: 50,
          stocksEnabled: true,
          cryptoEnabled: false,
          forexEnabled: false,
        },
      });

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      // 1. Insert an existing order and closed trade today with $600 realized loss (exceeds $500 limit)
      const order1 = await prisma.order.create({
        data: {
          userId,
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'MARKET',
          quantity: 10,
          status: 'FILLED',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      const lossTrade = await prisma.trade.create({
        data: {
          orderId: order1.id,
          fillQuantity: 10,
          fillPrice: 140,
          realizedPnl: -600,
          filledAt: new Date(), // Today
        },
      });

      setMockRealQuote('AAPL', 150);

      // Attempt next order: should be blocked by daily loss limit
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(blockedRes.statusCode).toBe(422);
      const blockedBody = JSON.parse(blockedRes.payload);
      expect(['CLASS_DAILY_LOSS_LIMIT', 'DAILY_LOSS_LIMIT_EXCEEDED']).toContain(blockedBody.code);

      // 2. Move the loss trade to yesterday (across the New York midnight boundary)
      const nyDayStart = getTradingDayStart('STOCKS', new Date());
      const yesterdayBeforeMidnight = new Date(nyDayStart.getTime() - 2 * 60 * 60 * 1000); // 2 hours before NY midnight

      await prisma.trade.update({
        where: { id: lossTrade.id },
        data: { filledAt: yesterdayBeforeMidnight },
      });

      // Attempt next order: now it should succeed on the new trading day!
      const allowedRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(allowedRes.statusCode).toBe(201);
    });

    it('drawdown blocks after a peak-to-trough breach', async () => {
      // Setup maxDrawdown = 15%
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 10000,
          maxDrawdown: 15,
          perTradeExposure: 50,
          stocksEnabled: true,
          cryptoEnabled: false,
          forexEnabled: false,
        },
      });

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      // Set peak equity = $100,000, current equity = $80,000 (20% drawdown > 15% limit)
      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: {
          peakEquity: 100000,
          equity: 80000,
          cashBalance: 80000,
        },
      });

      setMockRealQuote('AAPL', 150);

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('DRAWDOWN_LIMIT_EXCEEDED');

      // Recover equity to $90,000 (drawdown = (100k - 90k) / 100k = 10% <= 15%)
      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: {
          equity: 90000,
          cashBalance: 90000,
        },
      });

      const recoveryRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(recoveryRes.statusCode).toBe(201);
    });

    it('two concurrent orders cannot both pass a limit that only allows one (row locking)', async () => {
      // Configure risk vault so exposure and daily loss don't block the trade
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 50000,
          maxDrawdown: 90,
          perTradeExposure: 100, // 100% exposure allowed
          stocksEnabled: true,
          cryptoEnabled: false,
          forexEnabled: false,
        },
      });

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      // Set cash balance to $1,500
      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: {
          cashBalance: 1500,
          equity: 1500,
          peakEquity: 1500,
        },
      });

      // AAPL price is $1,000. Each order costs ~$1,000. Cash only allows one order!
      setMockRealQuote('AAPL', 1000);

      const orderPayload = {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 1,
        isSimulated: true,
        assetClass: 'STOCKS',
      };

      // Send two orders simultaneously
      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/execution/order',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: orderPayload,
        }),
        app.inject({
          method: 'POST',
          url: '/execution/order',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: orderPayload,
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      // Exactly one succeeds (201) and one fails (422)
      expect(statuses).toEqual([201, 422]);

      // Verify position has exactly 1 share (not 2)
      const position = await prisma.position.findUnique({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'AAPL' } },
      });
      expect(Number(position?.quantity)).toBe(1);

      // Verify cash balance is around $500, never negative
      const updatedPort = await prisma.portfolio.findUniqueOrThrow({
        where: { id: portfolio.id },
      });
      expect(Number(updatedPort.cashBalance)).toBeGreaterThan(0);
      expect(Number(updatedPort.cashBalance)).toBeLessThan(1000);
    });

    it('SELL reduces position and credits cash; rejects selling more than held quantity', async () => {
      // Set generous exposure
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 50000,
          maxDrawdown: 90,
          perTradeExposure: 50, // 50%
          stocksEnabled: true,
          cryptoEnabled: false,
          forexEnabled: false,
        },
      });

      setMockRealQuote('AAPL', 100);

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      // Initial cash: $10,000
      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: { cashBalance: 10000, equity: 10000, peakEquity: 10000 },
      });

      // 1. Buy 10 shares of AAPL @ $100
      const buyRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 10,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });
      expect(buyRes.statusCode).toBe(201);

      let pos = await prisma.position.findUnique({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'AAPL' } },
      });
      expect(Number(pos?.quantity)).toBe(10);

      const portAfterBuy = await prisma.portfolio.findUniqueOrThrow({
        where: { id: portfolio.id },
      });
      const cashAfterBuy = Number(portAfterBuy.cashBalance);
      expect(cashAfterBuy).toBeLessThan(9005);

      // 2. Sell 4 shares of AAPL @ $100
      const sellRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'SELL',
          quantity: 4,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });
      expect(sellRes.statusCode).toBe(201);

      pos = await prisma.position.findUnique({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'AAPL' } },
      });
      expect(Number(pos?.quantity)).toBe(6);

      const portAfterSell = await prisma.portfolio.findUniqueOrThrow({
        where: { id: portfolio.id },
      });
      const cashAfterSell = Number(portAfterSell.cashBalance);
      expect(cashAfterSell).toBeGreaterThan(cashAfterBuy + 395); // Credited cash for 4 shares

      // 3. Attempt to sell 10 shares when only 6 are held (short selling rejected)
      const shortRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'SELL',
          quantity: 10,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });
      expect(shortRes.statusCode).toBe(422);
      const shortBody = JSON.parse(shortRes.payload);
      expect(shortBody.code).toBe('INSUFFICIENT_POSITION');

      // Verify position remains 6
      pos = await prisma.position.findUnique({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'AAPL' } },
      });
      expect(Number(pos?.quantity)).toBe(6);
    });
  });

  // =========================================================================
  // 4. Real Emergency Stop: Zero Open Orders, Zero Positions & Cancel Confirmation
  // =========================================================================
  describe('4. Real Emergency Stop & Order Cancellation', () => {
    it('emergency stop leaves zero open orders and zero positions', async () => {
      setMockRealQuote('AAPL', 150);
      setMockRealQuote('NVDA', 200);

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      // Buy some AAPL
      await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 5,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      // Create an open/pending order directly in DB
      await prisma.order.create({
        data: {
          userId,
          symbol: 'NVDA',
          side: 'BUY',
          orderType: 'LIMIT',
          limitPrice: 180,
          quantity: 10,
          status: 'PENDING',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      // Verify we have open position and open order
      const preOrders = await prisma.order.count({
        where: { userId, status: { in: ['PENDING', 'SUBMITTED', 'ACCEPTED'] } },
      });
      expect(preOrders).toBeGreaterThan(0);

      const prePositions = await prisma.position.count({
        where: { portfolioId: portfolio.id, quantity: { gt: 0 } },
      });
      expect(prePositions).toBeGreaterThan(0);

      // Trigger Emergency Stop
      const stopRes = await app.inject({
        method: 'POST',
        url: '/risk-vault/emergency-stop',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(stopRes.statusCode).toBe(200);
      const stopBody = JSON.parse(stopRes.payload);
      expect(stopBody.isEmergencyStopped).toBe(true);
      expect(stopBody.summary.cancelledOrdersCount).toBeGreaterThan(0);
      expect(stopBody.summary.closedPositionsCount).toBeGreaterThan(0);

      // DB Assertions: ZERO open orders, ZERO positions
      const postOrders = await prisma.order.count({
        where: { userId, status: { in: ['PENDING', 'SUBMITTED', 'ACCEPTED'] } },
      });
      expect(postOrders).toBe(0);

      const postPositions = await prisma.position.count({
        where: { portfolioId: portfolio.id, quantity: { gt: 0 } },
      });
      expect(postPositions).toBe(0);

      // Verify agent is marked stopped
      const vaults = await prisma.riskVault.findMany({ where: { userId } });
      for (const v of vaults) {
        expect(v.emergencyStop).toBe(true);
      }

      const agentState = await prisma.agentState.findUnique({ where: { userId } });
      expect(agentState?.isRunning).toBe(false);
    });

    it('order cancellation awaits broker confirmation before marking CANCELLED', async () => {
      // Create pending SIM order
      const order = await prisma.order.create({
        data: {
          userId,
          symbol: 'MSFT',
          side: 'BUY',
          orderType: 'LIMIT',
          limitPrice: 300,
          quantity: 2,
          status: 'PENDING',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      // Cancel the order
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/execution/orders/${order.id}/cancel`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(cancelRes.statusCode).toBe(200);
      const cancelBody = JSON.parse(cancelRes.payload);
      expect(cancelBody.order.status).toBe('CANCELLED');

      const cancelledOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(cancelledOrder.status).toBe('CANCELLED');
    });
  });

  // =========================================================================
  // 5. Onboarding: Stores Limits Unchanged, Strict Percent Validation
  // =========================================================================
  describe('5. Onboarding Limits Integrity', () => {
    it('onboarding stores limits unchanged (no multipliers)', async () => {
      const onboardSession = await registerTestUser(app, 'newuser@trustworthy.test');

      const res = await app.inject({
        method: 'POST',
        url: '/onboarding/complete',
        headers: { authorization: `Bearer ${onboardSession.accessToken}` },
        payload: {
          experienceLevel: 'INTERMEDIATE',
          tradingCapital: 50000,
          preferredTradingMode: 'SIM',
          globalBrainConsent: true,
          riskVault: {
            dailyLossLimit: 500,
            maxDrawdown: 15, // 15%
            perTradeExposure: 5, // 5%
            stocksEnabled: true,
            cryptoEnabled: true,
            forexEnabled: false,
          },
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify database records exactly what the user chose
      const stocksVault = await prisma.riskVault.findUniqueOrThrow({
        where: { userId_assetClass: { userId: onboardSession.user.id, assetClass: 'STOCKS' } },
      });
      expect(Number(stocksVault.dailyLossLimit)).toBe(500);
      expect(Number(stocksVault.maxDrawdown)).toBe(0.15);
      expect(Number(stocksVault.perTradeExposure)).toBe(0.05);

      const globalVault = await prisma.riskVault.findUniqueOrThrow({
        where: { userId_assetClass: { userId: onboardSession.user.id, assetClass: 'GLOBAL' } },
      });
      // GLOBAL must NOT have 2x multiplier (dailyLossLimit is 500, NOT 1000)
      expect(Number(globalVault.dailyLossLimit)).toBe(500);
      // GLOBAL must NOT have 1.25x or 1.3x multipliers (maxDrawdown is 0.15, NOT 0.1875 or 0.20)
      expect(Number(globalVault.maxDrawdown)).toBe(0.15);
      expect(Number(globalVault.perTradeExposure)).toBe(0.05);
    });

    it('rejects percent inputs <= 0 or > 100 with 400', async () => {
      const onboardSession = await registerTestUser(app, 'invalidpercent@trustworthy.test');

      // Test 0
      const res0 = await app.inject({
        method: 'POST',
        url: '/onboarding/complete',
        headers: { authorization: `Bearer ${onboardSession.accessToken}` },
        payload: {
          tradingCapital: 50000,
          riskVault: {
            dailyLossLimit: 500,
            maxDrawdown: 0,
            perTradeExposure: 5,
          },
        },
      });
      expect(res0.statusCode).toBe(400);

      // Test 105 (> 100)
      const res105 = await app.inject({
        method: 'POST',
        url: '/onboarding/complete',
        headers: { authorization: `Bearer ${onboardSession.accessToken}` },
        payload: {
          tradingCapital: 50000,
          riskVault: {
            dailyLossLimit: 500,
            maxDrawdown: 105,
            perTradeExposure: 5,
          },
        },
      });
      expect(res105.statusCode).toBe(400);

      // Test negative
      const resNeg = await app.inject({
        method: 'POST',
        url: '/onboarding/complete',
        headers: { authorization: `Bearer ${onboardSession.accessToken}` },
        payload: {
          tradingCapital: 50000,
          riskVault: {
            dailyLossLimit: 500,
            maxDrawdown: 15,
            perTradeExposure: -5,
          },
        },
      });
      expect(resNeg.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // 6. LIVE 2-Phase Execution, Broker Outside DB Tx, Reservations & Reconciliation
  // =========================================================================
  describe('6. LIVE 2-Phase Execution, Reservations & Reconciliation', () => {
    it('LIVE order reserves cash and releases reservation if external broker rejects', async () => {
      await prisma.kYCVerification.upsert({
        where: { userId },
        create: {
          userId,
          status: 'VERIFIED',
          documentType: 'PASSPORT',
          countryCode: 'US',
          verifiedAt: new Date(),
        },
        update: { status: 'VERIFIED' },
      });

      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan: 'PRO' },
        update: { plan: 'PRO' },
      });

      await prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          alpacaApiKey: encryptSecret('PKTEST123456'),
          alpacaSecretKey: encryptSecret('SKTEST123456789'),
          isBrokerConnected: true,
        },
        update: {
          alpacaApiKey: encryptSecret('PKTEST123456'),
          alpacaSecretKey: encryptSecret('SKTEST123456789'),
          isBrokerConnected: true,
        },
      });

      await prisma.portfolio.upsert({
        where: { userId_mode: { userId, mode: 'LIVE' } },
        create: {
          userId,
          mode: 'LIVE',
          cashBalance: 10000,
          equity: 10000,
          peakEquity: 10000,
        },
        update: {
          cashBalance: 10000,
          equity: 10000,
          peakEquity: 10000,
        },
      });

      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 50000,
          maxDrawdown: 50,
          perTradeExposure: 50,
          stocksEnabled: true,
        },
      });

      setMockRealQuote('AAPL', 150);

      // Mock Alpaca createOrder to simulate broker rejection
      vi.spyOn(AlpacaClient.prototype, 'createOrder').mockRejectedValueOnce(
        new Error('Alpaca order rejected: insufficient margin'),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 2,
          isSimulated: false,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('BROKER_REJECTED');

      // Verify DB order is REJECTED and reserved cash is released to 0
      const order = await prisma.order.findFirst({
        where: { userId, symbol: 'AAPL', isSimulated: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(order?.status).toBe('REJECTED');
      expect(Number(order?.reservedCash)).toBe(0);
    });

    it('risk checks count reserved cash so two quick LIVE orders cannot both pass', async () => {
      await prisma.kYCVerification.upsert({
        where: { userId },
        create: {
          userId,
          status: 'VERIFIED',
          documentType: 'PASSPORT',
          countryCode: 'US',
          verifiedAt: new Date(),
        },
        update: { status: 'VERIFIED' },
      });

      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan: 'PRO' },
        update: { plan: 'PRO' },
      });

      await prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          alpacaApiKey: encryptSecret('PKTEST123456'),
          alpacaSecretKey: encryptSecret('SKTEST123456789'),
          isBrokerConnected: true,
        },
        update: {
          alpacaApiKey: encryptSecret('PKTEST123456'),
          alpacaSecretKey: encryptSecret('SKTEST123456789'),
          isBrokerConnected: true,
        },
      });

      // User has $1,500 LIVE cash
      await prisma.portfolio.upsert({
        where: { userId_mode: { userId, mode: 'LIVE' } },
        create: {
          userId,
          mode: 'LIVE',
          cashBalance: 1500,
          equity: 1500,
          peakEquity: 1500,
        },
        update: {
          cashBalance: 1500,
          equity: 1500,
          peakEquity: 1500,
        },
      });

      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 50000,
          maxDrawdown: 90,
          perTradeExposure: 100, // 100% exposure allowed
          stocksEnabled: true,
        },
      });

      setMockRealQuote('AAPL', 1000);

      // Create a pending order with $1,000 reserved cash
      await prisma.order.create({
        data: {
          userId,
          symbol: 'AAPL',
          side: 'BUY',
          orderType: 'MARKET',
          quantity: 1,
          status: 'PENDING_SUBMIT',
          isSimulated: false,
          assetClass: 'STOCKS',
          reservedCash: 1000,
        },
      });

      // Attempt second order of $1,000: available cash is only $500 ($1500 - $1000 reserved)
      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: false,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('reconciliation job repairs stuck PENDING_SUBMIT orders older than 2 minutes', async () => {
      await prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          alpacaApiKey: encryptSecret('PKTEST123456'),
          alpacaSecretKey: encryptSecret('SKTEST123456789'),
          isBrokerConnected: true,
        },
        update: {
          alpacaApiKey: encryptSecret('PKTEST123456'),
          alpacaSecretKey: encryptSecret('SKTEST123456789'),
          isBrokerConnected: true,
        },
      });

      // Insert stuck PENDING_SUBMIT order created 3 minutes ago
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      const stuckOrder = await prisma.order.create({
        data: {
          userId,
          symbol: 'AAPL',
          side: 'BUY',
          orderType: 'MARKET',
          quantity: 5,
          status: 'PENDING_SUBMIT',
          isSimulated: false,
          assetClass: 'STOCKS',
          reservedCash: 750,
          createdAt: threeMinutesAgo,
        },
      });

      // Mock broker getOrderByClientOrderId returning FILLED
      vi.spyOn(AlpacaClient.prototype, 'getOrderByClientOrderId').mockResolvedValueOnce({
        id: 'alpaca_reconciled_99',
        clientOrderId: stuckOrder.id,
        symbol: 'AAPL',
        qty: 5,
        side: 'BUY',
        type: 'MARKET',
        status: 'FILLED',
        fillPrice: 150,
        filledAt: new Date(),
      });

      const repaired = await reconcilePendingSubmitOrders();
      expect(repaired).toBeGreaterThan(0);

      const refreshedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: stuckOrder.id },
      });
      expect(refreshedOrder.status).toBe('FILLED');
      expect(Number(refreshedOrder.reservedCash)).toBe(0);
      expect(refreshedOrder.brokerOrderId).toBe('alpaca_reconciled_99');

      const trade = await prisma.trade.findFirst({
        where: { orderId: stuckOrder.id },
      });
      expect(trade).not.toBeNull();
      expect(Number(trade?.fillPrice)).toBe(150);
    });
  });

  // =========================================================================
  // 7. Remove Price Backdoor: Throws Outside Test Mode
  // =========================================================================
  describe('7. Price Backdoor Removal', () => {
    it('setMockRealQuote and clearMockRealQuotes throw in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(() => setMockRealQuote('AAPL', 150)).toThrow(/forbidden outside test environment/i);
        expect(() => clearMockRealQuotes()).toThrow(/forbidden outside test environment/i);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // =========================================================================
  // 8. Quote Quality & Market Hours
  // =========================================================================
  describe('8. Quote Quality & Market Hours', () => {
    it('rejects fills on quotes older than max age with STALE_QUOTE', async () => {
      // 30 seconds old quote for crypto (exceeds default 15s crypto limit)
      const staleTimestamp = new Date(Date.now() - 30_000);
      setMockRealQuote('BTC', {
        price: 60000,
        timestamp: staleTimestamp,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'BTC',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'CRYPTO',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('STALE_QUOTE');
    });

    it('rejects SIM stock market orders outside regular US market hours with MARKET_CLOSED', async () => {
      setMockRealQuote('AAPL', 150);
      setMockMarketHoursOpen(false);

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 2,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('MARKET_CLOSED');

      // Reset market hours open
      setMockMarketHoursOpen(true);
    });
  });

  // =========================================================================
  // 9. Simulation Fees
  // =========================================================================
  describe('9. Simulation Fees', () => {
    it('charges 0.25% taker commission on crypto SIM trades and stores fee on Trade', async () => {
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          assetClass: 'CRYPTO',
          dailyLossLimit: 50000,
          maxDrawdown: 90,
          perTradeExposure: 100,
          cryptoEnabled: true,
          assetsEnabled: true,
        },
      });

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: {
          cashBalance: 100000,
          equity: 100000,
          peakEquity: 100000,
        },
      });

      // BTC price $50,000. 1 BTC = $50,000.
      // Fee = 50,000 * 0.0025 = $125.
      setMockRealQuote('BTC', 50000);

      const buyRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'BTC',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'CRYPTO',
        },
      });

      expect(buyRes.statusCode).toBe(201);
      const buyBody = JSON.parse(buyRes.payload);
      const buyFee = Number(buyBody.trade.fee);
      const buyFillPrice = Number(buyBody.trade.fillPrice);
      expect(buyFee).toBeCloseTo(buyFillPrice * 0.0025, 2);

      const portAfterBuy = await prisma.portfolio.findUniqueOrThrow({
        where: { id: portfolio.id },
      });
      // Cash deducted = buyFillPrice * 1 + buyFee
      expect(Number(portAfterBuy.cashBalance)).toBeCloseTo(100000 - (buyFillPrice + buyFee), 2);

      // Now sell 1 BTC at same price $50,000.
      const sellRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'BTC',
          side: 'SELL',
          quantity: 1,
          isSimulated: true,
          assetClass: 'CRYPTO',
        },
      });

      expect(sellRes.statusCode).toBe(201);
      const sellBody = JSON.parse(sellRes.payload);
      const sellFee = Number(sellBody.trade.fee);
      const sellFillPrice = Number(sellBody.trade.fillPrice);
      expect(sellFee).toBeCloseTo(sellFillPrice * 0.0025, 2);

      // Realized PnL = sell proceeds - sell fee - (buy cost + buy fee) pro rata
      const expectedRealizedPnl = (sellFillPrice - sellFee) - (buyFillPrice + buyFee);
      expect(Number(sellBody.trade.realizedPnl)).toBeCloseTo(expectedRealizedPnl, 2);

      const portAfterSell = await prisma.portfolio.findUniqueOrThrow({
        where: { id: portfolio.id },
      });
      // Cash credited = sellFillPrice - sellFee
      expect(Number(portAfterSell.cashBalance)).toBeCloseTo(
        Number(portAfterBuy.cashBalance) + (sellFillPrice - sellFee),
        2,
      );
    });
  });

  // =========================================================================
  // 10. Peak Equity & Mark-to-Market Drawdown
  // =========================================================================
  describe('10. Peak Equity & Mark-to-Market Drawdown', () => {
    it('treats 0 or missing peak equity as current equity (no divide-by-zero)', async () => {
      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: {
          peakEquity: 0,
          equity: 50000,
          cashBalance: 50000,
        },
      });

      setMockRealQuote('AAPL', 150);

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(201);
      const port = await prisma.portfolio.findUniqueOrThrow({ where: { id: portfolio.id } });
      expect(Number(port.peakEquity)).toBeGreaterThanOrEqual(50000);
    });

    it('mark-to-market periodic sync drops equity and trips drawdown limit without a new fill', async () => {
      // 10% max drawdown
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 50000,
          maxDrawdown: 10, // 10%
          perTradeExposure: 100,
          stocksEnabled: true,
        },
      });

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      // Buy 100 AAPL @ $150 = $15,000. Initial equity = $100,000, peak = $100,000.
      setMockRealQuote('AAPL', 150);
      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: {
          cashBalance: 85000,
          equity: 100000,
          peakEquity: 100000,
        },
      });

      await prisma.position.upsert({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'AAPL' } },
        create: {
          portfolioId: portfolio.id,
          symbol: 'AAPL',
          quantity: 100,
          averageCost: 150,
        },
        update: {
          quantity: 100,
          averageCost: 150,
        },
      });

      // Real quote for AAPL drops precipitously from $150 to $30 (position value drops to $3,000)
      // Total equity becomes $85,000 cash + $3,000 = $88,000 (12% drawdown from $100k peak > 10% limit)
      setMockRealQuote('AAPL', 30);

      // Run mark-to-market background job
      await syncAllPortfoliosMarkToMarket();

      // Next order must be blocked by DRAWDOWN_LIMIT_EXCEEDED without having traded
      const orderRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(orderRes.statusCode).toBe(422);
      const body = JSON.parse(orderRes.payload);
      expect(body.code).toBe('DRAWDOWN_LIMIT_EXCEEDED');
    });
  });

  // =========================================================================
  // 11. Emergency Stop: HTTP 207 on Partial Failure & Order Paths Rejection
  // =========================================================================
  describe('11. Emergency Stop: HTTP 207 & Complete Order Path Gating', () => {
    it('returns HTTP 207 Multi-Status when a cancellation fails, keeps emergencyStop true, and writes to activity feed', async () => {
      // Create pending order
      await prisma.order.create({
        data: {
          userId,
          symbol: 'AAPL',
          side: 'BUY',
          orderType: 'LIMIT',
          limitPrice: 150,
          quantity: 2,
          status: 'PENDING',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      // Mock SimBrokerClient.prototype.cancelOrder to throw
      const cancelSpy = vi
        .spyOn(AlpacaClient.prototype, 'cancelOrder')
        .mockRejectedValue(new Error('Broker cancellation connection error'));

      // Also spy on SimBrokerClient cancelOrder
      const { SimBrokerClient } = await import('../lib/broker/sim_broker.js');
      vi.spyOn(SimBrokerClient.prototype, 'cancelOrder').mockRejectedValueOnce(
        new Error('Sim broker simulated failure'),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/risk-vault/emergency-stop',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(207);
      const body = JSON.parse(res.payload);
      expect(body.partial).toBe(true);
      expect(body.isEmergencyStopped).toBe(true);
      expect(body.failedCancels.length).toBeGreaterThan(0);

      // Verify activity feed entry
      const feed = await prisma.activityFeedEntry.findFirst({
        where: { userId, eventType: 'EMERGENCY_STOP' },
        orderBy: { createdAt: 'desc' },
      });
      expect(feed).not.toBeNull();
      expect(feed?.message).toContain('Emergency stop active with partial failures');
    });

    it('rejects all order paths with EMERGENCY_STOP_ACTIVE when emergency stop is active', async () => {
      // Activate emergency stop
      await app.inject({
        method: 'POST',
        url: '/risk-vault/emergency-stop',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      setMockRealQuote('AAPL', 150);

      // 1. POST /execution/order
      const orderRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });
      expect(orderRes.statusCode).toBe(422);
      expect(JSON.parse(orderRes.payload).code).toBe('EMERGENCY_STOP_ACTIVE');

      // 2. POST /execution/signal
      const signalRes = await app.inject({
        method: 'POST',
        url: '/execution/signal',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          assetClass: 'STOCKS',
          reasoning: 'Signal under emergency stop',
        },
      });
      expect(signalRes.statusCode).toBe(422);
      expect(JSON.parse(signalRes.payload).code).toBe('EMERGENCY_STOP_ACTIVE');

      // 3. POST /notifications/advisory/respond (APPROVE)
      const advisoryRes = await app.inject({
        method: 'POST',
        url: '/notifications/advisory/respond',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          signalId: 'sig_test_123',
          action: 'APPROVE',
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
        },
      });
      expect(advisoryRes.statusCode).toBe(422);
      expect(JSON.parse(advisoryRes.payload).code).toBe('EMERGENCY_STOP_ACTIVE');

      // 4. apexAgentLoop
      const agentTickResult = await apexAgentLoop.processAgentTick({
        userId,
        phase: 'SEED',
        currentStrategyId: 'strat_test',
      });
      expect(agentTickResult?.success).toBe(false);
      expect(agentTickResult?.code).toBe('EMERGENCY_STOP_ACTIVE');
    });
  });

  // =========================================================================
  // 12. Shared Limits Validation & Stored Unit Integrity
  // =========================================================================
  describe('12. Shared Limits Validation & Unit Integrity', () => {
    it('PUT /risk-vault rejects invalid percent inputs (<= 0 or > 100) with 400', async () => {
      const res0 = await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          maxDrawdown: 0,
        },
      });
      expect(res0.statusCode).toBe(400);

      const res105 = await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          maxDrawdown: 105,
        },
      });
      expect(res105.statusCode).toBe(400);
    });

    it('2% daily loss limit blocks at 2% and not at 200% or 0.02%', async () => {
      // Configure 2% daily loss limit via dailyLossLimitPct: 2
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimitPct: 2, // 2%
          maxDrawdown: 50,
          perTradeExposure: 50,
          stocksEnabled: true,
        },
      });

      const vault = await prisma.riskVault.findUniqueOrThrow({
        where: { userId_assetClass: { userId, assetClass: 'STOCKS' } },
      });
      // Stored unit must be 0.02
      expect(Number(vault.dailyLossLimit)).toBe(0.02);

      const portfolio = await prisma.portfolio.findFirstOrThrow({
        where: { userId, mode: 'SIM' },
      });

      // Equity is $10,000. 2% of $10,000 is exactly $200.
      await prisma.portfolio.update({
        where: { id: portfolio.id },
        data: {
          cashBalance: 10000,
          equity: 10000,
          peakEquity: 10000,
        },
      });

      setMockRealQuote('AAPL', 100);

      // 1. Loss of $150 (1.5% < 2% limit): next trade should SUCCEED
      const order1 = await prisma.order.create({
        data: {
          userId,
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'MARKET',
          quantity: 2,
          status: 'FILLED',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      const lossTrade1 = await prisma.trade.create({
        data: {
          orderId: order1.id,
          fillQuantity: 2,
          fillPrice: 100,
          realizedPnl: -150,
          filledAt: new Date(),
        },
      });

      const passRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });
      expect(passRes.statusCode).toBe(201);

      // 2. Increase loss by another $100 -> total loss = $250 (2.5% > 2% limit).
      // Next trade must BLOCK!
      await prisma.trade.update({
        where: { id: lossTrade1.id },
        data: { realizedPnl: -250 },
      });

      const blockRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });
      expect(blockRes.statusCode).toBe(422);
      expect(JSON.parse(blockRes.payload).code).toBe('CLASS_DAILY_LOSS_LIMIT');
    });
  });

  // =========================================================================
  // 13. Daily Loss Rule: GROSS_REALIZED_LOSSES Basis
  // =========================================================================
  describe('13. Daily Loss Rule Basis', () => {
    it('returns dailyLossBasis: GROSS_REALIZED_LOSSES in API responses', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      expect(JSON.parse(getRes.payload).dailyLossBasis).toBe('GROSS_REALIZED_LOSSES');

      const putRes = await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { dailyLossLimit: 500 },
      });
      expect(putRes.statusCode).toBe(200);
      expect(JSON.parse(putRes.payload).dailyLossBasis).toBe('GROSS_REALIZED_LOSSES');
    });

    it('profits do not widen the daily loss limit (gross realized losses only)', async () => {
      await app.inject({
        method: 'PUT',
        url: '/risk-vault',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          dailyLossLimit: 500,
          maxDrawdown: 90,
          perTradeExposure: 90,
          stocksEnabled: true,
        },
      });

      const orderWin = await prisma.order.create({
        data: {
          userId,
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'MARKET',
          quantity: 10,
          status: 'FILLED',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      // Huge profit of +$5,000 today
      await prisma.trade.create({
        data: {
          orderId: orderWin.id,
          fillQuantity: 10,
          fillPrice: 200,
          realizedPnl: 5000,
          filledAt: new Date(),
        },
      });

      const orderLoss = await prisma.order.create({
        data: {
          userId,
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'MARKET',
          quantity: 10,
          status: 'FILLED',
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      // Loss of -$600 today (exceeds $500 limit, despite net PnL being +$4,400)
      await prisma.trade.create({
        data: {
          orderId: orderLoss.id,
          fillQuantity: 10,
          fillPrice: 140,
          realizedPnl: -600,
          filledAt: new Date(),
        },
      });

      setMockRealQuote('AAPL', 150);

      const res = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          isSimulated: true,
          assetClass: 'STOCKS',
        },
      });

      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).code).toBe('CLASS_DAILY_LOSS_LIMIT');
    });
  });
});
