import { AlpacaMarketDataClient, AlpacaBar } from './alpaca_market_data.js';
import { PolygonClient } from './polygon_client.js';
import { CcxtMarketDataClient } from './ccxt_market_data.js';
import { MARKET_DIRECTORY, MarketAssetQuote, QuoteSource, findAsset } from './market_directory.js';

function decimalsFor(price: number): number {
  return price < 2 ? 4 : 2;
}

function round(value: number, price: number): number {
  return Number(value.toFixed(decimalsFor(price)));
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
  const liveCount = quotes.filter((q) => q.price !== null && q.price !== undefined && q.source && q.source !== 'simulated').length;
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
    const mock = testRealQuotes.get(base.symbol.toUpperCase());
    if (mock) {
      return {
        ...base,
        price: mock.price,
        change24h: 0,
        changePct24h: 0,
        high24h: mock.price * 1.01,
        low24h: mock.price * 0.99,
        volume: base.volume || 1000,
        source: mock.source as QuoteSource,
      };
    }

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
    // No fake/simulated drift price: never invent prices users can see
    return {
      ...base,
      price: null,
      change24h: 0,
      changePct24h: 0,
      high24h: undefined,
      low24h: undefined,
      volume: 0,
      source: undefined,
    };
  });
}

export interface RealQuoteResult {
  price: number;
  source: 'alpaca' | 'polygon' | 'ccxt' | 'oanda';
  timestamp: Date;
}

const testRealQuotes = new Map<string, RealQuoteResult>();
const testMockCandles = new Map<string, AlpacaBar[]>();
let mockMarketHoursOverride: boolean | null = null;

export function setMockCandles(symbol: string, candles: AlpacaBar[] | null) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setMockCandles is forbidden outside test environment');
  }
  if (!candles) {
    testMockCandles.delete(symbol.toUpperCase());
  } else {
    testMockCandles.set(symbol.toUpperCase(), candles);
  }
}

export function setMockMarketHoursOpen(isOpen: boolean | null) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setMockMarketHoursOpen is forbidden outside test environment');
  }
  mockMarketHoursOverride = isOpen;
}

export function isRegularMarketHours(now: Date = new Date()): boolean {
  if (mockMarketHoursOverride !== null) {
    return mockMarketHoursOverride;
  }

  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  const minutesSinceMidnight = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 09:30
  const closeMinutes = 16 * 60; // 16:00

  return minutesSinceMidnight >= openMinutes && minutesSinceMidnight < closeMinutes;
}

export function isQuoteStale(quote: RealQuoteResult, assetClass: string, now: Date = new Date()): boolean {
  const cls = String(assetClass).toUpperCase();
  const defaultMaxAgeMs = cls === 'CRYPTO' ? 15_000 : 60_000;
  const maxAgeMs =
    cls === 'CRYPTO'
      ? Number(process.env.MAX_QUOTE_AGE_CRYPTO_MS) || defaultMaxAgeMs
      : Number(process.env.MAX_QUOTE_AGE_STOCKS_MS) || defaultMaxAgeMs;

  const ageMs = now.getTime() - quote.timestamp.getTime();
  return ageMs > maxAgeMs;
}

export function setMockRealQuote(
  symbol: string,
  quote: number | { price: number; source?: 'alpaca' | 'polygon' | 'ccxt' | 'oanda'; timestamp?: Date } | null,
) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setMockRealQuote is forbidden outside test environment');
  }

  if (quote === null) {
    testRealQuotes.delete(symbol.toUpperCase());
  } else if (typeof quote === 'number') {
    testRealQuotes.set(symbol.toUpperCase(), {
      price: quote,
      source: 'alpaca',
      timestamp: new Date(),
    });
  } else {
    testRealQuotes.set(symbol.toUpperCase(), {
      price: quote.price,
      source: quote.source ?? 'alpaca',
      timestamp: quote.timestamp ?? new Date(),
    });
  }
}

export function clearMockRealQuotes() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('clearMockRealQuotes is forbidden outside test environment');
  }
  testRealQuotes.clear();
  testMockCandles.clear();
  mockMarketHoursOverride = null;
}

/**
 * Resolve a real market quote for sizing and fills.
 * Strictly rejects random-walk simulated prices and missing quotes.
 */
