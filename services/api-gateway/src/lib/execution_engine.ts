import { defaultBrokerClient } from './broker/alpaca_client.js';
import { IBrokerClient } from './broker/broker_client.js';
import { resolveBrokerClient } from './broker/broker_resolver.js';
import { validateTradeRisk } from './risk_enforcer.js';
import { eventBus } from './events/event_bus.js';
import { aiReasoningService } from './ai/ai_reasoning_service.js';
import { resolveQuotePrice } from './market/quote_engine.js';
import { findAsset } from './market/market_directory.js';
import { prisma } from './prisma.js';
import type { AssetClass, OrderSide, OrderType, OrderStatus } from './db/types.js';
import {
  findRiskVault,
  createRiskVault,
  findPortfolio,
  createPortfolio,
  updatePortfolio,
  createOrder,
  updateOrder,
  findPosition,
  upsertPosition,
  updatePosition,
  deletePosition,
  createTrade,
  findTradeByOrderId,
  createActivityEntry,
  findPendingOrders,
  findUserProfile,
} from './db/repos.js';

export interface ExecuteOrderParams {
  userId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  trailingAmount?: number;
  takeProfit?: number;
  stopLoss?: number;
  isOco?: boolean;
  owner?: 'APEX' | 'MANUAL';
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
    stopPrice,
    trailingAmount,
    takeProfit,
    stopLoss,
    isOco,
    owner = 'APEX',
    assetClass,
    aiReasoning: providedReasoning,
    isSimulated = true,
    brokerClient = defaultBrokerClient,
  } = params;

  // Generate dynamic Gemini AI reasoning if not provided manually
  const aiReasoning =
    providedReasoning ||
    (await aiReasoningService.generateTradeReasoning({
      symbol,
      side,
      quantity,
      price: limitPrice,
      assetClass,
    }));

  // 1. Fetch Risk Vaults — GLOBAL + class-specific
  let riskVault = await findRiskVault(userId, assetClass);
  if (!riskVault) {
    riskVault = await createRiskVault({
      userId,
      assetClass,
      dailyLossLimit: 500,
      maxDrawdown: 0.15,
      perTradeExposure: 0.05,
      cryptoEnabled: true,
      stocksEnabled: true,
      forexEnabled: true,
      assetsEnabled: true,
    });
  }
  const globalVault = await findRiskVault(userId, 'GLOBAL');

  const mode = isSimulated ? 'SIM' : 'LIVE';
  let portfolio = await findPortfolio(userId, mode);

  if (!portfolio) {
    portfolio = await createPortfolio({
      userId,
      mode,
      cashBalance: isSimulated ? 100000 : 0,
      equity: isSimulated ? 100000 : 0,
    });
  }

  const quote = await resolveQuotePrice(symbol);
  const seedPrice = findAsset(symbol)?.price ?? 100.0;
  const estimatedPrice = limitPrice || quote?.price || seedPrice;
  const estimatedTradeValue = quantity * estimatedPrice;

  // 2. Pre-trade Risk Check (GLOBAL then class)
  const riskResult = validateTradeRisk({
    riskVault,
    globalVault,
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

  // MANUAL orders must not conflict with open APEX orders on the same symbol
  if (owner === 'MANUAL') {
    const openApex = await prisma.order.findFirst({
      where: {
        userId,
        symbol,
        owner: 'APEX',
        status: { in: ['PENDING', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_FILLED'] },
      },
    });
    if (openApex) {
      return {
        success: false,
        code: 'APEX_POSITION_CONFLICT',
        reason: `Cannot place a manual order on ${symbol} while Apex has an open order on the same symbol.`,
      };
    }
  }

  // 3. Create Pending Order record
  const pendingStatus: OrderStatus = 'PENDING';
  const dbOrder = await createOrder({
    userId,
    symbol,
    side,
    orderType,
    quantity,
    limitPrice,
    stopPrice,
    trailingAmount,
    takeProfit,
    stopLoss,
    isOco,
    owner,
    assetClass,
    status: pendingStatus,
    isSimulated,
  });

  try {
    // 4. Dispatch to Broker — map advanced types to MARKET/LIMIT for broker interface
    const brokerType: 'MARKET' | 'LIMIT' =
      orderType === 'LIMIT' || orderType === 'STOP_LIMIT' ? 'LIMIT' : 'MARKET';
    const brokerRes = await brokerClient.createOrder({
      symbol,
      side,
      qty: quantity,
      type: brokerType,
      limitPrice: orderType === 'STOP' || orderType === 'TRAILING_STOP' ? undefined : limitPrice,
      estimatedPrice,
      idempotencyKey: dbOrder.id,
    });

    const isFilled = brokerRes.status === 'FILLED';
    const status: OrderStatus = isFilled ? 'FILLED' : 'SUBMITTED';
    const fillPrice = brokerRes.fillPrice || estimatedPrice;

    // 5. Update Order status
    const updatedOrder = await updateOrder(dbOrder.id, {
      brokerOrderId: brokerRes.id,
      status,
    });

    let trade = null;

    if (isFilled) {
      // 6. Record Trade log entry (compute realized PnL on SELL for learning outcome loop)
      let realizedPnl: number | null = null;
      const existingPosForPnl = await findPosition(portfolio.id, symbol);
      if (side === 'SELL' && existingPosForPnl) {
        const avgCost = Number(existingPosForPnl.averageCost);
        realizedPnl = Number(((fillPrice - avgCost) * quantity).toFixed(2));
      }

      trade = await createTrade({
        orderId: updatedOrder.id,
        fillPrice,
        fillQuantity: quantity,
        realizedPnl: realizedPnl ?? undefined,
        aiReasoning: aiReasoning || `Apex executed ${side} order on ${symbol}.`,
        owner,
      });

      // Attach realized PnL on the in-memory trade object for callers
      (trade as any).realizedPnl = realizedPnl;

      // 7. Update Position & Portfolio
      const cost = quantity * fillPrice;
      const existingPos = existingPosForPnl;

      if (side === 'BUY') {
        const newQty = (existingPos ? Number(existingPos.quantity) : 0) + quantity;
        const oldCost = existingPos ? Number(existingPos.averageCost) * Number(existingPos.quantity) : 0;
        const newAvg = (oldCost + cost) / newQty;

        await upsertPosition({
          portfolioId: portfolio.id,
          symbol,
          quantity: newQty,
          averageCost: newAvg,
        });

        // Re-calculate total portfolio equity (cash + mark-to-market positions)
        const allPositions = await prisma.position.findMany({ where: { portfolioId: portfolio.id } });
        let totalPosValue = 0;
        for (const pos of allPositions) {
          const posQuote = await resolveQuotePrice(pos.symbol);
          const currentPx = posQuote?.price || Number(pos.averageCost);
          totalPosValue += Number(pos.quantity) * currentPx;
        }

        const newCash = side === 'BUY' ? Number(portfolio.cashBalance) - cost : Number(portfolio.cashBalance) + cost;
        const newEquity = newCash + totalPosValue;

        await updatePortfolio(portfolio.id, {
          cashBalance: newCash,
          equity: newEquity,
        });

        // Fail-closed check: If post-trade equity breach drawdown limit, set Emergency Stop automatically
        const maxDrawdown = Number(riskVault.maxDrawdown);
        if (portfolio.equity && Number(portfolio.equity) > 0) {
          const peakEquity = Math.max(Number(portfolio.equity), newEquity);
          const postTradeDrawdown = (peakEquity - newEquity) / peakEquity;
          if (postTradeDrawdown >= maxDrawdown) {
            await prisma.riskVault.updateMany({
              where: { userId, assetClass },
              data: { emergencyStop: true, emergencyStoppedAt: new Date() },
            });
            await createActivityEntry({
              userId,
              eventType: 'EMERGENCY_STOP',
              message: `Risk Vault Drawdown Breach (${(postTradeDrawdown * 100).toFixed(1)}% >= ${(maxDrawdown * 100).toFixed(1)}%). Trading automatically paused.`,
            });
          }
        }
      }

      // 8. Log Activity Feed entry
      const actionText = side === 'BUY' ? 'Opened' : 'Closed';
      const activityEntry = await createActivityEntry({
        userId,
        eventType: side === 'BUY' ? 'TRADE_OPENED' : 'TRADE_CLOSED',
        message: `${actionText} ${symbol} position · ${aiReasoning || 'Signal executed cleanly'}`,
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
    await updateOrder(dbOrder.id, { status: 'REJECTED' });

    return {
      success: false,
      code: 'BROKER_REJECTED',
      reason: error?.message || 'Broker rejected order execution.',
    };
  }
}

export async function syncUserPendingOrders(userId: string): Promise<void> {
  try {
    const pendingOrders = await findPendingOrders(userId);

    if (pendingOrders.length === 0) return;

    const profile = await findUserProfile(userId);
    // Pending order sync historically used Alpaca; resolve stocks broker from credentials.
    const brokerClient: IBrokerClient = resolveBrokerClient('STOCKS', {
      alpacaApiKey: profile?.alpacaApiKey,
      alpacaSecretKey: profile?.alpacaSecretKey,
    });

    for (const order of pendingOrders) {
      if (!order.brokerOrderId) continue;
      try {
        const brokerOrder = await brokerClient.getOrder(order.brokerOrderId);
        if (brokerOrder.status === 'FILLED') {
          const fillPrice =
            brokerOrder.fillPrice ||
            Number(order.limitPrice) ||
            (await resolveQuotePrice(order.symbol))?.price ||
            findAsset(order.symbol)?.price ||
            100.0;
          const quantity = Number(order.quantity);
          const cost = quantity * fillPrice;

          await updateOrder(order.id, { status: 'FILLED' });

          // Check if Trade already exists
          const existingTrade = await findTradeByOrderId(order.id);
          let trade = existingTrade;
          if (!existingTrade) {
            trade = await createTrade({
              orderId: order.id,
              fillPrice,
              fillQuantity: quantity,
              aiReasoning: `Order ${order.id} filled on Alpaca broker @ \$${fillPrice.toFixed(2)}.`,
            });
          }

          // Update position and portfolio
          const mode = order.isSimulated ? 'SIM' : 'LIVE';
          let portfolio = await findPortfolio(userId, mode);
          if (!portfolio) {
            portfolio = await createPortfolio({
              userId,
              mode,
              cashBalance: order.isSimulated ? 100000 : 0,
              equity: order.isSimulated ? 100000 : 0,
            });
          }

          const symbol = order.symbol;
          const side = order.side;
          const existingPos = await findPosition(portfolio.id, symbol);

          if (side === 'BUY') {
            const newQty = (existingPos ? Number(existingPos.quantity) : 0) + quantity;
            const oldCost = existingPos ? Number(existingPos.averageCost) * Number(existingPos.quantity) : 0;
            const newAvg = (oldCost + cost) / newQty;

            await upsertPosition({
              portfolioId: portfolio.id,
              symbol,
              quantity: newQty,
              averageCost: newAvg,
            });

            await updatePortfolio(portfolio.id, {
              cashBalance: Number(portfolio.cashBalance) - cost,
            });
          } else {
            // SELL
            if (existingPos) {
              const currentQty = Number(existingPos.quantity);
              const newQty = Math.max(0, currentQty - quantity);
              if (newQty === 0) {
                await deletePosition(existingPos.id);
              } else {
                await updatePosition(existingPos.id, { quantity: newQty });
              }
            }

            await updatePortfolio(portfolio.id, {
              cashBalance: Number(portfolio.cashBalance) + cost,
            });
          }

          // Log Activity Entry
          const actionText = side === 'BUY' ? 'Opened' : 'Closed';
          const activityEntry = await createActivityEntry({
            userId,
            eventType: side === 'BUY' ? 'TRADE_OPENED' : 'TRADE_CLOSED',
            message: `${actionText} ${symbol} position on Alpaca · Executed ${quantity} @ \$${fillPrice.toFixed(2)}`,
          });
          eventBus.broadcastToUser(userId, 'ACTIVITY_LOGGED', activityEntry);
        } else if (brokerOrder.status === 'CANCELLED' || brokerOrder.status === 'REJECTED') {
          await updateOrder(order.id, {
            status: brokerOrder.status === 'CANCELLED' ? 'CANCELLED' : 'REJECTED',
          });
        }
      } catch (err) {
        // Ignore single order sync failure
      }
    }
  } catch (err) {
    // Ignore overall sync error
  }
}
