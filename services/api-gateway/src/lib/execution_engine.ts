import { Prisma } from '@prisma/client';
import { IBrokerClient, BrokerOrder } from './broker/broker_client.js';
import { SimBrokerClient } from './broker/sim_broker.js';
import { resolveBrokerClient } from './broker/broker_resolver.js';
import { validateTradeRisk } from './risk_enforcer.js';
import { eventBus } from './events/event_bus.js';
import { aiReasoningService } from './ai/ai_reasoning_service.js';
import {
  resolveRealQuotePrice,
  isQuoteStale,
  isRegularMarketHours,
} from './market/quote_engine.js';
import { prisma } from './prisma.js';
import { computeRealizedLossToday, isDayOrderExpired } from './trading_day.js';
import { decryptSecret } from './security/encryption.js';
import { config } from '../config/index.js';
import type { AssetClass, OrderSide, OrderType, OrderStatus } from './db/types.js';
import {
  findUserProfile,
  findPendingOrders,
  findTradeByOrderId,
  createTrade,
  updateOrder,
  createActivityEntry,
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
  timeInForce?: string;
  brokerClient?: IBrokerClient;
}

export interface ExecutionResult {
  success: boolean;
  code?: string;
  reason?: string;
  order?: any;
  trade?: any;
  halfSpreadBps?: number;
  slippageBps?: number;
}

