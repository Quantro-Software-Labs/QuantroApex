import type { AssetClass, Json, MarketDataSource } from '../db/types.js';
import { createMarketObservation } from '../db/repos.js';
import {
  computeMarketSentiment,
  computeTechnicals,
  resolveAssetDetail,
  resolveLiveQuotes,
  type LiveQuoteOptions,
} from '../market/quote_engine.js';
import { findAsset, type QuoteSource } from '../market/market_directory.js';

export function toMarketDataSource(source?: QuoteSource | string | null): MarketDataSource {
  switch ((source ?? 'simulated').toLowerCase()) {
    case 'alpaca':
      return 'ALPACA';
    case 'polygon':
      return 'POLYGON';
    default:
      return 'SIMULATED';
  }
}

export interface FeatureSnapshot {
  symbol: string;
  assetClass: AssetClass;
  price: number;
  changePct24h: number;
  volume: number;
  source: MarketDataSource;
  technicalSnapshot: Record<string, unknown>;
  marketContext: Record<string, unknown>;
  observationId?: string;
}

/**
 * Shared feature capture for market observer + trade learning.
 * Uses platform/system keys by default (opts empty); request paths may pass user Alpaca keys.
 */
export async function snapshotFeatures(
  symbol: string,
  opts: LiveQuoteOptions = {},
  options?: { persistObservation?: boolean; breadthQuotes?: Awaited<ReturnType<typeof resolveLiveQuotes>> },
): Promise<FeatureSnapshot | null> {
  const asset = findAsset(symbol);
  if (!asset) return null;

  const detail = await resolveAssetDetail(symbol, opts);
  if (!detail) return null;

  const { stock, candles, candlesLive } = detail;
  const technicals = computeTechnicals(stock, candles);
  const breadth =
    options?.breadthQuotes ??
    (await resolveLiveQuotes({
      ...opts,
    }));
  const sentiment = computeMarketSentiment(breadth);
  const source = toMarketDataSource(stock.source);

  const technicalSnapshot = {
    ...technicals,
    candlesLive,
    candleCount: candles.length,
  };

  const marketContext = {
    regime: technicals.trend === 'BULLISH'
      ? 'BULLISH_TREND'
      : technicals.trend === 'BEARISH'
        ? 'BEARISH_TREND'
        : 'RANGE_BOUND',
    volatility:
      Math.abs(stock.changePct24h) > 3 ? 'HIGH' : Math.abs(stock.changePct24h) > 1 ? 'MEDIUM' : 'LOW',
    sentimentScore: sentiment.score,
    sentimentLabel: sentiment.label,
    averageChangePct: sentiment.averageChangePct,
    quoteSource: stock.source ?? 'simulated',
  };

  let observationId: string | undefined;

  if (options?.persistObservation) {
    try {
      const row = await createMarketObservation({
        symbol: stock.symbol.toUpperCase(),
        assetClass: stock.assetClass as AssetClass,
        price: stock.price,
        changePct24h: stock.changePct24h,
        volume: stock.volume,
        technicalSnapshot: technicalSnapshot as Json,
        marketContext: marketContext as Json,
        source,
      });
      observationId = row.id;
    } catch (err) {
      console.warn(`Failed to persist MarketObservation for ${symbol}:`, err);
    }
  }

  return {
    symbol: stock.symbol.toUpperCase(),
    assetClass: stock.assetClass as AssetClass,
    price: stock.price,
    changePct24h: stock.changePct24h,
    volume: stock.volume,
    source,
    technicalSnapshot,
    marketContext,
    observationId,
  };
}
