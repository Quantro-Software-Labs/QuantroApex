import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  findUserProfile,
  findPortfolio,
  listUserTrades,
} from '../lib/db/repos.js';
import { getUserId } from '../plugins/auth.js';
import { resolveBrokerClient } from '../lib/broker/broker_resolver.js';
import { syncUserPendingOrders } from '../lib/execution_engine.js';
import { computeTradeMetrics } from '../lib/analytics/metrics.js';

const timeframeSchema = z.object({
  timeframe: z.enum(['1W', '1M', '3M', 'ALL']).default('1M'),
});

const tradeHistorySchema = z.object({
  symbol: z.string().max(10).optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  limit: z.coerce.number().positive().max(100).default(50),
});

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/metrics', async (request, reply) => {
    const userId = getUserId(request);
    await syncUserPendingOrders(userId);
    const profile = await findUserProfile(userId);

    // Limit to last 1000 trades
    const trades = await listUserTrades(userId, { take: 1000 });

    let currentEquity = 100000;

    if (profile?.isBrokerConnected && profile.alpacaApiKey && profile.alpacaSecretKey) {
      try {
        const client = resolveBrokerClient('STOCKS', {
          alpacaApiKey: profile.alpacaApiKey,
          alpacaSecretKey: profile.alpacaSecretKey,
        });
        const account = await client.getAccount();
        currentEquity = account.portfolioValue;
      } catch {
        // Fallback
      }
    } else {
      const simPortfolio = await findPortfolio(userId, 'SIM');
      if (simPortfolio) {
        currentEquity = simPortfolio.equity;
      }
    }

    const totalTrades = trades.length;
    const closedTrades = trades.filter((t) => t.realizedPnl !== null && t.realizedPnl !== undefined);

    const {
      winningTrades,
      losingTrades,
      winRate,
      profitFactor,
      totalRealizedPnl: totalPnl,
    } = computeTradeMetrics(trades);

    // Section E.1: Compute from real data only.
    // Query equity_snapshots table written by mark-to-market job
    const snapshots = await prisma.equitySnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    // Group by calendar day to determine distinct daily snapshots
    const dailyMap = new Map<string, number>();
    for (const snap of snapshots) {
      const day = snap.createdAt.toISOString().slice(0, 10);
      dailyMap.set(day, Number(snap.equity));
    }
    const dailyEquities = Array.from(dailyMap.values());

    let sharpeRatio: number | null = null;
    let maxDrawdown: number | null = null;

    if (dailyEquities.length >= 20) {
      const dailyReturns: number[] = [];
      for (let i = 1; i < dailyEquities.length; i++) {
        const prev = dailyEquities[i - 1];
        const curr = dailyEquities[i];
        if (prev > 0) {
          dailyReturns.push((curr - prev) / prev);
        }
      }

      if (dailyReturns.length > 0) {
        const meanDailyReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
        const variance =
          dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanDailyReturn, 2), 0) /
          Math.max(1, dailyReturns.length - 1);
        const dailyStd = Math.sqrt(variance);

        // Daily annualized Sharpe (252 trading days/year, risk-free rate 0, stated in response)
        sharpeRatio =
          dailyStd > 0 ? Number(((meanDailyReturn / dailyStd) * Math.sqrt(252)).toFixed(4)) : 0;
      }

      let peak = dailyEquities[0];
      let maxDd = 0;
      for (const eq of dailyEquities) {
        if (eq > peak) peak = eq;
        const dd = peak > 0 ? (peak - eq) / peak : 0;
        if (dd > maxDd) maxDd = dd;
      }
      maxDrawdown = Number(maxDd.toFixed(4));
    }

    const hasSufficientClosedTrades = closedTrades.length >= 10;
    const hasSufficientSnapshots = dailyEquities.length >= 20;

    return reply.send({
      metrics: {
        totalTrades,
        closedTrades: closedTrades.length,
        dailySnapshotsCount: dailyEquities.length,
        winningTrades,
        losingTrades,
        winRate: hasSufficientClosedTrades ? winRate : null,
        winRateReason: !hasSufficientClosedTrades ? 'INSUFFICIENT_DATA' : undefined,
        profitFactor: hasSufficientClosedTrades ? profitFactor : null,
        profitFactorReason: !hasSufficientClosedTrades ? 'INSUFFICIENT_DATA' : undefined,
        sharpeRatio,
        sharpeRatioReason: !hasSufficientSnapshots ? 'INSUFFICIENT_DATA' : undefined,
        sharpeRatioRiskFreeRate: 0,
        sharpeRatioBasis: 'DAILY_ANNUALIZED_252',
        maxDrawdown,
        maxDrawdownReason: !hasSufficientSnapshots ? 'INSUFFICIENT_DATA' : undefined,
        totalRealizedPnl: totalPnl,
        currentEquity,
        insufficientData: !hasSufficientClosedTrades || !hasSufficientSnapshots,
      },
    });
  });

  app.get('/equity-curve', async (request, reply) => {
    const userId = getUserId(request);
    await syncUserPendingOrders(userId);
    const parsed = timeframeSchema.safeParse(request.query);
    const timeframe = parsed.success ? parsed.data.timeframe : '1M';

    // Section E.1: Query real equity_snapshots table only — NO sine waves or fake Math.sin
    const now = new Date();
    let startDate = new Date(0);
    if (timeframe === '1W') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '1M') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '3M') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const snapshots = await prisma.equitySnapshot.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    const points = snapshots.map((s) => ({
      timestamp: s.createdAt.toISOString().split('T')[0],
      equity: Number(s.equity),
    }));

    return reply.send({
      timeframe,
      points,
      isSimulated: true,
      note: 'Equity curve computed from real equity snapshots.',
    });
  });

  app.get('/trade-history', async (request, reply) => {
    const userId = getUserId(request);
    await syncUserPendingOrders(userId);
    const parsed = tradeHistorySchema.safeParse(request.query);
    const limit = parsed.success ? parsed.data.limit : 50;
    const symbolFilter = parsed.success ? parsed.data.symbol?.toUpperCase() : undefined;
    const sideFilter = parsed.success ? parsed.data.side : undefined;

    const trades = await listUserTrades(userId, {
      symbol: symbolFilter,
      side: sideFilter,
      take: limit,
    });

    const formattedTrades = trades.map((t) => ({
      id: t.id,
      orderId: t.orderId,
      symbol: t.order?.symbol,
      side: t.order?.side,
      orderType: t.order?.orderType,
      isSimulated: t.order?.isSimulated,
      fillQuantity: t.fillQuantity,
      fillPrice: t.fillPrice,
      realizedPnl: t.realizedPnl ?? 0,
      aiReasoning: t.aiReasoning,
      filledAt: t.filledAt,
    }));

    return reply.send({ trades: formattedTrades });
  });
}