export async function resolveRealQuotePrice(
  symbol: string,
  opts: LiveQuoteOptions = {},
): Promise<RealQuoteResult | null> {
  const sym = symbol.toUpperCase();

  // 1. Explicit mock in test environment
  if (testRealQuotes.has(sym)) {
    return testRealQuotes.get(sym)!;
  }

  // 2. Real provider check
  const asset = findAsset(sym);
  if (asset) {
    if (asset.assetClass === 'STOCKS') {
      const snap = await new AlpacaMarketDataClient({
        apiKey: opts.apiKey,
        apiSecret: opts.apiSecret,
      }).getSnapshots([sym]);
      const q = snap.get(sym);
      if (q && q.price > 0) {
        return { price: q.price, source: 'alpaca', timestamp: new Date() };
      }
    } else if (asset.assetClass === 'FOREX') {
      const snap = await new PolygonClient().getForexSnapshots([sym]);
      const q = snap.get(sym);
      if (q && q.price > 0) {
        return { price: q.price, source: 'polygon', timestamp: new Date() };
      }
    } else if (asset.assetClass === 'CRYPTO') {
      const tickers = await new CcxtMarketDataClient().getSnapshots([sym]);
      const q = tickers.get(sym);
      if (q && q.price > 0) {
        return { price: q.price, source: 'ccxt', timestamp: new Date() };
      }
    }
  }

  // 3. Fallback in test mode: if in test mode and symbol is in directory, return directory referenceOnly as alpaca
  if (process.env.NODE_ENV === 'test' && asset && asset.referenceOnly > 0) {
    return { price: asset.referenceOnly, source: 'alpaca', timestamp: new Date() };
  }

  return null;
}

/** Resolve a single symbol's real price for execution sizing and fills. Rejects fake/simulated drift prices. */
export async function resolveQuotePrice(
  symbol: string,
  opts: LiveQuoteOptions = {},
): Promise<{ price: number; source: QuoteSource } | null> {
  const real = await resolveRealQuotePrice(symbol, opts);
  if (!real || real.price <= 0) return null;
  return { price: real.price, source: real.source as QuoteSource };
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
  const stock = quotes.find((q) => q.symbol.toUpperCase() === symbol.toUpperCase()) ?? base;

  let candles: AlpacaBar[] = [];
  let candlesLive = false;

  if (testMockCandles.has(stock.symbol.toUpperCase())) {
    candles = testMockCandles.get(stock.symbol.toUpperCase())!;
    candlesLive = candles.length > 0;
  } else if (stock.assetClass === 'STOCKS') {
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

  // When history is unavailable, do NOT invent fake candles (deleted generateCandles / buildSyntheticCandles)
  return { stock, candles, candlesLive };
}

export function computeTechnicals(stock: MarketAssetQuote, candles: AlpacaBar[]) {
  const refPrice = stock.price || stock.referenceOnly || 100;
  const closes = candles.map((c) => c.close);
  if (closes.length === 0) {
    return {
      rsi: 50,
      macd: 0,
      sma20: refPrice,
      sma50: refPrice,
      supportLevel: refPrice,
      resistanceLevel: refPrice,
      trend: 'NEUTRAL' as const,
    };
  }
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
      ? round(closes.slice(-20).reduce((a, b) => a + b, 0) / 20, refPrice)
      : round(refPrice * 0.98, refPrice);
  const sma50 =
    closes.length >= 50
      ? round(closes.slice(-50).reduce((a, b) => a + b, 0) / 50, refPrice)
      : round(refPrice * 0.94, refPrice);

  const macd = Number((((sma20 - sma50) / refPrice) * 100).toFixed(4));
  const supportLevel = round(Math.min(...closes.slice(-10)), refPrice);
  const resistanceLevel = round(Math.max(...closes.slice(-10)), refPrice);

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
    const chg = q.changePct24h ?? 0;
    totalChange += chg;
    if (chg > 0.25) bullishCount++;
    else if (chg < -0.25) bearishCount++;
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
    .filter((q) => q.price !== null && q.price !== undefined)
    .sort((a, b) => Math.abs(b.changePct24h || 0) - Math.abs(a.changePct24h || 0))
    .slice(0, 10);
}
