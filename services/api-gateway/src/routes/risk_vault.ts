import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { validateTradeRisk } from '../lib/risk_enforcer.js';
import { SimBrokerClient } from '../lib/broker/sim_broker.js';
import { resolveBrokerClient } from '../lib/broker/broker_resolver.js';
import { AlpacaClient } from '../lib/broker/alpaca_client.js';
import { computeRealizedLossToday } from '../lib/trading_day.js';
import { resolveRealQuotePrice, isRegularMarketHours } from '../lib/market/quote_engine.js';
import { findAsset } from '../lib/market/market_directory.js';
import { percentInputSchema, toDecimalFraction, validateStoredLimit } from '../lib/risk/limit_helpers.js';

const updateVaultSchema = z.object({
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX', 'GLOBAL']).default('STOCKS'),
  dailyLossLimit: z.number().positive().optional(),
  dailyLossLimitPct: percentInputSchema.optional(),
  dailyLossLimitUnit: z.enum(['PERCENT', 'USD']).optional(),
  maxDrawdown: percentInputSchema.optional(),
  maxDrawdownPct: percentInputSchema.optional(),
  maxDrawdownUnit: z.enum(['PERCENT', 'USD']).optional(),
  perTradeExposure: percentInputSchema.optional(),
  perTradeExposurePct: percentInputSchema.optional(),
  perTradeExposureUnit: z.enum(['PERCENT', 'USD']).optional(),
  assetsEnabled: z.boolean().optional(),
  cryptoEnabled: z.boolean().optional(),
  stocksEnabled: z.boolean().optional(),
  forexEnabled: z.boolean().optional(),
});

// Client-supplied loss values removed — server must compute them itself
const validateTradeSchema = z.object({
  tradeValue: z.number().positive(),
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).default('STOCKS'),
  portfolioEquity: z.number().positive().optional(),
  peakEquity: z.number().positive().optional(),
  mode: z.enum(['SIM', 'LIVE']).default('SIM'),
});

