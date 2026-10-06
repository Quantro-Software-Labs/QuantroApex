import { AlpacaMarketDataClient, AlpacaBar } from './alpaca_market_data.js';
import { PolygonClient } from './polygon_client.js';
import { CcxtMarketDataClient } from './ccxt_market_data.js';
import { MARKET_DIRECTORY, MarketAssetQuote, QuoteSource, findAsset } from './market_directory.js';

/** Rolling simulated prices — fallback when no live provider is available. */
const simulatedState = new Map<string, MarketAssetQuote>();

function decimalsFor(price: number): number {
  return price < 2 ? 4 : 2;
}

function round(value: number, price: number): number {
  return Number(value.toFixed(decimalsFor(price)));
}

function applySimulatedTick(base: MarketAssetQuote): MarketAssetQuote {
  const prev = simulatedState.get(base.symbol) ?? base;
  const drift = (Math.random() - 0.48) * 0.0015 * prev.price;
  const price = round(Math.max(prev.price + drift, prev.price * 0.5), prev.price);
  const openRef = base.price;
  const change24h = round(price - openRef, price);
  const changePct24h = round(openRef ? (change24h / openRef) * 100 : 0, price);

  const updated: MarketAssetQuote = {
    ...base,
    price,
    change24h,
    changePct24h,
    high24h: round(Math.max(prev.high24h, price), price),
    low24h: round(Math.min(prev.low24h, price), price),
    volume: prev.volume + Math.floor(Math.random() * 50000),
    source: 'simulated',
  };

  simulatedState.set(base.symbol, updated);
  return updated;
}

export interface LiveQuoteOptions {
  apiKey?: string;
  apiSecret?: string;
  assetClass?: string;
}

export interface QuoteSourceSummary {
  liveData: boolean;
  partialLive: boolean;
  liveCount: number;
  simulatedCount: number;
}

export function summarizeQuoteSources(quotes: MarketAssetQuote[]): QuoteSourceSummary {
  const liveCount = quotes.filter((q) => q.source && q.source !== 'simulated').length;
  const simulatedCount = quotes.length - liveCount;
  return {
    liveData: quotes.length > 0 && simulatedCount === 0,
    partialLive: liveCount > 0 && simulatedCount > 0,
    liveCount,
    simulatedCount,
  };
}

export async function resolveLiveQuotes(opts: LiveQuoteOptions = {}): Promise<MarketAssetQuote[]> {
  let directory = [...MARKET_DIRECTORY];
  if (opts.assetClass && ['STOCKS', 'FOREX', 'CRYPTO'].includes(opts.assetClass.toUpperCase())) {
    directory = directory.filter((item) => item.assetClass === opts.assetClass!.toUpperCase());
  }

  const stockSymbols = directory.filter((i) => i.assetClass === 'STOCKS').map((i) => i.symbol);
  const forexSymbols = directory.filter((i) => i.assetClass === 'FOREX').map((i) => i.symbol);
  const cryptoSymbols = directory.filter((i) => i.assetClass === 'CRYPTO').map((i) => i.symbol);

  // Stocks → Alpaca | Forex → Polygon/OANDA fallback | Crypto → CCXT
  const [stockSnapshots, forexSnapshots, cryptoSnapshots] = await Promise.all([
    new AlpacaMarketDataClient({ apiKey: opts.apiKey, apiSecret: opts.apiSecret }).getSnapshots(
      stockSymbols,
    ),
    new PolygonClient().getForexSnapshots(forexSymbols),
    new CcxtMarketDataClient().getSnapshots(cryptoSymbols),
  ]);

  return directory.map((base) => {
    if (base.assetClass === 'STOCKS') {
      const live = stockSnapshots.get(base.symbol);
      if (live) {
        return {
          ...base,
          ...live,
          volume: live.volume || base.volume,
          source: 'alpaca' as QuoteSource,
        };
      }
    } else if (base.assetClass === 'FOREX') {
      const live = forexSnapshots.get(base.symbol);
      if (live) {
        return {
          ...base,
          ...live,
          volume: live.volume || base.volume,
          source: 'polygon' as QuoteSource,
        };
      }
    } else if (base.assetClass === 'CRYPTO') {
      const live = cryptoSnapshots.get(base.symbol);
      if (live) {
        return {
          ...base,
          ...live,
          volume: live.volume || base.volume,
          source: 'ccxt' as QuoteSource,
        };
      }
    }
    // Fallback: simulated drift off seed price
    return applySimulatedTick(base);
  });
}

/** Resolve a single symbol's live/simulated price for execution sizing and fills. */
export async function resolveQuotePrice(
  symbol: string,
  opts: LiveQuoteOptions = {},
): Promise<{ price: number; source: QuoteSource } | null> {
  const asset = findAsset(symbol);
  if (!asset) return null;

  const quotes = await resolveLiveQuotes({
    ...opts,
    assetClass: asset.assetClass,
  });
  const quote = quotes.find((q) => q.symbol.toUpperCase() === symbol.toUpperCase());
  if (!quote) {
    return { price: asset.price, source: 'simulated' };
  }
  return { price: quote.price, source: quote.source ?? 'simulated' };
}