export async function executeOrder(params: ExecuteOrderParams): Promise<ExecutionResult> {
  const {
    userId,
    symbol: rawSymbol,
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
    brokerClient,
  } = params;

  const symbol = rawSymbol.toUpperCase();
  const mode = isSimulated ? 'SIM' : 'LIVE';

  // Part B.2: LIVE trading off for beta. Gated behind LIVE_TRADING_ENABLED (default false)
  if (!isSimulated && !config.trading.liveTradingEnabled) {
    return {
      success: false,
      code: 'LIVE_DISABLED',
      reason: 'LIVE trading is disabled in this environment.',
    };
  }

  // 1. Emergency Stop Check: reject immediately if emergency stop is active
  const vaults = await prisma.riskVault.findMany({ where: { userId } });
  const isEmergencyStopped = vaults.some(
    (v) =>
      (v.emergencyStop || v.emergencyStoppedAt) &&
      (v.assetClass === assetClass || v.assetClass === 'GLOBAL'),
  );
  if (isEmergencyStopped) {
    return {
      success: false,
      code: 'EMERGENCY_STOP_ACTIVE',
      reason: `Trading is halted via Emergency Stop for ${assetClass}.`,
    };
  }

  // 2. Resolve Broker Client:
  // SIM mode MUST use sim_broker only.
  // LIVE mode MUST use user's own decrypted broker credentials; reject with 400 if missing.
  let activeLiveBrokerClient: IBrokerClient | undefined;
  if (!isSimulated) {
    if (brokerClient) {
      activeLiveBrokerClient = brokerClient;
    } else {
      const profile = await findUserProfile(userId);
      const rawApiKey = profile?.alpacaApiKey;
      const rawApiSecret = profile?.alpacaSecretKey;
      const apiKey = decryptSecret(rawApiKey);
      const apiSecret = decryptSecret(rawApiSecret);
      if (!apiKey || !apiSecret) {
        return {
          success: false,
          code: 'NO_BROKER_CREDENTIALS',
          reason: 'No broker credentials configured for LIVE trading. Connect your broker account in Settings.',
        };
      }
      try {
        activeLiveBrokerClient = resolveBrokerClient(assetClass, {
          alpacaApiKey: apiKey,
          alpacaSecretKey: apiSecret,
        });
      } catch (err: any) {
        return {
          success: false,
          code: 'NO_BROKER_CREDENTIALS',
          reason: err?.message || 'Failed to resolve broker client for LIVE trading.',
        };
      }
    }
  }

  // 3. Real Quote Resolution & Exposure Sizing:
  // Reject order if no real quote is available. Never fill against random-walk prices or $100 fallbacks.
  const realQuote = await resolveRealQuotePrice(symbol);
  if (!realQuote || realQuote.price <= 0) {
    return {
      success: false,
      code: 'NO_REAL_QUOTE',
      reason: `No real market quote available for symbol ${symbol}. Cannot execute order.`,
    };
  }

  // Check quote staleness
  if (isQuoteStale(realQuote, assetClass)) {
    return {
      success: false,
      code: 'STALE_QUOTE',
      reason: `Market quote for ${symbol} is older than allowed max age (stale quote).`,
    };
  }

  // 4. Market hours check for STOCKS market orders
  const isMarketOrder =
    orderType === 'MARKET' || orderType === 'STOP' || orderType === 'TRAILING_STOP';
  if (assetClass === 'STOCKS' && isMarketOrder) {
    if (!isRegularMarketHours()) {
      return {
        success: false,
        code: 'MARKET_CLOSED',
        reason: 'Market is closed. Market orders open at 9:30 am New York time, or place a limit order.',
      };
    }
  }

  const currentRealPrice = realQuote.price;

  // Fix exposure check bypass:
  // For MARKET orders, exposure is ALWAYS sized on the latest real quote, never on client-supplied limitPrice.
  // For LIMIT orders, exposure is sized on limitPrice (or real quote if not provided).
  const effectivePrice =
    isMarketOrder || !limitPrice || limitPrice <= 0 ? currentRealPrice : limitPrice;

  const estimatedTradeValue = Number(
    new Prisma.Decimal(quantity).mul(effectivePrice).toFixed(2),
  );

  // 5. AI Reasoning
  const aiReasoning =
    providedReasoning ||
    (await aiReasoningService.generateTradeReasoning({
      symbol,
      side,
      quantity,
      price: limitPrice ?? currentRealPrice,
      assetClass,
    }));

  // 6. MANUAL vs open APEX order conflict check
  if (owner === 'MANUAL') {
    const openApex = await prisma.order.findFirst({
      where: {
        userId,
        symbol,
        owner: 'APEX',
        status: { in: ['PENDING_SUBMIT', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_FILLED'] },
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

  const brokerType: 'MARKET' | 'LIMIT' =
    orderType === 'LIMIT' || orderType === 'STOP_LIMIT' ? 'LIMIT' : 'MARKET';

  // =========================================================================
  // SIMULATION MODE: Runs entirely inside DB interactive transaction
  // =========================================================================
  if (isSimulated) {
    return await prisma.$transaction(
      async (tx) => {
        let portfolio = await tx.portfolio.findUnique({
          where: { userId_mode: { userId, mode: 'SIM' } },
        });

        if (!portfolio) {
          portfolio = await tx.portfolio.create({
            data: {
              userId,
              mode: 'SIM',
              cashBalance: 100000,
              equity: 100000,
              peakEquity: 100000,
            },
          });
        }

        // Row lock
        const [locked] = await tx.$queryRaw<
          Array<{
            id: string;
            user_id: string;
            mode: string;
            cash_balance: Prisma.Decimal;
            equity: Prisma.Decimal;
            peak_equity: Prisma.Decimal;
          }>
        >`
          SELECT id, user_id, mode, cash_balance, equity, peak_equity
          FROM portfolios
          WHERE user_id = ${userId} AND mode = 'SIM'::"PortfolioMode"
          FOR UPDATE
        `;

        const portfolioId = locked.id;
        let currentCash = new Prisma.Decimal(locked.cash_balance);
        let currentEquity = new Prisma.Decimal(locked.equity);
        let peakEquity = new Prisma.Decimal(locked.peak_equity);

        // Handle missing or 0 peak_equity (backfill to current equity, no divide-by-zero)
        if (peakEquity.isZero() || peakEquity.isNegative()) {
          peakEquity = currentEquity;
        } else if (currentEquity.gt(peakEquity)) {
          peakEquity = currentEquity;
        }

        let currentDrawdownPct = 0;
        if (peakEquity.gt(0) && currentEquity.lt(peakEquity)) {
          currentDrawdownPct = peakEquity.sub(currentEquity).div(peakEquity).toNumber();
        }

        // Fetch Risk Vaults
        let riskVault = await tx.riskVault.findUnique({
          where: { userId_assetClass: { userId, assetClass } },
        });
        if (!riskVault) {
          riskVault = await tx.riskVault.create({
            data: {
              userId,
              assetClass,
              dailyLossLimit: 500,
              dailyLossLimitUnit: 'USD',
              maxDrawdown: 0.15,
              maxDrawdownUnit: 'PERCENT',
              perTradeExposure: 0.05,
              perTradeExposureUnit: 'PERCENT',
              cryptoEnabled: true,
              stocksEnabled: true,
              forexEnabled: true,
              assetsEnabled: true,
            },
          });
        }
        const globalVault = await tx.riskVault.findUnique({
          where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
        });

        const queuedClosesCount = await tx.order.count({
          where: {
            userId,
            status: 'QUEUED',
            assetClass: { in: [assetClass, 'GLOBAL'] },
          },
        });
        if (queuedClosesCount > 0) {
          return {
            success: false,
            code: 'EMERGENCY_STOP_ACTIVE',
            reason: 'Emergency stop is active while queued closes are pending execution.',
          };
        }

        const [realizedLossToday, globalRealizedLossToday] = await Promise.all([
          computeRealizedLossToday({ userId, assetClass, isSimulated: true, tx }),
          computeRealizedLossToday({ userId, assetClass: 'GLOBAL', isSimulated: true, tx }),
        ]);

        const riskResult = validateTradeRisk({
          riskVault,
          globalVault,
          portfolioEquity: currentEquity.toNumber(),
          tradeValue: estimatedTradeValue,
          assetClass,
          realizedLossToday,
          globalRealizedLossToday,
          peakEquity: peakEquity.toNumber(),
          currentDrawdownPct,
        });

        if (!riskResult.allowed) {
          return {
            success: false,
            code: riskResult.code,
            reason: riskResult.reason,
          };
        }

        const existingPos = await tx.position.findUnique({
          where: { portfolioId_symbol: { portfolioId, symbol } },
        });
        const heldQuantity = existingPos
          ? new Prisma.Decimal(existingPos.quantity)
          : new Prisma.Decimal(0);

        if (side === 'SELL' && heldQuantity.lt(quantity)) {
          return {
            success: false,
            code: 'INSUFFICIENT_POSITION',
            reason: `Cannot sell ${quantity} shares of ${symbol}; held quantity is ${heldQuantity.toNumber()} (short selling is not supported).`,
          };
        }

        if (side === 'BUY') {
          const requiredCash = new Prisma.Decimal(quantity).mul(effectivePrice);
          if (currentCash.lt(requiredCash)) {
            return {
              success: false,
              code: 'INSUFFICIENT_FUNDS',
              reason: `Insufficient cash balance ($${currentCash.toFixed(2)}) for order value ($${requiredCash.toFixed(2)}).`,
            };
          }
        }

        const dbOrder = await tx.order.create({
          data: {
            userId,
            symbol,
            side,
            orderType,
            quantity: new Prisma.Decimal(quantity),
            limitPrice: limitPrice ? new Prisma.Decimal(limitPrice) : null,
            stopPrice: stopPrice ? new Prisma.Decimal(stopPrice) : null,
            trailingAmount: trailingAmount ? new Prisma.Decimal(trailingAmount) : null,
            takeProfit: takeProfit ? new Prisma.Decimal(takeProfit) : null,
            stopLoss: stopLoss ? new Prisma.Decimal(stopLoss) : null,
            isOco: isOco ?? false,
            owner,
            assetClass,
            status: 'PENDING',
            isSimulated: true,
            timeInForce: params.timeInForce ?? (assetClass === 'CRYPTO' ? 'GTC' : 'DAY'),
          },
        });

        const simBroker = new SimBrokerClient({ userId, tx });
        let brokerOrder: BrokerOrder;
        try {
          brokerOrder = await simBroker.createOrder({
            symbol,
            side,
            qty: quantity,
            type: brokerType,
            limitPrice,
            estimatedPrice: currentRealPrice,
            idempotencyKey: dbOrder.id,
            clientOrderId: dbOrder.id,
            assetClass,
          });
        } catch (err: any) {
          await tx.order.update({
            where: { id: dbOrder.id },
            data: { status: 'REJECTED' },
          });
          return {
            success: false,
            code: err?.code || 'SIMULATION_ERROR',
            reason: err?.message || 'Simulation execution error',
          };
        }

        if (brokerOrder.status === 'FILLED') {
          const fillPrice = brokerOrder.fillPrice!;
          const fillPriceDec = new Prisma.Decimal(fillPrice);
          const quantityDec = new Prisma.Decimal(quantity);
          const grossTradeValue = quantityDec.mul(fillPriceDec);
          const feeDec = new Prisma.Decimal(brokerOrder.fee ?? 0);

          let realizedPnl: Prisma.Decimal | null = null;
          if (side === 'SELL' && existingPos) {
            const avgCost = new Prisma.Decimal(existingPos.averageCost);
            const grossPnl = fillPriceDec.sub(avgCost).mul(quantityDec);
            realizedPnl = grossPnl.sub(feeDec);
          }

          const trade = await tx.trade.create({
            data: {
              orderId: dbOrder.id,
              fillPrice: fillPriceDec,
              fillQuantity: quantityDec,
              fee: feeDec,
              realizedPnl,
              aiReasoning,
              owner,
              filledAt: brokerOrder.filledAt ?? new Date(),
            },
          });

          await tx.order.update({
            where: { id: dbOrder.id },
            data: {
              status: 'FILLED',
              brokerOrderId: brokerOrder.id,
            },
          });

          if (side === 'BUY') {
            const oldQty = existingPos
              ? new Prisma.Decimal(existingPos.quantity)
              : new Prisma.Decimal(0);
            const newQty = oldQty.add(quantityDec);
            const oldCost = existingPos
              ? new Prisma.Decimal(existingPos.averageCost).mul(oldQty)
              : new Prisma.Decimal(0);
            const newAvg = oldCost.add(grossTradeValue).add(feeDec).div(newQty);

            await tx.position.upsert({
              where: { portfolioId_symbol: { portfolioId, symbol } },
              create: {
                portfolioId,
                symbol,
                quantity: newQty,
                averageCost: newAvg,
              },
              update: {
                quantity: newQty,
                averageCost: newAvg,
              },
            });

            // Deduct cost and commission from cash
            currentCash = currentCash.sub(grossTradeValue.add(feeDec));
          } else {
            // SELL
            if (existingPos) {
              const oldQty = new Prisma.Decimal(existingPos.quantity);
              const newQty = oldQty.sub(quantityDec);
              if (newQty.isZero() || newQty.isNegative()) {
                await tx.position.delete({
                  where: { portfolioId_symbol: { portfolioId, symbol } },
                });
              } else {
                await tx.position.update({
                  where: { portfolioId_symbol: { portfolioId, symbol } },
                  data: { quantity: newQty },
                });
              }
            }
            // Credit proceeds minus commission to cash
            currentCash = currentCash.add(grossTradeValue.sub(feeDec));
          }

          // Mark-to-market equity update
          const openPositions = await tx.position.findMany({ where: { portfolioId } });
          let totalPosValue = new Prisma.Decimal(0);
          for (const pos of openPositions) {
            const q = await resolveRealQuotePrice(pos.symbol);
            const px = q ? new Prisma.Decimal(q.price) : new Prisma.Decimal(pos.averageCost);
            totalPosValue = totalPosValue.add(new Prisma.Decimal(pos.quantity).mul(px));
          }

          currentEquity = currentCash.add(totalPosValue);
          if (currentEquity.gt(peakEquity)) {
            peakEquity = currentEquity;
          }

          await tx.portfolio.update({
            where: { id: portfolioId },
            data: {
              cashBalance: currentCash,
              equity: currentEquity,
              peakEquity,
            },
          });

          const actionText = side === 'BUY' ? 'Opened' : 'Closed';
          const activityEntry = await createActivityEntry({
            userId,
            eventType: side === 'BUY' ? 'TRADE_OPENED' : 'TRADE_CLOSED',
            message: `${actionText} ${symbol} position · Executed ${quantity} @ $${fillPrice.toFixed(2)}${
              feeDec.gt(0) ? ` (fee: $${feeDec.toFixed(2)})` : ''
            }`,
          });
          eventBus.broadcastToUser(userId, 'ACTIVITY_LOGGED', activityEntry);

          return {
            success: true,
            order: { ...dbOrder, status: 'FILLED', brokerOrderId: brokerOrder.id },
            trade,
            halfSpreadBps: brokerOrder.halfSpreadBps,
            slippageBps: brokerOrder.slippageBps,
          };
        } else {
          // SUBMITTED (open limit order)
          const effPrice = limitPrice
            ? new Prisma.Decimal(limitPrice)
            : new Prisma.Decimal(currentRealPrice);
          const reservedCash =
            side === 'BUY'
              ? new Prisma.Decimal(quantity).mul(effPrice)
              : new Prisma.Decimal(0);
          const reservedQuantity =
            side === 'SELL' ? new Prisma.Decimal(quantity) : new Prisma.Decimal(0);

          await tx.order.update({
            where: { id: dbOrder.id },
            data: {
              status: 'SUBMITTED',
              brokerOrderId: brokerOrder.id,
              reservedCash,
              reservedQuantity,
            },
          });
          return {
            success: true,
            order: {
              ...dbOrder,
              status: 'SUBMITTED',
              brokerOrderId: brokerOrder.id,
              reservedCash,
              reservedQuantity,
            },
            halfSpreadBps: brokerOrder.halfSpreadBps,
            slippageBps: brokerOrder.slippageBps,
          };
        }
      },
      { timeout: 15000 },
    );
  }

  // =========================================================================
  // LIVE MODE: 2-Phase Execution — NEVER call external broker inside a DB tx
  // =========================================================================

  // Transaction 1: Lock portfolio, verify risk/balance with reservations, insert PENDING_SUBMIT
  const tx1Result = await prisma.$transaction(
    async (tx) => {
      let portfolio = await tx.portfolio.findUnique({
        where: { userId_mode: { userId, mode: 'LIVE' } },
      });

      if (!portfolio) {
        portfolio = await tx.portfolio.create({
          data: {
            userId,
            mode: 'LIVE',
            cashBalance: 0,
            equity: 0,
            peakEquity: 0,
          },
        });
      }

      // Row lock on LIVE portfolio
      const [locked] = await tx.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          mode: string;
          cash_balance: Prisma.Decimal;
          equity: Prisma.Decimal;
          peak_equity: Prisma.Decimal;
        }>
      >`
        SELECT id, user_id, mode, cash_balance, equity, peak_equity
        FROM portfolios
        WHERE user_id = ${userId} AND mode = 'LIVE'::"PortfolioMode"
        FOR UPDATE
      `;

      const portfolioId = locked.id;
      let currentCash = new Prisma.Decimal(locked.cash_balance);
      let currentEquity = new Prisma.Decimal(locked.equity);
      let peakEquity = new Prisma.Decimal(locked.peak_equity);

      if (peakEquity.isZero() || peakEquity.isNegative()) {
        peakEquity = currentEquity;
      } else if (currentEquity.gt(peakEquity)) {
        peakEquity = currentEquity;
      }

      let currentDrawdownPct = 0;
      if (peakEquity.gt(0) && currentEquity.lt(peakEquity)) {
        currentDrawdownPct = peakEquity.sub(currentEquity).div(peakEquity).toNumber();
      }

      // Fetch Risk Vaults
      let riskVault = await tx.riskVault.findUnique({
        where: { userId_assetClass: { userId, assetClass } },
      });
      if (!riskVault) {
        riskVault = await tx.riskVault.create({
          data: {
            userId,
            assetClass,
            dailyLossLimit: 500,
            dailyLossLimitUnit: 'USD',
            maxDrawdown: 0.15,
            maxDrawdownUnit: 'PERCENT',
            perTradeExposure: 0.05,
            perTradeExposureUnit: 'PERCENT',
            cryptoEnabled: true,
            stocksEnabled: true,
            forexEnabled: true,
            assetsEnabled: true,
          },
        });
      }
      const globalVault = await tx.riskVault.findUnique({
        where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
      });

      const queuedClosesCount = await tx.order.count({
        where: {
          userId,
          status: 'QUEUED',
          assetClass: { in: [assetClass, 'GLOBAL'] },
        },
      });
      if (queuedClosesCount > 0) {
        return {
          allowed: false,
          code: 'EMERGENCY_STOP_ACTIVE',
          reason: 'Emergency stop is active while queued closes are pending execution.',
        };
      }

      // Compute realized losses today
      const [realizedLossToday, globalRealizedLossToday] = await Promise.all([
        computeRealizedLossToday({ userId, assetClass, isSimulated: false, tx }),
        computeRealizedLossToday({ userId, assetClass: 'GLOBAL', isSimulated: false, tx }),
      ]);

      const riskResult = validateTradeRisk({
        riskVault,
        globalVault,
        portfolioEquity: currentEquity.toNumber(),
        tradeValue: estimatedTradeValue,
        assetClass,
        realizedLossToday,
        globalRealizedLossToday,
        peakEquity: peakEquity.toNumber(),
        currentDrawdownPct,
      });

      if (!riskResult.allowed) {
        return {
          allowed: false,
          code: riskResult.code,
          reason: riskResult.reason,
        };
      }

      // Query open orders and count reserved cash / reserved quantity
      const openOrders = await tx.order.findMany({
        where: {
          userId,
          isSimulated: false,
          status: { in: ['PENDING_SUBMIT', 'PENDING', 'SUBMITTED', 'ACCEPTED'] },
        },
      });

      let totalReservedCash = new Prisma.Decimal(0);
      let totalReservedQuantity = new Prisma.Decimal(0);
      for (const o of openOrders) {
        if (o.side === 'BUY') {
          const rCash = o.reservedCash.gt(0)
            ? o.reservedCash
            : o.quantity.mul(o.limitPrice ?? effectivePrice);
          totalReservedCash = totalReservedCash.add(rCash);
        } else if (o.side === 'SELL' && o.symbol === symbol) {
          const rQty = o.reservedQuantity.gt(0) ? o.reservedQuantity : o.quantity;
          totalReservedQuantity = totalReservedQuantity.add(rQty);
        }
      }

      const existingPos = await tx.position.findUnique({
        where: { portfolioId_symbol: { portfolioId, symbol } },
      });
      const heldQuantity = existingPos
        ? new Prisma.Decimal(existingPos.quantity)
        : new Prisma.Decimal(0);

      // Sizing checks against available cash/position
      if (side === 'SELL') {
        const availableQuantity = heldQuantity.sub(totalReservedQuantity);
        if (new Prisma.Decimal(quantity).gt(availableQuantity)) {
          return {
            allowed: false,
            code: 'INSUFFICIENT_POSITION',
            reason: `Cannot sell ${quantity} shares of ${symbol}; available unreserved quantity is ${availableQuantity.toNumber()} (short selling is not supported).`,
          };
        }
      }

      const requiredCash = new Prisma.Decimal(quantity).mul(effectivePrice);
      if (side === 'BUY') {
        const availableCash = currentCash.sub(totalReservedCash);
        if (requiredCash.gt(availableCash)) {
          return {
            allowed: false,
            code: 'INSUFFICIENT_FUNDS',
            reason: `Insufficient cash balance ($${availableCash.toFixed(2)} available) for order value ($${requiredCash.toFixed(2)}).`,
          };
        }
      }

      // Insert Order with status PENDING_SUBMIT and reservation
      const order = await tx.order.create({
        data: {
          userId,
          symbol,
          side,
          orderType,
          quantity: new Prisma.Decimal(quantity),
          limitPrice: limitPrice ? new Prisma.Decimal(limitPrice) : null,
          stopPrice: stopPrice ? new Prisma.Decimal(stopPrice) : null,
          trailingAmount: trailingAmount ? new Prisma.Decimal(trailingAmount) : null,
          takeProfit: takeProfit ? new Prisma.Decimal(takeProfit) : null,
          stopLoss: stopLoss ? new Prisma.Decimal(stopLoss) : null,
          isOco: isOco ?? false,
          owner,
          assetClass,
          status: 'PENDING_SUBMIT',
          isSimulated: false,
          reservedCash: side === 'BUY' ? requiredCash : new Prisma.Decimal(0),
          reservedQuantity: side === 'SELL' ? new Prisma.Decimal(quantity) : new Prisma.Decimal(0),
        },
      });

      return {
        allowed: true,
        portfolioId,
        order,
      };
    },
    { timeout: 15000 },
  );

  if (!tx1Result.allowed || !tx1Result.order) {
    return {
      success: false,
      code: tx1Result.code,
      reason: tx1Result.reason,
    };
  }

  const pendingOrder = tx1Result.order;
  const portfolioId = tx1Result.portfolioId;

  // Step (b): Call the external broker OUTSIDE any DB transaction
  let brokerOrder: BrokerOrder | undefined;
  let brokerError: any = null;

  try {
    brokerOrder = await activeLiveBrokerClient!.createOrder({
      symbol,
      side,
      qty: quantity,
      type: brokerType,
      limitPrice,
      estimatedPrice: currentRealPrice,
      idempotencyKey: pendingOrder.id,
      clientOrderId: pendingOrder.id,
      assetClass,
    });
  } catch (err: any) {
    brokerError = err;
  }

  // Step (c): Transaction 2 records broker response, releasing reservation on reject
  return await prisma.$transaction(
    async (tx) => {
      // Row lock on LIVE portfolio
      const [locked] = await tx.$queryRaw<
        Array<{
          id: string;
          cash_balance: Prisma.Decimal;
          equity: Prisma.Decimal;
          peak_equity: Prisma.Decimal;
        }>
      >`
        SELECT id, cash_balance, equity, peak_equity
        FROM portfolios
        WHERE id = ${portfolioId}
        FOR UPDATE
      `;

      let currentCash = new Prisma.Decimal(locked.cash_balance);
      let currentEquity = new Prisma.Decimal(locked.equity);
      let peakEquity = new Prisma.Decimal(locked.peak_equity);

      if (brokerError || !brokerOrder || brokerOrder.status === 'REJECTED') {
        // Release reservation
        const updated = await tx.order.update({
          where: { id: pendingOrder.id },
          data: {
            status: 'REJECTED',
            reservedCash: 0,
            reservedQuantity: 0,
          },
        });
        return {
          success: false,
          code: 'BROKER_REJECTED',
          reason: brokerError?.message || 'External broker rejected order',
          order: updated,
        };
      }

      if (brokerOrder.status === 'SUBMITTED') {
        const updated = await tx.order.update({
          where: { id: pendingOrder.id },
          data: {
            status: 'SUBMITTED',
            brokerOrderId: brokerOrder.id,
          },
        });
        return {
          success: true,
          order: updated,
        };
      }

      // FILLED at external broker
      const fillPrice = brokerOrder.fillPrice ?? currentRealPrice;
      const fillPriceDec = new Prisma.Decimal(fillPrice);
      const quantityDec = new Prisma.Decimal(quantity);
      const grossTradeValue = quantityDec.mul(fillPriceDec);
      const feeDec = new Prisma.Decimal(brokerOrder.fee ?? 0);

      const existingPos = await tx.position.findUnique({
        where: { portfolioId_symbol: { portfolioId, symbol } },
      });

      let realizedPnl: Prisma.Decimal | null = null;
      if (side === 'SELL' && existingPos) {
        const avgCost = new Prisma.Decimal(existingPos.averageCost);
        const grossPnl = fillPriceDec.sub(avgCost).mul(quantityDec);
        realizedPnl = grossPnl.sub(feeDec);
      }

      const trade = await tx.trade.create({
        data: {
          orderId: pendingOrder.id,
          fillPrice: fillPriceDec,
          fillQuantity: quantityDec,
          fee: feeDec,
          realizedPnl,
          aiReasoning,
          owner,
          filledAt: brokerOrder.filledAt ?? new Date(),
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: pendingOrder.id },
        data: {
          status: 'FILLED',
          brokerOrderId: brokerOrder.id,
          reservedCash: 0,
          reservedQuantity: 0,
        },
      });

      if (side === 'BUY') {
        const oldQty = existingPos
          ? new Prisma.Decimal(existingPos.quantity)
          : new Prisma.Decimal(0);
        const newQty = oldQty.add(quantityDec);
        const oldCost = existingPos
          ? new Prisma.Decimal(existingPos.averageCost).mul(oldQty)
          : new Prisma.Decimal(0);
        const newAvg = oldCost.add(grossTradeValue).add(feeDec).div(newQty);

        await tx.position.upsert({
          where: { portfolioId_symbol: { portfolioId, symbol } },
          create: {
            portfolioId,
            symbol,
            quantity: newQty,
            averageCost: newAvg,
          },
          update: {
            quantity: newQty,
            averageCost: newAvg,
          },
        });

        currentCash = currentCash.sub(grossTradeValue.add(feeDec));
      } else {
        if (existingPos) {
          const oldQty = new Prisma.Decimal(existingPos.quantity);
          const newQty = oldQty.sub(quantityDec);
          if (newQty.isZero() || newQty.isNegative()) {
            await tx.position.delete({
              where: { portfolioId_symbol: { portfolioId, symbol } },
            });
          } else {
            await tx.position.update({
              where: { portfolioId_symbol: { portfolioId, symbol } },
              data: { quantity: newQty },
            });
          }
        }
        currentCash = currentCash.add(grossTradeValue.sub(feeDec));
      }

      // Mark-to-market equity update
      const openPositions = await tx.position.findMany({ where: { portfolioId } });
      let totalPosValue = new Prisma.Decimal(0);
      for (const pos of openPositions) {
        const q = await resolveRealQuotePrice(pos.symbol);
        const px = q ? new Prisma.Decimal(q.price) : new Prisma.Decimal(pos.averageCost);
        totalPosValue = totalPosValue.add(new Prisma.Decimal(pos.quantity).mul(px));
      }

      currentEquity = currentCash.add(totalPosValue);
      if (peakEquity.isZero() || currentEquity.gt(peakEquity)) {
        peakEquity = currentEquity;
      }

      await tx.portfolio.update({
        where: { id: portfolioId },
        data: {
          cashBalance: currentCash,
          equity: currentEquity,
          peakEquity,
        },
      });

      const actionText = side === 'BUY' ? 'Opened' : 'Closed';
      const activityEntry = await createActivityEntry({
        userId,
        eventType: side === 'BUY' ? 'TRADE_OPENED' : 'TRADE_CLOSED',
        message: `${actionText} ${symbol} LIVE position · Executed ${quantity} @ $${fillPrice.toFixed(2)}${
          feeDec.gt(0) ? ` (fee: $${feeDec.toFixed(2)})` : ''
        }`,
      });
      eventBus.broadcastToUser(userId, 'ACTIVITY_LOGGED', activityEntry);

      return {
        success: true,
        order: updatedOrder,
        trade,
      };
    },
    { timeout: 15000 },
  );
}

/**
 * Reconciliation Job:
 * Looks up PENDING_SUBMIT orders older than 2 minutes at the broker by client_order_id
 * and repairs their state.
 */
export async function reconcilePendingSubmitOrders(): Promise<number> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const stuckOrders = await prisma.order.findMany({
    where: {
      status: { in: ['PENDING_SUBMIT', 'PARTIALLY_FILLED'] },
    },
    include: { user: { include: { profile: true } } },
  });

  let repairedCount = 0;

  for (const order of stuckOrders) {
    try {
      if (order.isSimulated) {
        const orderAgeMs = Date.now() - order.createdAt.getTime();
        if (orderAgeMs >= 10 * 60 * 1000) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'REJECTED', reservedCash: 0, reservedQuantity: 0 },
          });
          repairedCount++;
        }
        continue;
      }

      const apiKey = decryptSecret(order.user.profile?.alpacaApiKey);
      const apiSecret = decryptSecret(order.user.profile?.alpacaSecretKey);
      if (!apiKey || !apiSecret) {
        const orderAgeMs = Date.now() - order.createdAt.getTime();
        if (orderAgeMs >= 10 * 60 * 1000) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'REJECTED', reservedCash: 0, reservedQuantity: 0 },
          });
          repairedCount++;
        }
        continue;
      }

      const liveBroker = resolveBrokerClient(order.assetClass, {
        alpacaApiKey: apiKey,
        alpacaSecretKey: apiSecret,
      });

      let brokerOrder: BrokerOrder | null = null;
      if (liveBroker.getOrderByClientOrderId) {
        brokerOrder = await liveBroker.getOrderByClientOrderId(order.id);
      } else if (order.brokerOrderId) {
        brokerOrder = await liveBroker.getOrder(order.brokerOrderId);
      }

      if (!brokerOrder) {
        // Section A.5: if broker has no order for client_order_id after 10 minutes, mark it REJECTED and release reservation
        const orderAgeMs = Date.now() - order.createdAt.getTime();
        if (orderAgeMs >= 10 * 60 * 1000) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'REJECTED', reservedCash: 0, reservedQuantity: 0 },
          });
          repairedCount++;
        }
        // Under 10 minutes: keep PENDING_SUBMIT to allow broker latency
      } else {
        // Broker found the order; update DB state
        if (brokerOrder.status === 'FILLED') {
          await prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: 'FILLED',
                brokerOrderId: brokerOrder!.id,
                reservedCash: 0,
                reservedQuantity: 0,
              },
            });

            const existingTrades = await tx.trade.findMany({ where: { orderId: order.id } });
            const alreadyFilledQty = existingTrades.reduce(
              (sum, t) => sum.add(t.fillQuantity),
              new Prisma.Decimal(0),
            );
            const totalQty = new Prisma.Decimal(brokerOrder!.qty);
            const deltaQty = totalQty.sub(alreadyFilledQty);

            if (deltaQty.gt(0)) {
              await tx.trade.create({
                data: {
                  orderId: order.id,
                  fillPrice: new Prisma.Decimal(brokerOrder!.fillPrice ?? 100),
                  fillQuantity: deltaQty,
                  fee: new Prisma.Decimal(brokerOrder!.fee ?? 0),
                  realizedPnl: null,
                  owner: order.owner,
                  filledAt: brokerOrder!.filledAt ?? new Date(),
                },
              });
            }
          });
          repairedCount++;
        } else if (brokerOrder.status === 'PARTIALLY_FILLED') {
          // Section A.5: Handle PARTIALLY_FILLED in LIVE: record each fill, update position and cash per fill, and keep remaining reservation
          await prisma.$transaction(async (tx) => {
            const existingTrades = await tx.trade.findMany({ where: { orderId: order.id } });
            const alreadyFilledQty = existingTrades.reduce(
              (sum, t) => sum.add(t.fillQuantity),
              new Prisma.Decimal(0),
            );
            const totalFilledQty = new Prisma.Decimal(brokerOrder!.qtyFilled ?? brokerOrder!.qty);
            const deltaQty = totalFilledQty.sub(alreadyFilledQty);

            if (deltaQty.gt(0)) {
              const fillPrice = new Prisma.Decimal(brokerOrder!.fillPrice ?? 100);
              const fee = new Prisma.Decimal(brokerOrder!.fee ?? 0);
              const grossTradeValue = deltaQty.mul(fillPrice);

              let portfolio = await tx.portfolio.findUnique({
                where: { userId_mode: { userId: order.userId, mode: 'LIVE' } },
              });
              if (!portfolio) return;

              let currentCash = new Prisma.Decimal(portfolio.cashBalance);
              let peakEquity = new Prisma.Decimal(portfolio.peakEquity);
              const existingPos = await tx.position.findUnique({
                where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
              });

              let realizedPnl: Prisma.Decimal | null = null;
              if (order.side === 'SELL' && existingPos) {
                const avgCost = new Prisma.Decimal(existingPos.averageCost);
                realizedPnl = fillPrice.sub(avgCost).mul(deltaQty).sub(fee);
              }

              await tx.trade.create({
                data: {
                  orderId: order.id,
                  fillPrice,
                  fillQuantity: deltaQty,
                  fee,
                  realizedPnl,
                  owner: order.owner,
                  filledAt: brokerOrder!.filledAt ?? new Date(),
                },
              });

              if (order.side === 'BUY') {
                const oldQty = existingPos ? new Prisma.Decimal(existingPos.quantity) : new Prisma.Decimal(0);
                const newQty = oldQty.add(deltaQty);
                const oldCost = existingPos
                  ? new Prisma.Decimal(existingPos.averageCost).mul(oldQty)
                  : new Prisma.Decimal(0);
                const newAvg = oldCost.add(grossTradeValue).add(fee).div(newQty);

                await tx.position.upsert({
                  where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
                  create: {
                    portfolioId: portfolio.id,
                    symbol: order.symbol,
                    quantity: newQty,
                    averageCost: newAvg,
                  },
                  update: {
                    quantity: newQty,
                    averageCost: newAvg,
                  },
                });

                currentCash = currentCash.sub(grossTradeValue.add(fee));
              } else {
                if (existingPos) {
                  const oldQty = new Prisma.Decimal(existingPos.quantity);
                  const newQty = oldQty.sub(deltaQty);
                  if (newQty.isZero() || newQty.isNegative()) {
                    await tx.position.delete({
                      where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
                    });
                  } else {
                    await tx.position.update({
                      where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
                      data: { quantity: newQty },
                    });
                  }
                }
                currentCash = currentCash.add(grossTradeValue.sub(fee));
              }

              // Update remaining reservation
              const orderTotalQty = new Prisma.Decimal(order.quantity);
              const remainingQty = orderTotalQty.sub(totalFilledQty);
              const remainingReservedCash =
                order.side === 'BUY'
                  ? remainingQty.mul(order.limitPrice ?? fillPrice)
                  : new Prisma.Decimal(0);
              const remainingReservedQuantity =
                order.side === 'SELL' ? remainingQty : new Prisma.Decimal(0);

              await tx.order.update({
                where: { id: order.id },
                data: {
                  status: 'PARTIALLY_FILLED',
                  brokerOrderId: brokerOrder!.id,
                  reservedCash: remainingReservedCash,
                  reservedQuantity: remainingReservedQuantity,
                },
              });

              // Mark-to-market equity update
              const openPositions = await tx.position.findMany({ where: { portfolioId: portfolio.id } });
              let totalPosValue = new Prisma.Decimal(0);
              for (const pos of openPositions) {
                const q = await resolveRealQuotePrice(pos.symbol);
                const px = q ? new Prisma.Decimal(q.price) : new Prisma.Decimal(pos.averageCost);
                totalPosValue = totalPosValue.add(new Prisma.Decimal(pos.quantity).mul(px));
              }
              const currentEquity = currentCash.add(totalPosValue);
              if (currentEquity.gt(peakEquity)) {
                peakEquity = currentEquity;
              }

              await tx.portfolio.update({
                where: { id: portfolio.id },
                data: {
                  cashBalance: currentCash,
                  equity: currentEquity,
                  peakEquity,
                },
              });
            }
          });
          repairedCount++;
        } else if (brokerOrder.status === 'CANCELLED' || brokerOrder.status === 'REJECTED') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: brokerOrder.status,
              brokerOrderId: brokerOrder.id,
              reservedCash: 0,
              reservedQuantity: 0,
            },
          });
          repairedCount++;
        } else {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'SUBMITTED', brokerOrderId: brokerOrder.id },
          });
          repairedCount++;
        }
      }
    } catch {
      // Continue next order
    }
  }

  return repairedCount;
}