export async function riskVaultRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const { assetClass } = request.query as { assetClass?: string };
    const cls = (assetClass?.toUpperCase() || 'STOCKS') as
      | 'STOCKS'
      | 'CRYPTO'
      | 'FOREX'
      | 'GLOBAL';

    let riskVault = await prisma.riskVault.findUnique({
      where: { userId_assetClass: { userId, assetClass: cls } },
    });

    if (!riskVault) {
      riskVault = await prisma.riskVault.create({
        data: {
          userId,
          assetClass: cls,
          dailyLossLimit: cls === 'GLOBAL' ? 1000 : 500,
          dailyLossLimitUnit: 'USD',
          maxDrawdown: 0.15,
          maxDrawdownUnit: 'PERCENT',
          perTradeExposure: 0.05,
          perTradeExposureUnit: 'PERCENT',
          assetsEnabled: cls === 'STOCKS' || cls === 'GLOBAL',
        },
      });
    }

    const globalVault = await prisma.riskVault.findUnique({
      where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
    });

    const queuedClosesCount = await prisma.order.count({
      where: {
        userId,
        status: 'QUEUED',
        ...(cls !== 'GLOBAL' ? { assetClass: cls } : {}),
      },
    });

    return reply.send({
      riskVault,
      globalVault,
      dailyLossBasis: 'GROSS_REALIZED_LOSSES',
      isEmergencyStopped:
        Boolean(riskVault.emergencyStop || riskVault.emergencyStoppedAt) ||
        Boolean(globalVault?.emergencyStop || globalVault?.emergencyStoppedAt) ||
        queuedClosesCount > 0,
      queuedClosesCount,
    });
  });

  app.get('/all', async (request, reply) => {
    const userId = getUserId(request);
    const vaults = await prisma.riskVault.findMany({ where: { userId } });
    return reply.send({
      vaults,
      dailyLossBasis: 'GROSS_REALIZED_LOSSES',
    });
  });

  app.put('/', async (request, reply) => {
    const parsed = updateVaultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const data = parsed.data;

    let dailyLossLimit = data.dailyLossLimit;
    let dailyLossLimitUnit = data.dailyLossLimitUnit;
    let maxDrawdown = data.maxDrawdown;
    let maxDrawdownUnit = data.maxDrawdownUnit ?? 'PERCENT';
    let perTradeExposure = data.perTradeExposure;
    let perTradeExposureUnit = data.perTradeExposureUnit ?? 'PERCENT';

    try {
      if (data.dailyLossLimitPct !== undefined) {
        dailyLossLimit = toDecimalFraction(data.dailyLossLimitPct);
        dailyLossLimitUnit = 'PERCENT';
      } else if (dailyLossLimit !== undefined) {
        if (!dailyLossLimitUnit) {
          dailyLossLimitUnit = dailyLossLimit > 1.0 ? 'USD' : 'PERCENT';
        }
      }

      if (data.maxDrawdownPct !== undefined) {
        maxDrawdown = toDecimalFraction(data.maxDrawdownPct);
        maxDrawdownUnit = 'PERCENT';
      } else if (maxDrawdown !== undefined) {
        if (!data.maxDrawdownUnit && maxDrawdown > 1.0) {
          maxDrawdown = toDecimalFraction(maxDrawdown);
        }
      }

      if (data.perTradeExposurePct !== undefined) {
        perTradeExposure = toDecimalFraction(data.perTradeExposurePct);
        perTradeExposureUnit = 'PERCENT';
      } else if (perTradeExposure !== undefined) {
        if (!data.perTradeExposureUnit && perTradeExposure > 1.0) {
          perTradeExposure = toDecimalFraction(perTradeExposure);
        }
      }

      if (dailyLossLimit !== undefined && dailyLossLimitUnit) {
        validateStoredLimit(dailyLossLimit, dailyLossLimitUnit, 'dailyLossLimit');
      }
      if (maxDrawdown !== undefined && maxDrawdownUnit) {
        validateStoredLimit(maxDrawdown, maxDrawdownUnit, 'maxDrawdown');
      }
      if (perTradeExposure !== undefined && perTradeExposureUnit) {
        validateStoredLimit(perTradeExposure, perTradeExposureUnit, 'perTradeExposure');
      }
    } catch (err: any) {
      return reply.status(400).send({ error: 'ValidationError', message: err.message });
    }

    const riskVault = await prisma.riskVault.upsert({
      where: { userId_assetClass: { userId, assetClass: data.assetClass } },
      create: {
        userId,
        assetClass: data.assetClass,
        dailyLossLimit: dailyLossLimit ?? 500,
        dailyLossLimitUnit: dailyLossLimitUnit ?? 'USD',
        maxDrawdown: maxDrawdown ?? 0.15,
        maxDrawdownUnit: maxDrawdownUnit ?? 'PERCENT',
        perTradeExposure: perTradeExposure ?? 0.05,
        perTradeExposureUnit: perTradeExposureUnit ?? 'PERCENT',
        assetsEnabled: data.assetsEnabled ?? true,
        cryptoEnabled: data.cryptoEnabled ?? false,
        stocksEnabled: data.stocksEnabled ?? true,
        forexEnabled: data.forexEnabled ?? false,
      },
      update: {
        ...(dailyLossLimit !== undefined && { dailyLossLimit }),
        ...(dailyLossLimitUnit !== undefined && { dailyLossLimitUnit }),
        ...(maxDrawdown !== undefined && { maxDrawdown }),
        ...(maxDrawdownUnit !== undefined && { maxDrawdownUnit }),
        ...(perTradeExposure !== undefined && { perTradeExposure }),
        ...(perTradeExposureUnit !== undefined && { perTradeExposureUnit }),
        ...(data.assetsEnabled !== undefined && { assetsEnabled: data.assetsEnabled }),
        ...(data.cryptoEnabled !== undefined && { cryptoEnabled: data.cryptoEnabled }),
        ...(data.stocksEnabled !== undefined && { stocksEnabled: data.stocksEnabled }),
        ...(data.forexEnabled !== undefined && { forexEnabled: data.forexEnabled }),
      },
    });

    return reply.send({
      riskVault,
      dailyLossBasis: 'GROSS_REALIZED_LOSSES',
    });
  });

  app.post('/emergency-stop', async (request, reply) => {
    const userId = getUserId(request);
    const body = z
      .object({ assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX', 'GLOBAL']).default('GLOBAL') })
      .safeParse(request.body ?? {});
    const cls = body.success ? body.data.assetClass : 'GLOBAL';
    const now = new Date();

    // 1. Set Emergency Stop flags in DB
    let riskVault;
    if (cls === 'GLOBAL') {
      await prisma.riskVault.updateMany({
        where: { userId },
        data: { emergencyStop: true, emergencyStoppedAt: now },
      });
      riskVault = await prisma.riskVault.upsert({
        where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
        create: {
          userId,
          assetClass: 'GLOBAL',
          dailyLossLimit: 1000,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          emergencyStop: true,
          emergencyStoppedAt: now,
        },
        update: { emergencyStop: true, emergencyStoppedAt: now },
      });
    } else {
      riskVault = await prisma.riskVault.upsert({
        where: { userId_assetClass: { userId, assetClass: cls } },
        create: {
          userId,
          assetClass: cls,
          dailyLossLimit: 500,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          emergencyStop: true,
          emergencyStoppedAt: now,
        },
        update: { emergencyStop: true, emergencyStoppedAt: now },
      });
    }

    // 2. Cancel EVERY open order independently
    const openOrders = await prisma.order.findMany({
      where: {
        userId,
        status: { in: ['PENDING_SUBMIT', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_FILLED'] },
        ...(cls !== 'GLOBAL' ? { assetClass: cls } : {}),
      },
    });

    const cancelledOrders: Array<{ id: string; symbol: string; side: string; quantity: number }> = [];
    const failedCancels: Array<{ id: string; symbol: string; reason: string }> = [];

    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    const liveApiKey = profile?.alpacaApiKey;
    const liveApiSecret = profile?.alpacaSecretKey;

    for (const order of openOrders) {
      try {
        if (order.isSimulated) {
          const simBroker = new SimBrokerClient({ userId });
          await simBroker.cancelOrder(order.brokerOrderId || order.id);
        } else {
          if (!liveApiKey || !liveApiSecret) {
            throw new Error('No broker credentials configured for LIVE order cancellation');
          }
          const liveBroker = resolveBrokerClient(order.assetClass, {
            alpacaApiKey: liveApiKey,
            alpacaSecretKey: liveApiSecret,
          });
          await liveBroker.cancelOrder(order.brokerOrderId || order.id);
        }

        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'CANCELLED', reservedCash: 0, reservedQuantity: 0 },
        });

        cancelledOrders.push({
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          quantity: Number(order.quantity),
        });
      } catch (err: any) {
        failedCancels.push({
          id: order.id,
          symbol: order.symbol,
          reason: err?.message || 'Failed to cancel order at broker',
        });
      }
    }

    // 3. Close ALL open positions independently
    // For LIVE: submit market orders to broker, NEVER mark closed at quote in DB.
    // Stock closes outside market hours must not fail with MARKET_CLOSED.
    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: { positions: true },
    });

    const closedPositions: Array<{
      symbol: string;
      quantity: number;
      fillPrice?: number;
      mode: string;
      status?: string;
    }> = [];
    const failedCloses: Array<{
      symbol: string;
      quantity: number;
      mode: string;
      reason: string;
    }> = [];

    const isMarketOpen = isRegularMarketHours();

    for (const portfolio of portfolios) {
      for (const pos of portfolio.positions) {
        const qty = Number(pos.quantity);
        if (qty <= 0) continue;

        const asset = findAsset(pos.symbol);
        const assetClass = asset?.assetClass ?? 'STOCKS';
        if (cls !== 'GLOBAL' && asset && asset.assetClass !== cls) {
          continue;
        }

        const isStock = assetClass === 'STOCKS';

        if (portfolio.mode === 'SIM') {
          // If stocks and market is closed, queue the close and fill it at the first real quote after the open
          if (isStock && !isMarketOpen) {
            await prisma.order.create({
              data: {
                userId,
                symbol: pos.symbol,
                side: 'SELL',
                orderType: 'MARKET',
                quantity: qty,
                status: 'QUEUED',
                isSimulated: true,
                assetClass: 'STOCKS',
                owner: 'MANUAL',
                reservedQuantity: qty,
              },
            });
            closedPositions.push({
              symbol: pos.symbol,
              quantity: qty,
              mode: 'SIM',
              status: 'QUEUED',
            });
            continue;
          }

          try {
            const quote = await resolveRealQuotePrice(pos.symbol);
            const fillPrice = quote ? quote.price : Number(pos.averageCost);
            const proceeds = new Prisma.Decimal(qty).mul(fillPrice);

            await prisma.position.delete({
              where: { id: pos.id },
            });

            const newCash = new Prisma.Decimal(portfolio.cashBalance).add(proceeds);
            await prisma.portfolio.update({
              where: { id: portfolio.id },
              data: {
                cashBalance: newCash,
                equity: newCash,
              },
            });

            closedPositions.push({
              symbol: pos.symbol,
              quantity: qty,
              fillPrice,
              mode: 'SIM',
              status: 'CLOSED',
            });
          } catch (err: any) {
            failedCloses.push({
              symbol: pos.symbol,
              quantity: qty,
              mode: 'SIM',
              reason: err?.message || 'Failed to close SIM position',
            });
          }
        } else {
          // LIVE mode: close at broker by submitting market order or closePosition
          if (!liveApiKey || !liveApiSecret) {
            failedCloses.push({
              symbol: pos.symbol,
              quantity: qty,
              mode: 'LIVE',
              reason: 'No broker credentials to submit live position close order',
            });
            continue;
          }

          try {
            const liveBroker = resolveBrokerClient(assetClass, {
              alpacaApiKey: liveApiKey,
              alpacaSecretKey: liveApiSecret,
            });

            if (isStock && !isMarketOpen && liveBroker instanceof AlpacaClient) {
              // Alpaca close-position queues for the open
              await liveBroker.closePosition(pos.symbol);
              closedPositions.push({
                symbol: pos.symbol,
                quantity: qty,
                mode: 'LIVE',
                status: 'QUEUED',
              });
            } else {
              if (liveBroker instanceof AlpacaClient) {
                await liveBroker.closePosition(pos.symbol);
              } else {
                await liveBroker.createOrder({
                  symbol: pos.symbol,
                  side: 'SELL',
                  qty,
                  type: 'MARKET',
                  assetClass,
                });
              }
              closedPositions.push({
                symbol: pos.symbol,
                quantity: qty,
                mode: 'LIVE',
                status: 'CLOSED',
              });
            }
          } catch (err: any) {
            failedCloses.push({
              symbol: pos.symbol,
              quantity: qty,
              mode: 'LIVE',
              reason: err?.message || 'Broker rejected market close order',
            });
          }
        }
      }
    }

    // 4. Mark agent stopped
    await prisma.agentState.upsert({
      where: { userId },
      create: { userId, isRunning: false, stoppedAt: now },
      update: { isRunning: false, stoppedAt: now },
    });

    // 5. Determine status code: 207 Multi-Status if any failures occurred, 200 if all succeeded
    const hasFailures = failedCancels.length > 0 || failedCloses.length > 0;
    const statusCode = hasFailures ? 207 : 200;

    // 6. Write ONE activity-feed entry documenting successes and failures
    const feedMessage = hasFailures
      ? `Emergency stop active with partial failures: cancelled ${cancelledOrders.length} orders (${failedCancels.length} failed), closed ${closedPositions.length} positions (${failedCloses.length} failed).`
      : `Emergency stop activated: cancelled ${cancelledOrders.length} orders, closed ${closedPositions.length} positions.`;

    await prisma.activityFeedEntry.create({
      data: {
        userId,
        eventType: 'EMERGENCY_STOP',
        message: feedMessage,
        metadata: hasFailures ? { failedCancels, failedCloses } : undefined,
      },
    });

    return reply.status(statusCode).send({
      success: !hasFailures,
      partial: hasFailures,
      riskVault,
      isEmergencyStopped: true,
      emergencyStoppedAt: now,
      dailyLossBasis: 'GROSS_REALIZED_LOSSES',
      cancelledOrders,
      failedCancels,
      closedPositions,
      failedCloses,
      summary: {
        cancelledOrdersCount: cancelledOrders.length,
        failedCancelsCount: failedCancels.length,
        closedPositionsCount: closedPositions.length,
        failedClosesCount: failedCloses.length,
      },
    });
  });

  app.post('/resume', async (request, reply) => {
    const userId = getUserId(request);
    const body = z
      .object({ assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX', 'GLOBAL']).default('GLOBAL') })
      .safeParse(request.body ?? {});
    const cls = body.success ? body.data.assetClass : 'GLOBAL';

    const queuedCloses = await prisma.order.findMany({
      where: {
        userId,
        status: 'QUEUED',
        ...(cls !== 'GLOBAL' ? { assetClass: cls } : {}),
      },
    });

    if (queuedCloses.length > 0) {
      return reply.status(409).send({
        error: 'EMERGENCY_STOP_ACTIVE',
        message: `Cannot resume: ${queuedCloses.length} queued close order(s) must fill first. Emergency stop stays active until every queued close has filled.`,
        queuedCount: queuedCloses.length,
      });
    }

    let riskVault;
    if (cls === 'GLOBAL') {
      await prisma.riskVault.updateMany({
        where: { userId },
        data: { emergencyStop: false, emergencyStoppedAt: null },
      });
      riskVault = await prisma.riskVault.findUnique({
        where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
      });
    } else {
      riskVault = await prisma.riskVault.update({
        where: { userId_assetClass: { userId, assetClass: cls } },
        data: { emergencyStop: false, emergencyStoppedAt: null },
      });
    }

    await prisma.agentState.upsert({
      where: { userId },
      create: { userId, isRunning: true, startedAt: new Date() },
      update: { isRunning: true, startedAt: new Date() },
    });

    return reply.send({
      message: `Trading resumed for ${cls}`,
      riskVault,
      dailyLossBasis: 'GROSS_REALIZED_LOSSES',
      isEmergencyStopped: false,
    });
  });

  app.post('/validate-trade', async (request, reply) => {
    const parsed = validateTradeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { tradeValue, assetClass, mode } = parsed.data;
    const isSimulated = mode === 'SIM';

    const [globalVault, classVault] = await Promise.all([
      prisma.riskVault.findUnique({
        where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
      }),
      prisma.riskVault.findUnique({
        where: { userId_assetClass: { userId, assetClass } },
      }),
    ]);

    const portfolio = await prisma.portfolio.findUnique({
      where: { userId_mode: { userId, mode } },
    });

    const portfolioEquity = parsed.data.portfolioEquity ?? Number(portfolio?.equity ?? 100000);
    const peakEquity = parsed.data.peakEquity ?? Number(portfolio?.peakEquity ?? portfolioEquity);

    const [realizedLossToday, globalRealizedLossToday] = await Promise.all([
      computeRealizedLossToday({ userId, assetClass, isSimulated }),
      computeRealizedLossToday({ userId, assetClass: 'GLOBAL', isSimulated }),
    ]);

    const result = validateTradeRisk({
      userId,
      globalVault,
      riskVault: classVault,
      portfolioEquity,
      tradeValue,
      assetClass,
      realizedLossToday,
      globalRealizedLossToday,
      peakEquity,
    });

    return reply.send({
      allowed: result.allowed,
      code: result.code,
      reason: result.reason,
      dailyLossBasis: 'GROSS_REALIZED_LOSSES',
      realizedLossToday,
      globalRealizedLossToday,
    });
  });
}
