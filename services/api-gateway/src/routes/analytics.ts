import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';

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

    // Limit to last 1000 trades and select only needed fields to prevent OOM on large histories
    const trades = await prisma.trade.findMany({
      where: { order: { userId } },
      orderBy: { filledAt: 'desc' },
      take: 1000,
      select: { realizedPnl: true, filledAt: true },
    });

    const simPortfolio = await prisma.portfolio.findFirst({
      where: { userId, mode: 'SIM' },
      select: { equity: true },
    });

    const totalTrades = trades.length;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalPnl = 0;

    trades.forEach((t) => {
      const pnl = t.realizedPnl ? Number(t.realizedPnl) : 0;
      totalPnl += pnl;
      if (pnl > 0) {
        winningTrades++;
        grossProfit += pnl;
      } else if (pnl < 0) {
        losingTrades++;
        grossLoss += Math.abs(pnl);
      }
    });

    const closedTrades = winningTrades + losingTrades;

    const winRate = totalTrades > 0 ? (closedTrades > 0 ? winningTrades / closedTrades : 1.0) : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
    // Sharpe ratio and max drawdown require time-series data — return null until computed properly
    const sharpeRatio: number | null = null;
    const maxDrawdown: number | null = null;
    const currentEquity = simPortfolio ? Number(simPortfolio.equity) : null;

    return reply.send({
      metrics: {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        profitFactor,
        sharpeRatio,
        maxDrawdown,
        totalRealizedPnl: totalPnl,
        currentEquity,
        // Indicate which metrics require more trade history to compute
        insufficientData: totalTrades === 0,
        note: totalTrades < 10 ? 'More trade history is needed for statistical metrics.' : undefined,
      },
    });
  });

  app.get('/equity-curve', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = timeframeSchema.safeParse(request.query);
    const timeframe = parsed.success ? parsed.data.timeframe : '1M';

    const simPortfolio = await prisma.portfolio.findFirst({
      where: { userId, mode: 'SIM' },
      select: { equity: true },
    });

    const baseEquity = simPortfolio ? Number(simPortfolio.equity) : 100000;

    // TODO: Compute from actual Trade records grouped by day.
    // For now, return a clearly-marked simulated preview curve.
    const numPoints = timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : 90;
    const now = new Date();
    const points = [];

    let current = 100000;
    for (let i = numPoints; i >= 0; i--) {
      const pointDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      if (i === 0) {
        current = baseEquity;
      } else {
        // Mild positive drift to illustrate the chart — marked as simulated
        current = Math.max(90000, current + (Math.random() * 600 - 250));
      }
      const benchmark = 100000 + (numPoints - i) * 150;

      points.push({
        timestamp: pointDate.toISOString().split('T')[0],
        equity: parseFloat(current.toFixed(2)),
        benchmark: parseFloat(benchmark.toFixed(2)),
      });
    }

    return reply.send({
      timeframe,
      points,
      isSimulated: true,
      note: 'Equity curve is a simulated preview. Real curve will be computed from your trade history.',
    });
  });

  app.get('/trade-history', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = tradeHistorySchema.safeParse(request.query);
    const limit = parsed.success ? parsed.data.limit : 50;
    const symbolFilter = parsed.success ? parsed.data.symbol?.toUpperCase() : undefined;
    const sideFilter = parsed.success ? parsed.data.side : undefined;

    const trades = await prisma.trade.findMany({
      where: {
        order: {
          userId,
          symbol: symbolFilter ? { contains: symbolFilter } : undefined,
          side: sideFilter,
        },
      },
      include: {
        order: {
          select: { symbol: true, side: true, orderType: true, isSimulated: true },
        },
      },
      orderBy: { filledAt: 'desc' },
      take: limit,
    });

    const formattedTrades = trades.map((t) => ({
      id: t.id,
      orderId: t.orderId,
      symbol: t.order.symbol,
      side: t.order.side,
      orderType: t.order.orderType,
      isSimulated: t.order.isSimulated,
      fillQuantity: Number(t.fillQuantity),
      fillPrice: Number(t.fillPrice),
      realizedPnl: t.realizedPnl ? Number(t.realizedPnl) : 0,
      aiReasoning: t.aiReasoning,
      filledAt: t.filledAt,
    }));

    return reply.send({ trades: formattedTrades });
  });
}