export async function resolveAssetDetail(
  symbol: string,
  opts: LiveQuoteOptions = {},
): Promise<{ stock: MarketAssetQuote; candles: AlpacaBar[]; candlesLive: boolean } | null> {
  const base = findAsset(symbol);
  if (!base) return null;

  const quotes = await resolveLiveQuotes({
    ...opts,
    assetClass: base.assetClass,
  });
  const stock = quotes.find((q) => q.symbol.toUpperCase() === symbol.toUpperCase()) ?? {
    ...base,
    source: 'simulated' as QuoteSource,
  };

  let candles: AlpacaBar[] = [];
  let candlesLive = false;

  if (stock.assetClass === 'STOCKS') {
    candles = await new AlpacaMarketDataClient({
      apiKey: opts.apiKey,
      apiSecret: opts.apiSecret,
    }).getDailyBars(stock.symbol, 30);
    candlesLive = candles.length > 0;
  } else if (stock.assetClass === 'FOREX') {
    candles = await new PolygonClient().getForexCandles(stock.symbol, 30);
    candlesLive = candles.length > 0;
  } else if (stock.assetClass === 'CRYPTO') {
    candles = await new PolygonClient().getCryptoCandles(stock.symbol, 30);
    candlesLive = candles.length > 0;
  }

  if (candles.length === 0) {
    candles = generateCandles(stock.price, 30);
  }

  return { stock, candles, candlesLive };
}

export function generateCandles(basePrice: number, points = 30): AlpacaBar[] {
  const candles: AlpacaBar[] = [];
  let price = basePrice * 0.94;
  const now = Date.now();
  const step = (24 * 60 * 60 * 1000) / points;

  for (let i = 0; i < points; i++) {
    const timestamp = new Date(now - (points - i) * step).toISOString();
    const variation = (Math.sin(i / 2) * 0.015 + (Math.random() - 0.48) * 0.025) * price;
    const open = round(price, basePrice);
    const close = round(price + variation, basePrice);
    const high = round(Math.max(open, close) + (basePrice < 2 ? 0.002 : 1.5), basePrice);
    const low = round(Math.min(open, close) - (basePrice < 2 ? 0.002 : 1.5), basePrice);
    const volume = Math.floor(1_000_000 + Math.random() * 5_000_000);
    candles.push({ timestamp, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

export function computeTechnicals(stock: MarketAssetQuote, candles: AlpacaBar[]) {
  const closes = candles.map((c) => c.close);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0.0001;
  const rs = avgGain / avgLoss;
  const rsi = Number((100 - 100 / (1 + rs)).toFixed(2));

  const sma20 =
    closes.length >= 20
      ? round(closes.slice(-20).reduce((a, b) => a + b, 0) / 20, stock.price)
      : round(stock.price * 0.98, stock.price);
  const sma50 =
    closes.length >= 50
      ? round(closes.slice(-50).reduce((a, b) => a + b, 0) / 50, stock.price)
      : round(stock.price * 0.94, stock.price);

  const macd = Number((((sma20 - sma50) / stock.price) * 100).toFixed(4));
  const supportLevel = round(Math.min(...closes.slice(-10)), stock.price);
  const resistanceLevel = round(Math.max(...closes.slice(-10)), stock.price);

  return {
    rsi,
    macd,
    sma20,
    sma50,
    supportLevel,
    resistanceLevel,
    trend: rsi > 55 ? 'BULLISH' : rsi < 45 ? 'BEARISH' : 'NEUTRAL',
  };
}

export interface MarketSentiment {
  score: number;
  label: string;
  summary: string;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  averageChangePct: number;
}

export function computeMarketSentiment(quotes: MarketAssetQuote[]): MarketSentiment {
  if (quotes.length === 0) {
    return {
      score: 50,
      label: 'Neutral',
      summary: 'Insufficient market data to compute sentiment.',
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      averageChangePct: 0,
    };
  }

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let totalChange = 0;

  for (const q of quotes) {
    totalChange += q.changePct24h;
    if (q.changePct24h > 0.25) bullishCount++;
    else if (q.changePct24h < -0.25) bearishCount++;
    else neutralCount++;
  }

  const averageChangePct = totalChange / quotes.length;
  const bullishRatio = bullishCount / quotes.length;
  const score = Math.round(
    Math.min(100, Math.max(0, 50 + averageChangePct * 8 + (bullishRatio - 0.5) * 40)),
  );

  let label: string;
  if (score >= 75) label = 'Extreme Greed';
  else if (score >= 60) label = 'Greed';
  else if (score >= 45) label = 'Neutral';
  else if (score >= 30) label = 'Fear';
  else label = 'Extreme Fear';

  const direction = averageChangePct >= 0 ? 'positive' : 'negative';
  const summary =
    `${bullishCount} of ${quotes.length} tracked assets are up today. ` +
    `Average 24h move is ${averageChangePct >= 0 ? '+' : ''}${averageChangePct.toFixed(2)}%. ` +
    `Cross-asset momentum is ${direction}.`;

  return {
    score,
    label,
    summary,
    bullishCount,
    bearishCount,
    neutralCount,
    averageChangePct: Number(averageChangePct.toFixed(2)),
  };
}

export async function resolveTickerQuotes(opts: LiveQuoteOptions = {}): Promise<MarketAssetQuote[]> {
  const quotes = await resolveLiveQuotes(opts);
  return [...quotes]
    .sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h))
    .slice(0, 10);
}
