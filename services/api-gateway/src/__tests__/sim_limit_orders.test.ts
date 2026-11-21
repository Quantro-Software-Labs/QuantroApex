import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import { setMockMarketHoursOpen, setMockRealQuote, clearMockRealQuotes } from '../lib/market/quote_engine.js';
import { fillPendingSimLimitOrders } from '../lib/execution_engine.js';

describe('A.4 SIM pending limit orders job', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.order.deleteMany({
      where: { user: { email: { endsWith: '@simlimits.test' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@simlimits.test' } },
    });
    clearMockRealQuotes();

    const session = await registerTestUser(app, 'trader@simlimits.test');
    userId = session.user.id;
    accessToken = session.accessToken;
  });

  it('fills pending SIM buy limit order when quote crosses below limit price, and releases reservation', async () => {
    setMockMarketHoursOpen(true);
    setMockRealQuote('AAPL', 160); // Current price $160

    // Submit BUY limit order at $150 (below market -> stays SUBMITTED/PENDING)
    const orderRes = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 5,
        limitPrice: 150,
        assetClass: 'STOCKS',
        mode: 'SIM',
      },
    });

    expect(orderRes.statusCode).toBe(201);
    const orderData = JSON.parse(orderRes.payload).order;
    expect(orderData.status).toBe('SUBMITTED');
    expect(Number(orderData.reservedCash)).toBe(750); // 5 * 150

    // Before crossing: job does not fill it
    let filled = await fillPendingSimLimitOrders(userId);
    expect(filled).toBe(0);

    // Price crosses down to $148 (<= $150 limit)
    setMockRealQuote('AAPL', 148);
    filled = await fillPendingSimLimitOrders(userId);
    expect(filled).toBe(1);

    // Verify order is FILLED and reservations are released
    const dbOrder = await prisma.order.findUnique({ where: { id: orderData.id } });
    expect(dbOrder?.status).toBe('FILLED');
    expect(Number(dbOrder?.reservedCash)).toBe(0);
    expect(Number(dbOrder?.reservedQuantity)).toBe(0);

    // Verify position and trade were created
    const trade = await prisma.trade.findFirst({ where: { orderId: orderData.id } });
    expect(trade).toBeDefined();
    expect(Number(trade?.fillPrice)).toBe(148);
    expect(Number(trade?.fillQuantity)).toBe(5);
  });

  it('releases reservation when pending limit order is cancelled', async () => {
    setMockMarketHoursOpen(true);
    setMockRealQuote('AAPL', 160);

    const orderRes = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 4,
        limitPrice: 140,
        assetClass: 'STOCKS',
        mode: 'SIM',
      },
    });

    const orderData = JSON.parse(orderRes.payload).order;
    expect(Number(orderData.reservedCash)).toBe(560); // 4 * 140

    // Cancel the order
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/execution/orders/${orderData.id}/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);

    const dbOrder = await prisma.order.findUnique({ where: { id: orderData.id } });
    expect(dbOrder?.status).toBe('CANCELLED');
    expect(Number(dbOrder?.reservedCash)).toBe(0);
  });

  it('defaults time-in-force DAY for stocks and GTC for crypto, expiring DAY orders', async () => {
    await prisma.riskVault.updateMany({
      where: { userId },
      data: { assetsEnabled: true, cryptoEnabled: true },
    });

    // Stocks default DAY
    const stockOrderRes = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'MSFT',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 2,
        limitPrice: 200,
        assetClass: 'STOCKS',
        mode: 'SIM',
      },
    });
    const stockOrder = JSON.parse(stockOrderRes.payload).order;
    expect(stockOrder.timeInForce).toBe('DAY');

    // Crypto default GTC
    const cryptoOrderRes = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'BTC/USDT',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 0.1,
        limitPrice: 40000,
        assetClass: 'CRYPTO',
        mode: 'SIM',
      },
    });
    const cryptoOrder = JSON.parse(cryptoOrderRes.payload).order;
    expect(cryptoOrder.timeInForce).toBe('GTC');

    // Expire old stock DAY order (> 24 hours ago)
    await prisma.order.update({
      where: { id: stockOrder.id },
      data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
    });

    await fillPendingSimLimitOrders(userId);

    const expiredStockOrder = await prisma.order.findUnique({ where: { id: stockOrder.id } });
    expect(expiredStockOrder?.status).toBe('EXPIRED');
    expect(Number(expiredStockOrder?.reservedCash)).toBe(0);
  });
});
