import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('Execution Engine & Broker Integration', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@executiontest.com' } },
    });

    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'trader@executiontest.com',
        password: 'Password123!',
      },
    });

    const body = JSON.parse(regRes.payload);
    accessToken = body.accessToken;
    userId = body.user.id;
  });

  it('should execute a valid BUY order and update portfolio & positions', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        limitPrice: 150,
        assetClass: 'STOCKS',
        aiReasoning: 'Bullish momentum breakout',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.order.status).toBe('FILLED');
    expect(Number(body.trade.fillQuantity)).toBe(10);

    // Verify DB position creation
    const positionsRes = await app.inject({
      method: 'GET',
      url: '/execution/positions',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(positionsRes.statusCode).toBe(200);
    const posBody = JSON.parse(positionsRes.payload);
    expect(posBody.positions.length).toBe(1);
    expect(posBody.positions[0].symbol).toBe('AAPL');
    expect(Number(posBody.positions[0].quantity)).toBe(10);
  });

  it('should reject order if Risk Vault per-trade exposure is breached', async () => {
    // Set 1% per-trade exposure limit on $100k equity = max $1,000
    await app.inject({
      method: 'PUT',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        dailyLossLimit: 500,
        maxDrawdown: 0.15,
        perTradeExposure: 0.01,
        cryptoEnabled: false,
        stocksEnabled: true,
        forexEnabled: false,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 100, // 100 * 150 = $15,000 > $1,000 limit
        limitPrice: 150,
        assetClass: 'STOCKS',
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.payload);
    expect(body.code).toBe('EXPOSURE_LIMIT_EXCEEDED');
  });

  it('should fetch order history', async () => {
    await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'MSFT',
        side: 'BUY',
        quantity: 5,
        limitPrice: 300,
        assetClass: 'STOCKS',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/execution/orders',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.orders.length).toBe(1);
    expect(body.orders[0].symbol).toBe('MSFT');
  });

  it('should execute strategy signal successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/execution/signal',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'NVDA',
        side: 'BUY',
        quantity: 2,
        assetClass: 'STOCKS',
        reasoning: 'AI Signal: High probability momentum continuation',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.trade.aiReasoning).toContain('AI Signal');
  });
});
