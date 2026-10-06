import ccxt, { type Exchange } from 'ccxt';
import { config } from '../../config/index.js';
import type { AlpacaBar } from './alpaca_market_data.js';

export interface CcxtTickerQuote {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume: number;
}

export class CcxtMarketDataClient {
  private exchangeId: string;
  private exchange: Exchange | null = null;

  constructor(opts?: { exchangeId?: string }) {
    this.exchangeId = opts?.exchangeId || config.crypto.exchange || 'binance';
  }

  private getExchange(): Exchange {
    if (this.exchange) return this.exchange;

    const ExchangeClass = (ccxt as unknown as Record<string, new (opts?: object) => Exchange>)[
      this.exchangeId
    ];
    if (!ExchangeClass) {
      throw new Error(`Unsupported CCXT exchange: ${this.exchangeId}`);
    }

    // Public market data — keys optional
    this.exchange = new ExchangeClass({
      apiKey: config.crypto.apiKey || undefined,
      secret: config.crypto.apiSecret || undefined,
      enableRateLimit: true,
    });
    return this.exchange;
  }

  private isAvailable(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return true;
  }

  async fetchTickers(symbols: string[]): Promise<Map<string, CcxtTickerQuote>> {
    const results = new Map<string, CcxtTickerQuote>();
    if (!this.isAvailable() || symbols.length === 0) return results;

    try {
      const ex = this.getExchange();
      const tickers = await ex.fetchTickers(symbols);

      for (const symbol of symbols) {
        const t = tickers[symbol];
        if (!t) continue;
        const price = Number(t.last ?? t.close ?? 0);
        if (!price) continue;
        const changePct24h = Number(t.percentage ?? 0);
        const change24h = Number(t.change ?? (price * changePct24h) / 100);
        results.set(symbol, {
          symbol,
          price,
          change24h,
          changePct24h,
          high24h: Number(t.high ?? price),
          low24h: Number(t.low ?? price),
          volume: Number(t.baseVolume ?? t.quoteVolume ?? 0),
        });
      }
    } catch {
      // Silent fallthrough for callers that have simulated fallback
    }
    return results;
  }

  async fetchOHLCV(
    symbol: string,
    timeframe = '1d',
    limit = 30,
  ): Promise<AlpacaBar[]> {
    if (!this.isAvailable()) return [];

    try {
      const ex = this.getExchange();
      const candles = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
      return candles.map((c) => ({
        timestamp: new Date(Number(c[0])).toISOString(),
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5]),
      }));
    } catch {
      return [];
    }
  }

  /** Quote-engine compatible snapshot map (keys = app symbols e.g. BTC/USDT). */
  async getSnapshots(symbols: string[]): Promise<
    Map<
      string,
      {
        price: number;
        change24h: number;
        changePct24h: number;
        high24h: number;
        low24h: number;
        volume: number;
      }
    >
  > {
    return this.fetchTickers(symbols);
  }
}

export const ccxtMarketData = new CcxtMarketDataClient();
