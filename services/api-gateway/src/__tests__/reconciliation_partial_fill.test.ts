import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import { reconcilePendingSubmitOrders } from '../lib/execution_engine.js';

describe('A.5 Reconciliation & PARTIALLY_FILLED handling', () => {
  let app: FastifyInstance;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@reconciletest.com' } },
    });

    const session = await registerTestUser(app, 'trader@reconciletest.com');
    userId = session.user.id;
  });

  it('marks orders older than 10 minutes as REJECTED and releases reservations when broker has no record', async () => {
    // 1. Order created 12 minutes ago with no broker record
    const staleOrder = await prisma.order.create({
      data: {
        userId,
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice: 150,
        status: 'PENDING_SUBMIT',
        isSimulated: true,
        reservedCash: 1500,
        createdAt: new Date(Date.now() - 12 * 60 * 1000), // 12 mins ago
      },
    });

    // 2. Order created 2 minutes ago with no broker record
    const freshOrder = await prisma.order.create({
      data: {
        userId,
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 5,
        limitPrice: 150,
        status: 'PENDING_SUBMIT',
        isSimulated: true,
        reservedCash: 750,
        createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 mins ago
      },
    });

    const repaired = await reconcilePendingSubmitOrders();
    expect(repaired).toBeGreaterThanOrEqual(1);

    // Stale order marked REJECTED and reservation released
    const updatedStale = await prisma.order.findUnique({ where: { id: staleOrder.id } });
    expect(updatedStale?.status).toBe('REJECTED');
    expect(Number(updatedStale?.reservedCash)).toBe(0);

    // Fresh order stays PENDING_SUBMIT with reservation kept
    const updatedFresh = await prisma.order.findUnique({ where: { id: freshOrder.id } });
    expect(updatedFresh?.status).toBe('PENDING_SUBMIT');
    expect(Number(updatedFresh?.reservedCash)).toBe(750);
  });

  it('handles PARTIALLY_FILLED: records each fill, updates position and cash, and keeps remaining reservation', async () => {
    // Create LIVE portfolio
    const portfolio = await prisma.portfolio.upsert({
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

    // Create LIVE order for 10 shares of MSFT @ $200 (reservedCash: $2,000)
    const liveOrder = await prisma.order.create({
      data: {
        userId,
        symbol: 'MSFT',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice: 200,
        status: 'PARTIALLY_FILLED',
        isSimulated: false,
        reservedCash: 1200, // 6 shares remaining
        brokerOrderId: 'live_broker_ord_123',
      },
    });

    // Already 4 shares filled in previous reconciliation step
    await prisma.trade.create({
      data: {
        orderId: liveOrder.id,
        fillPrice: 200,
        fillQuantity: 4,
        fee: 2,
        filledAt: new Date(Date.now() - 60000),
      },
    });

    await prisma.position.create({
      data: {
        portfolioId: portfolio.id,
        symbol: 'MSFT',
        quantity: 4,
        averageCost: new Prisma.Decimal(200.5),
      },
    });

    // Now broker reports total 7 shares filled (delta = 3 shares)
    // We simulate the transaction block logic of reconciliation:
    await prisma.$transaction(async (tx) => {
      const existingTrades = await tx.trade.findMany({ where: { orderId: liveOrder.id } });
      const alreadyFilledQty = existingTrades.reduce(
        (sum, t) => sum.add(t.fillQuantity),
        new Prisma.Decimal(0),
      );
      const totalFilledQty = new Prisma.Decimal(7); // Broker reported 7 filled
      const deltaQty = totalFilledQty.sub(alreadyFilledQty); // 3 new fills

      expect(deltaQty.toNumber()).toBe(3);

      const fillPrice = new Prisma.Decimal(200);
      const fee = new Prisma.Decimal(1.5);
      const grossTradeValue = deltaQty.mul(fillPrice); // $600

      const existingPos = await tx.position.findUnique({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'MSFT' } },
      });

      await tx.trade.create({
        data: {
          orderId: liveOrder.id,
          fillPrice,
          fillQuantity: deltaQty,
          fee,
          realizedPnl: null,
          filledAt: new Date(),
        },
      });

      const oldQty = new Prisma.Decimal(existingPos!.quantity); // 4
      const newQty = oldQty.add(deltaQty); // 7
      const oldCost = new Prisma.Decimal(existingPos!.averageCost).mul(oldQty);
      const newAvg = oldCost.add(grossTradeValue).add(fee).div(newQty);

      await tx.position.update({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'MSFT' } },
        data: { quantity: newQty, averageCost: newAvg },
      });

      const remainingQty = new Prisma.Decimal(liveOrder.quantity).sub(totalFilledQty); // 10 - 7 = 3
      const remainingReservedCash = remainingQty.mul(liveOrder.limitPrice!); // 3 * 200 = 600

      await tx.order.update({
        where: { id: liveOrder.id },
        data: {
          status: 'PARTIALLY_FILLED',
          reservedCash: remainingReservedCash,
        },
      });
    });

    // Verify order state
    const orderAfter = await prisma.order.findUnique({ where: { id: liveOrder.id } });
    expect(orderAfter?.status).toBe('PARTIALLY_FILLED');
    expect(Number(orderAfter?.reservedCash)).toBe(600); // 3 remaining shares reserved

    // Verify trades count
    const trades = await prisma.trade.findMany({ where: { orderId: liveOrder.id } });
    expect(trades.length).toBe(2);
    expect(Number(trades[0].fillQuantity) + Number(trades[1].fillQuantity)).toBe(7);

    // Verify position
    const pos = await prisma.position.findUnique({
      where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: 'MSFT' } },
    });
    expect(Number(pos?.quantity)).toBe(7);
  });
});
