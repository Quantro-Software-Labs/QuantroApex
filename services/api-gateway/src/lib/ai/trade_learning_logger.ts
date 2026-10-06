import type { AssetClass, Json, MarketDataSource, OrderSide } from '../db/types.js';
import {
  countMarketObservations,
  countTradeLearning,
  createTradeLearningLog,
  findLatestOpenBuyTradeLearning,
  latestMarketObservation,
  updateTradeLearningLog,
} from '../db/repos.js';

export interface LogTradeLearningParams {
  userId: string;
  symbol: string;
  assetClass: AssetClass;
  side: OrderSide;
  quantity: number;
  price: number;
  realizedPnl?: number | null;
  isWin?: boolean | null;
  technicalSnapshot?: Record<string, unknown> | null;
  marketContext?: Record<string, unknown> | null;
  source?: MarketDataSource;
  isSimulated?: boolean;
  observationId?: string | null;
}

export class TradeLearningLogger {
  async logTrade(params: LogTradeLearningParams) {
    try {
      const pendingOutcome = params.side === 'BUY' && params.realizedPnl == null;

      const entry = await createTradeLearningLog({
        userId: params.userId,
        symbol: params.symbol.toUpperCase(),
        assetClass: params.assetClass,
        side: params.side,
        quantity: params.quantity,
        price: params.price,
        realizedPnl: params.realizedPnl ?? null,
        isWin: pendingOutcome
          ? null
          : (params.isWin ??
            (params.realizedPnl != null ? params.realizedPnl > 0 : null)),
        technicalSnapshot:
          params.technicalSnapshot != null
            ? (params.technicalSnapshot as Json)
            : null,
        marketContext:
          params.marketContext != null
            ? (params.marketContext as Json)
            : null,
        source: params.source ?? 'SIMULATED',
        isSimulated: params.isSimulated ?? true,
        observationId: params.observationId ?? null,
      });
      return entry;
    } catch (err) {
      console.warn('Failed to log trade learning sample:', err);
      return null;
    }
  }

  /**
   * Patch the most recent open BUY sample for symbol when a SELL realizes PnL.
   */
  async updateOutcome(params: {
    userId: string;
    symbol: string;
    realizedPnl: number;
    isWin: boolean;
  }) {
    try {
      const openBuy = await findLatestOpenBuyTradeLearning(
        params.userId,
        params.symbol.toUpperCase(),
      );

      if (!openBuy) return null;

      return await updateTradeLearningLog(openBuy.id, {
        realizedPnl: params.realizedPnl,
        isWin: params.isWin,
      });
    } catch (err) {
      console.warn('Failed to update trade learning outcome:', err);
      return null;
    }
  }

  async getLearningStats(userId?: string) {
    const base = userId ? { user_id: userId } : {};
    const totalCount = await countTradeLearning(base);
    const winCount = await countTradeLearning({ ...base, is_win: true });

    const stocksCount = await countTradeLearning({ ...base, asset_class: 'STOCKS' });
    const forexCount = await countTradeLearning({ ...base, asset_class: 'FOREX' });
    const cryptoCount = await countTradeLearning({ ...base, asset_class: 'CRYPTO' });

    const [alpacaCount, polygonCount, simulatedSourceCount] = await Promise.all([
      countTradeLearning({ ...base, source: 'ALPACA' }),
      countTradeLearning({ ...base, source: 'POLYGON' }),
      countTradeLearning({ ...base, source: 'SIMULATED' }),
    ]);
    const liveSourceCount = alpacaCount + polygonCount;

    const observationWhere = userId
      ? {
          // observations are global; count all for platform stats when no user filter needed
        }
      : {};
    const [totalObservations, liveObsAlpaca, liveObsPolygon, latestObservation] =
      await Promise.all([
        countMarketObservations(),
        countMarketObservations({ source: 'ALPACA' }),
        countMarketObservations({ source: 'POLYGON' }),
        latestMarketObservation(),
      ]);
    const liveObservations = liveObsAlpaca + liveObsPolygon;

    const winRate = totalCount > 0 ? Number((winCount / totalCount).toFixed(4)) : 0.0;
    const targetSamples = 1000;
    const modelReadinessPct = Math.min(100, Number(((totalCount / targetSamples) * 100).toFixed(1)));
    const liveSampleRatio =
      totalCount > 0 ? Number((liveSourceCount / totalCount).toFixed(4)) : 0;

    return {
      totalSamples: totalCount,
      winCount,
      winRate,
      breakdown: {
        stocks: stocksCount,
        forex: forexCount,
        crypto: cryptoCount,
      },
      sourceBreakdown: {
        live: liveSourceCount,
        simulated: simulatedSourceCount,
        liveSampleRatio,
      },
      observations: {
        total: totalObservations,
        live: liveObservations,
        simulated: totalObservations - liveObservations,
        lastObservedAt: latestObservation?.observedAt?.toISOString() ?? null,
      },
      targetSamples,
      modelReadinessPct,
      v2TargetModel: 'Apex-Q-Transformer-V2',
      // silence unused when userId scoped — observations remain global
      _scope: Object.keys(observationWhere).length,
    };
  }
}

export const tradeLearningLogger = new TradeLearningLogger();