/**
 * Mark-to-market periodic job:
 * Recalculates equity = cash + positions at latest real quotes.
 * Updates peak equity so falling positions trip drawdown limits without a new fill.
 * Writes snapshot to equity_snapshots table for analytics.
 */
export async function syncAllPortfoliosMarkToMarket(): Promise<number> {
  const portfolios = await prisma.portfolio.findMany({
    include: { positions: true },
  });

  let syncedCount = 0;

  for (const port of portfolios) {
    try {
      let totalPosValue = new Prisma.Decimal(0);
      for (const pos of port.positions) {
        const q = await resolveRealQuotePrice(pos.symbol);
        const px = q ? new Prisma.Decimal(q.price) : new Prisma.Decimal(pos.averageCost);
        totalPosValue = totalPosValue.add(new Prisma.Decimal(pos.quantity).mul(px));
      }

      const currentEquity = new Prisma.Decimal(port.cashBalance).add(totalPosValue);
      let peakEquity = new Prisma.Decimal(port.peakEquity);
      if (peakEquity.isZero() || currentEquity.gt(peakEquity)) {
        peakEquity = currentEquity;
      }

      await prisma.portfolio.update({
        where: { id: port.id },
        data: {
          equity: currentEquity,
          peakEquity,
        },
      });

      // Write snapshot to equity_snapshots table
      await prisma.equitySnapshot.create({
        data: {
          userId: port.userId,
          portfolioId: port.id,
          mode: port.mode,
          equity: currentEquity,
          cashBalance: port.cashBalance,
        },
      });

      syncedCount++;
    } catch {
      // Continue next portfolio
    }
  }

  return syncedCount;
}

