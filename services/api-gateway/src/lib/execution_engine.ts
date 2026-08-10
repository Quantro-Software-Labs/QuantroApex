import { prisma } from './prisma.js';
import { defaultBrokerClient } from './broker/alpaca_client.js';
import { IBrokerClient } from './broker/broker_client.js';
import { validateTradeRisk } from './risk_enforcer.js';
import { eventBus } from './events/event_bus.js';
import { AssetClass, OrderSide, OrderType, OrderStatus } from '@prisma/client';

export interface ExecuteOrderParams {
  userId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number;
  assetClass: AssetClass;
  aiReasoning?: string;
  isSimulated?: boolean;
  brokerClient?: IBrokerClient;
}

export interface ExecutionResult {
  success: boolean;
  code?: string;
  reason?: string;
  order?: any;
  trade?: any;
}

export async function executeOrder(params: ExecuteOrderParams): Promise<ExecutionResult> {
  const {
    userId,
    symbol,
    side,
    orderType,
    quantity,
    limitPrice,
    assetClass,
    aiReasoning,
    isSimulated = true,
    brokerClient = defaultBrokerClient,
  } = params;

  // 1. Fetch Risk Vault — auto-create default if not existing
  let riskVault = await prisma.riskVault.findUnique({ where: { userId } });
  if (!riskVault) {
    riskVault = await prisma.riskVault.create({
      data: {
        userId,
        dailyLossLimit: 500,
        maxDrawdown: 0.15,
        perTradeExposure: 0.05,
        cryptoEnabled: true,
        stocksEnabled: true,
        forexEnabled: true,
      },
    });
  }

  const mode = isSimulated ? 'SIM' : 'LIVE';
  let portfolio = await prisma.portfolio.findFirst({ where: { userId, mode } });

  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: {
        userId,
        mode,
        cashBalance: isSimulated ? 100000 : 0,
        equity: isSimulated ? 100000 : 0,
      },
    });
  }

  const estimatedPrice = limitPrice || 150.0;
  const estimatedTradeValue = quantity * estimatedPrice;

  // 2. Pre-trade Risk Check
  const riskResult = validateTradeRisk({
    riskVault,
    portfolioEquity: Number(portfolio.equity),
    tradeValue: estimatedTradeValue,
    assetClass,
  });

  if (!riskResult.allowed) {
    return {
      success: false,
      code: riskResult.code,
      reason: riskResult.reason,
    };
  }

  // 3. Create Pending Order record
  const dbOrder = await prisma.order.create({
    data: {
      userId,
      symbol,
      side,
      orderType,
      quantity,
      limitPrice,
      status: OrderStatus.PENDING,
      isSimulated,
    },
  });

  try {
    // 4. Dispatch to Broker
    const brokerRes = await brokerClient.createOrder({
      symbol,
      side,
      qty: quantity,
      type: orderType,
      limitPrice,
      idempotencyKey: dbOrder.id,
    });

    const isFilled = brokerRes.status === 'FILLED';
    const status = isFilled ? OrderStatus.FILLED : OrderStatus.SUBMITTED;
    const fillPrice = brokerRes.fillPrice || estimatedPrice;

    // 5. Update Order status
    const updatedOrder = await prisma.order.update({
      where: { id: dbOrder.id },
      data: {
        brokerOrderId: brokerRes.id,
        status,
      },
    });

    let trade = null;

    if (isFilled) {
      // 6. Record Trade log entry
      trade = await prisma.trade.create({
        data: {
          orderId: updatedOrder.id,
          fillPrice,
          fillQuantity: quantity,
          aiReasoning: aiReasoning || `Apex executed ${side} order on ${symbol}.`,
        },
      });

      // 7. Update Position & Portfolio
      const cost = quantity * fillPrice;
      const existingPos = await prisma.position.findUnique({
        where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol } },
      });

      if (side === 'BUY') {
        const newQty = (existingPos ? Number(existingPos.quantity) : 0) + quantity;
        const oldCost = existingPos ? Number(existingPos.averageCost) * Number(existingPos.quantity) : 0;
        const newAvg = (oldCost + cost) / newQty;

        await prisma.position.upsert({
          where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol } },
          create: {
            portfolioId: portfolio.id,
            symbol,
            quantity: newQty,
            averageCost: newAvg,
          },
          update: {
            quantity: newQty,
            averageCost: newAvg,
          },
        });

        await prisma.portfolio.update({
          where: { id: portfolio.id },
          data: {
            cashBalance: { decrement: cost },
          },
        });
      } else {
        // SELL
        if (existingPos) {
          const currentQty = Number(existingPos.quantity);
          const newQty = Math.max(0, currentQty - quantity);

          if (newQty === 0) {
            await prisma.position.delete({
              where: { id: existingPos.id },
            });
          } else {
            await prisma.position.update({
              where: { id: existingPos.id },
              data: { quantity: newQty },
            });
          }
        }

        await prisma.portfolio.update({
          where: { id: portfolio.id },
          data: {
            cashBalance: { increment: cost },
          },
        });
      }

      // 8. Log Activity Feed entry
      const actionText = side === 'BUY' ? 'Opened' : 'Closed';
      const activityEntry = await prisma.activityFeedEntry.create({
        data: {
          userId,
          eventType: side === 'BUY' ? 'TRADE_OPENED' : 'TRADE_CLOSED',
          message: `${actionText} ${symbol} position · ${aiReasoning || 'Signal executed cleanly'}`,
        },
      });

      // Broadcast live event via WebSocket eventBus
      eventBus.broadcastToUser(userId, 'ACTIVITY_LOGGED', activityEntry);
    }

    return {
      success: true,
      order: updatedOrder,
      trade,
    };
  } catch (error: any) {
    await prisma.order.update({
      where: { id: dbOrder.id },
      data: { status: OrderStatus.REJECTED },
    });

    return {
      success: false,
      code: 'BROKER_REJECTED',
      reason: error?.message || 'Broker rejected order execution.',
    };
  }
}
