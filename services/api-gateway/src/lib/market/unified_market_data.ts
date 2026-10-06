import { AlpacaMarketDataClient, type AlpacaBar, type AlpacaSnapshotQuote } from './alpaca_market_data.js';
import { CcxtMarketDataClient, type CcxtTickerQuote } from './ccxt_market_data.js';
import { PolygonClient, type PolygonQuote } from './polygon_client.js';
import { OandaClient } from '../broker/oanda_client.js';

export type AssetClassFilter = 'STOCKS' | 'CRYPTO' | 'FOREX';

export interface UnifiedQuote {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume: number;
  source: 'alpaca' | 'ccxt' | 'oanda' | 'polygon';
}

export class UnifiedMarketData {
  private alpaca: AlpacaMarketDataClient;
  private ccxt: CcxtMarketDataClient;
  private polygon: PolygonClient;
  private oanda: OandaClient;

  constructor(opts?: {
    alpaca?: AlpacaMarketDataClient;
    ccxt?: CcxtMarketDataClient;
    polygon?: PolygonClient;
    oanda?: OandaClient;
  }) {
    this.alpaca = opts?.alpaca ?? new AlpacaMarketDataClient();
    this.ccxt = opts?.ccxt ?? new CcxtMarketDataClient();
    this.polygon = opts?.polygon ?? new PolygonClient();
    this.oanda = opts?.oanda ?? new OandaClient();
  }

  async getQuotes(
    symbols: string[],
    assetClass: AssetClassFilter,
  ): Promise<Map<string, UnifiedQuote>> {
    if (assetClass === 'STOCKS') {
      return this.fromAlpaca(symbols);
    }
    if (assetClass === 'CRYPTO') {
      return this.fromCcxt(symbols);
    }
    return this.fromForex(symbols);
  }

  async getCandles(
    symbol: string,
    assetClass: AssetClassFilter,
    limit = 30,
  ): Promise<AlpacaBar[]> {
    if (assetClass === 'STOCKS') {
      return this.alpaca.getDailyBars(symbol, limit);
    }
    if (assetClass === 'CRYPTO') {
      return this.ccxt.fetchOHLCV(symbol, '1d', limit);
    }
    // Forex: prefer Polygon aggregates (OANDA pricing is spot-only)
    const poly = await this.polygon.getForexCandles(symbol, limit);
    return poly;
  }

  private async fromAlpaca(symbols: string[]): Promise<Map<string, UnifiedQuote>> {
    const snap = await this.alpaca.getSnapshots(symbols);
    return this.mapQuotes(snap, 'alpaca');
  }

  private async fromCcxt(symbols: string[]): Promise<Map<string, UnifiedQuote>> {
    const tickers = await this.ccxt.fetchTickers(symbols);
    const results = new Map<string, UnifiedQuote>();
    tickers.forEach((t: CcxtTickerQuote, symbol) => {
      results.set(symbol, {
        symbol,
        price: t.price,
        change24h: t.change24h,
        changePct24h: t.changePct24h,
        high24h: t.high24h,
        low24h: t.low24h,
        volume: t.volume,
        source: 'ccxt',
      });
    });
    return results;
  }

  private async fromForex(symbols: string[]): Promise<Map<string, UnifiedQuote>> {
    const results = new Map<string, UnifiedQuote>();

    // Prefer OANDA mid prices when configured
    const oandaPrices = await this.oanda.getPricing(symbols);
    if (oandaPrices.size > 0) {
      oandaPrices.forEach((price, symbol) => {
        results.set(symbol, {
          symbol,
          price,
          change24h: 0,
          changePct24h: 0,
          high24h: price,
          low24h: price,
          volume: 0,
          source: 'oanda',
        });
      });
    }

    // Polygon fallback for missing symbols (full quote stats)
    const missing = symbols.filter((s) => !results.has(s));
    if (missing.length > 0) {
      const poly = await this.polygon.getForexSnapshots(missing);
      poly.forEach((q: PolygonQuote, symbol) => {
        results.set(symbol, {
          symbol,
          price: q.price,
          change24h: q.change24h,
          changePct24h: q.changePct24h,
          high24h: q.high24h,
          low24h: q.low24h,
          volume: q.volume,
          source: 'polygon',
        });
      });
    }

    return results;
  }

  private mapQuotes(
    snap: Map<string, AlpacaSnapshotQuote>,
    source: UnifiedQuote['source'],
  ): Map<string, UnifiedQuote> {
    const results = new Map<string, UnifiedQuote>();
    snap.forEach((q, symbol) => {
      results.set(symbol, {
        symbol,
        price: q.price,
        change24h: q.change24h,
        changePct24h: q.changePct24h,
        high24h: q.high24h,
        low24h: q.low24h,
        volume: q.volume,
        source,
      });
    });
    return results;
  }
}

export const unifiedMarketData = new UnifiedMarketData();