/**
 * SIM pending limit orders job (Section A.4):
 * Runs every 15s for crypto, and for stocks only during market hours.
 * Fills pending SIM limit orders when the real quote crosses, using the same transaction and lock as a normal fill,
 * and releases the reservation on cancel or expiry. Default time-in-force DAY for stocks and GTC for crypto.
 * Also fills queued SIM closes at the first real quote after open.
 */
export async function fillPendingSimLimitOrders(targetUserId?: string): Promise<number> {
  const isMarketOpen = isRegularMarketHours();

  const pendingSimOrders = await prisma.order.findMany({
    where: {
      isSimulated: true,
      status: { in: ['SUBMITTED', 'PENDING', 'QUEUED'] },
      ...(targetUserId ? { userId: targetUserId } : {}),
    },
    include: { user: true },
  });

  let filledCount = 0;

  for (const order of pendingSimOrders) {
    try {
      const isStock = order.assetClass === 'STOCKS';

      // Check DAY time-in-force expiry for stocks (expire at 4:00 PM NY close of session)
      if (isStock && order.timeInForce === 'DAY') {
        if (isDayOrderExpired(order.createdAt, new Date())) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'EXPIRED', reservedCash: 0, reservedQuantity: 0 },
          });
          continue;
        }
      }

      // For stocks, only execute during regular market hours
      if (isStock && !isMarketOpen) {
        continue;
      }

      const quote = await resolveRealQuotePrice(order.symbol);
      if (!quote) continue;
      const currentPrice = quote.price;

      // Handle QUEUED closes from emergency stop (close at first real quote after open)
      if (order.status === 'QUEUED') {
        await prisma.$transaction(async (tx) => {
          let portfolio = await tx.portfolio.findUnique({
            where: { userId_mode: { userId: order.userId, mode: 'SIM' } },
          });
          if (!portfolio) return;

          // Row lock on SIM portfolio
          await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${portfolio.id} FOR UPDATE`;

          const fillPriceDec = new Prisma.Decimal(currentPrice);
          const quantityDec = new Prisma.Decimal(order.quantity);
          const grossTradeValue = quantityDec.mul(fillPriceDec);
          const feeDec = new Prisma.Decimal(0);

          const existingPos = await tx.position.findUnique({
            where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
          });

          let realizedPnl: Prisma.Decimal | null = null;
          if (existingPos) {
            const avgCost = new Prisma.Decimal(existingPos.averageCost);
            realizedPnl = fillPriceDec.sub(avgCost).mul(quantityDec).sub(feeDec);
          }

          await tx.trade.create({
            data: {
              orderId: order.id,
              fillPrice: fillPriceDec,
              fillQuantity: quantityDec,
              fee: feeDec,
              realizedPnl,
              owner: order.owner,
              filledAt: new Date(),
            },
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'FILLED',
              reservedCash: 0,
              reservedQuantity: 0,
            },
          });

          if (existingPos) {
            const oldQty = new Prisma.Decimal(existingPos.quantity);
            const newQty = oldQty.sub(quantityDec);
            if (newQty.isZero() || newQty.isNegative()) {
              await tx.position.delete({
                where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
              });
            } else {
              await tx.position.update({
                where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
                data: { quantity: newQty },
              });
            }
          }

          let currentCash = new Prisma.Decimal(portfolio.cashBalance).add(grossTradeValue.sub(feeDec));

          const openPositions = await tx.position.findMany({ where: { portfolioId: portfolio.id } });
          let totalPosValue = new Prisma.Decimal(0);
          for (const pos of openPositions) {
            const q = await resolveRealQuotePrice(pos.symbol);
            const px = q ? new Prisma.Decimal(q.price) : new Prisma.Decimal(pos.averageCost);
            totalPosValue = totalPosValue.add(new Prisma.Decimal(pos.quantity).mul(px));
          }
          const currentEquity = currentCash.add(totalPosValue);
          let peakEquity = new Prisma.Decimal(portfolio.peakEquity);
          if (currentEquity.gt(peakEquity)) peakEquity = currentEquity;

          await tx.portfolio.update({
            where: { id: portfolio.id },
            data: {
              cashBalance: currentCash,
              equity: currentEquity,
              peakEquity,
            },
          });

          await tx.equitySnapshot.create({
            data: {
              userId: order.userId,
              portfolioId: portfolio.id,
              mode: 'SIM',
              equity: currentEquity,
              cashBalance: currentCash,
            },
          });
        });
        filledCount++;
        continue;
      }

      // Check quote cross conditions
      const limitPrice = order.limitPrice ? Number(order.limitPrice) : null;
      const stopPrice = order.stopPrice ? Number(order.stopPrice) : null;
      let shouldFill = false;

      if (order.orderType === 'LIMIT' && limitPrice !== null) {
        if (order.side === 'BUY' && currentPrice <= limitPrice) {
          shouldFill = true;
        } else if (order.side === 'SELL' && currentPrice >= limitPrice) {
          shouldFill = true;
        }
      } else if (order.orderType === 'STOP' && stopPrice !== null) {
        if (order.side === 'BUY' && currentPrice >= stopPrice) {
          shouldFill = true;
        } else if (order.side === 'SELL' && currentPrice <= stopPrice) {
          shouldFill = true;
        }
      }

      if (!shouldFill) continue;

      // Fill crossed order using the same transaction and row lock as normal fill
      await prisma.$transaction(async (tx) => {
        let portfolio = await tx.portfolio.findUnique({
          where: { userId_mode: { userId: order.userId, mode: 'SIM' } },
        });
        if (!portfolio) return;

        // Row lock
        await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${portfolio.id} FOR UPDATE`;

        const fillPriceDec = new Prisma.Decimal(currentPrice);
        const quantityDec = new Prisma.Decimal(order.quantity);
        const grossTradeValue = quantityDec.mul(fillPriceDec);
        const feeDec = new Prisma.Decimal(0);

        const existingPos = await tx.position.findUnique({
          where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
        });

        let realizedPnl: Prisma.Decimal | null = null;
        if (order.side === 'SELL' && existingPos) {
          const avgCost = new Prisma.Decimal(existingPos.averageCost);
          realizedPnl = fillPriceDec.sub(avgCost).mul(quantityDec).sub(feeDec);
        }

        await tx.trade.create({
          data: {
            orderId: order.id,
            fillPrice: fillPriceDec,
            fillQuantity: quantityDec,
            fee: feeDec,
            realizedPnl,
            owner: order.owner,
            filledAt: new Date(),
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'FILLED',
            reservedCash: 0,
            reservedQuantity: 0,
          },
        });

        let currentCash = new Prisma.Decimal(portfolio.cashBalance);

        if (order.side === 'BUY') {
          const oldQty = existingPos ? new Prisma.Decimal(existingPos.quantity) : new Prisma.Decimal(0);
          const newQty = oldQty.add(quantityDec);
          const oldCost = existingPos
            ? new Prisma.Decimal(existingPos.averageCost).mul(oldQty)
            : new Prisma.Decimal(0);
          const newAvg = oldCost.add(grossTradeValue).add(feeDec).div(newQty);

          await tx.position.upsert({
            where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
            create: {
              portfolioId: portfolio.id,
              symbol: order.symbol,
              quantity: newQty,
              averageCost: newAvg,
            },
            update: {
              quantity: newQty,
              averageCost: newAvg,
            },
          });

          currentCash = currentCash.sub(grossTradeValue.add(feeDec));
        } else {
          if (existingPos) {
            const oldQty = new Prisma.Decimal(existingPos.quantity);
            const newQty = oldQty.sub(quantityDec);
            if (newQty.isZero() || newQty.isNegative()) {
              await tx.position.delete({
                where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
              });
            } else {
              await tx.position.update({
                where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: order.symbol } },
                data: { quantity: newQty },
              });
            }
          }
          currentCash = currentCash.add(grossTradeValue.sub(feeDec));
        }

        // Mark-to-market
        const openPositions = await tx.position.findMany({ where: { portfolioId: portfolio.id } });
        let totalPosValue = new Prisma.Decimal(0);
        for (const pos of openPositions) {
          const q = await resolveRealQuotePrice(pos.symbol);
          const px = q ? new Prisma.Decimal(q.price) : new Prisma.Decimal(pos.averageCost);
          totalPosValue = totalPosValue.add(new Prisma.Decimal(pos.quantity).mul(px));
        }
        const currentEquity = currentCash.add(totalPosValue);
        let peakEquity = new Prisma.Decimal(portfolio.peakEquity);
        if (currentEquity.gt(peakEquity)) peakEquity = currentEquity;

        await tx.portfolio.update({
          where: { id: portfolio.id },
          data: {
            cashBalance: currentCash,
            equity: currentEquity,
            peakEquity,
          },
        });

        await tx.equitySnapshot.create({
          data: {
            userId: order.userId,
            portfolioId: portfolio.id,
            mode: 'SIM',
            equity: currentEquity,
            cashBalance: currentCash,
          },
        });
      });

      filledCount++;
    } catch {
      // Continue next order
    }
  }

  return filledCount;
}

export async function syncUserPendingOrders(userId: string): Promise<void> {
  try {
    const pendingOrders = await findPendingOrders(userId);
    if (pendingOrders.length === 0) return;

    const profile = await findUserProfile(userId);
    const apiKey = decryptSecret(profile?.alpacaApiKey);
    const apiSecret = decryptSecret(profile?.alpacaSecretKey);

    for (const order of pendingOrders) {
      try {
        let brokerOrder: BrokerOrder | null = null;
        if (order.isSimulated) {
          const simBroker = new SimBrokerClient({ userId });
          brokerOrder = await simBroker.getOrder(order.brokerOrderId || order.id);
        } else if (apiKey && apiSecret && order.brokerOrderId) {
          const liveBroker = resolveBrokerClient(order.assetClass || 'STOCKS', {
            alpacaApiKey: apiKey,
            alpacaSecretKey: apiSecret,
          });
          brokerOrder = await liveBroker.getOrder(order.brokerOrderId);
        }

        if (!brokerOrder) continue;

        if (brokerOrder.status === 'FILLED') {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'FILLED', reservedCash: 0, reservedQuantity: 0 },
          });
        } else if (brokerOrder.status === 'CANCELLED' || brokerOrder.status === 'REJECTED') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: brokerOrder.status === 'CANCELLED' ? 'CANCELLED' : 'REJECTED',
              reservedCash: 0,
              reservedQuantity: 0,
            },
          });
        }
      } catch {
        // Continue syncing other orders
      }
    }
  } catch {
    // Ignore overall sync error
  }
}

/**
 * Retention job: keep 5-minute snapshots for 7 days, daily ones (the last snapshot of each day) forever.
 */
export async function pruneOldEquitySnapshots(retentionDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const oldSnapshots = await prisma.equitySnapshot.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (oldSnapshots.length === 0) return 0;

  // Group by userId:YYYY-MM-DD and keep the ID of the last snapshot of each day
  const dailyLastMap = new Map<string, string>();
  for (const snap of oldSnapshots) {
    const day = snap.createdAt.toISOString().slice(0, 10);
    const key = `${snap.userId}:${day}`;
    dailyLastMap.set(key, snap.id);
  }

  const idsToKeep = new Set(dailyLastMap.values());
  const idsToDelete = oldSnapshots
    .map((s) => s.id)
    .filter((id) => !idsToKeep.has(id));

  if (idsToDelete.length === 0) return 0;

  const result = await prisma.equitySnapshot.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  return result.count;
}
