import { config } from '../../config/index.js';
import { AlpacaBar } from './alpaca_market_data.js';

export interface PolygonQuote {
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume: number;
}

// Maps our display symbols to Polygon ticker format
// Forex: "EUR/USD" → "C:EURUSD"
// Crypto: "BTC/USDT" → "X:BTCUSD" (Polygon uses BTC-USD style internally)
function toPolygonForexTicker(symbol: string): string {
  return 'C:' + symbol.replace('/', '');
}

function toPolygonCryptoTicker(symbol: string): string {
  // "BTC/USDT" → "X:BTCUSD", "ETH/USDT" → "X:ETHUSD"
  const base = symbol.split('/')[0];
  const quote = symbol.split('/')[1]?.replace('USDT', 'USD').replace('USDC', 'USD') ?? 'USD';
  return `X:${base}${quote}`;
}

export class PolygonClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || config.polygon.apiKey || '';
    this.baseUrl = opts?.baseUrl || config.polygon.baseUrl || 'https://api.polygon.io';
  }

  isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return false;
    return this.apiKey.length > 0;
  }

  private url(path: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.baseUrl}${path}${sep}apiKey=${this.apiKey}`;
  }

  // ── Forex ────────────────────────────────────────────────────────────────

  async getForexSnapshots(symbols: string[]): Promise<Map<string, PolygonQuote>> {
    const results = new Map<string, PolygonQuote>();
    if (!this.isConfigured() || symbols.length === 0) return results;

    const tickers = symbols.map((s) => toPolygonForexTicker(s)).join(',');
    try {
      const res = await fetch(
        this.url(`/v2/snapshot/locale/global/markets/forex/tickers?tickers=${tickers}`),
      );
      if (!res.ok) return results;

      const data = (await res.json()) as { tickers?: any[] };
      for (const snap of data.tickers ?? []) {
        const ourSymbol = symbols.find(
          (s) => toPolygonForexTicker(s) === snap.ticker,
        );
        if (!ourSymbol) continue;

        const day = snap.day ?? {};
        const prevDay = snap.prevDay ?? {};
        const price = Number(snap.lastQuote?.a ?? day.c ?? prevDay.c ?? 0);
        if (!price) continue;

        const prevClose = Number(prevDay.c ?? price);
        const change24h = Number((price - prevClose).toFixed(5));
        const changePct24h = prevClose
          ? Number(((change24h / prevClose) * 100).toFixed(3))
          : 0;

        results.set(ourSymbol, {
          price: Number(price.toFixed(5)),
          change24h,
          changePct24h,
          high24h: Number((day.h ?? price).toFixed(5)),
          low24h: Number((day.l ?? price).toFixed(5)),
          volume: Number(day.v ?? 0),
        });
      }
    } catch {
      // Silently fall back
    }
    return results;
  }

  async getForexCandles(symbol: string, limit = 30): Promise<AlpacaBar[]> {
    if (!this.isConfigured()) return [];
    const ticker = toPolygonForexTicker(symbol);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - limit * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const res = await fetch(
        this.url(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=${limit}`),
      );
      if (!res.ok) return [];

      const data = (await res.json()) as { results?: any[] };
      return (data.results ?? []).map((bar) => ({
        timestamp: new Date(bar.t).toISOString(),
        open: Number(bar.o),
        high: Number(bar.h),
        low: Number(bar.l),
        close: Number(bar.c),
        volume: Number(bar.v),
      }));
    } catch {
      return [];
    }
  }

  // ── Crypto ───────────────────────────────────────────────────────────────

  async getCryptoSnapshots(symbols: string[]): Promise<Map<string, PolygonQuote>> {
    const results = new Map<string, PolygonQuote>();
    if (!this.isConfigured() || symbols.length === 0) return results;

    const tickers = symbols.map((s) => toPolygonCryptoTicker(s)).join(',');
    try {
      const res = await fetch(
        this.url(`/v2/snapshot/locale/global/markets/crypto/tickers?tickers=${tickers}`),
      );
      if (!res.ok) return results;

      const data = (await res.json()) as { tickers?: any[] };
      for (const snap of data.tickers ?? []) {
        const ourSymbol = symbols.find(
          (s) => toPolygonCryptoTicker(s) === snap.ticker,
        );
        if (!ourSymbol) continue;

        const day = snap.day ?? {};
        const prevDay = snap.prevDay ?? {};
        const price = Number(snap.lastTrade?.p ?? day.c ?? prevDay.c ?? 0);
        if (!price) continue;

        const prevClose = Number(prevDay.c ?? price);
        const change24h = Number((price - prevClose).toFixed(price < 1 ? 6 : 2));
        const changePct24h = prevClose
          ? Number(((change24h / prevClose) * 100).toFixed(2))
          : 0;

        results.set(ourSymbol, {
          price: Number(price.toFixed(price < 1 ? 6 : 2)),
          change24h,
          changePct24h,
          high24h: Number((day.h ?? price).toFixed(price < 1 ? 6 : 2)),
          low24h: Number((day.l ?? price).toFixed(price < 1 ? 6 : 2)),
          volume: Number(day.v ?? 0),
        });
      }
    } catch {
      // Silently fall back
    }
    return results;
  }

  async getCryptoCandles(symbol: string, limit = 30): Promise<AlpacaBar[]> {
    if (!this.isConfigured()) return [];
    const ticker = toPolygonCryptoTicker(symbol);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - limit * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const res = await fetch(
        this.url(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=${limit}`),
      );
      if (!res.ok) return [];

      const data = (await res.json()) as { results?: any[] };
      return (data.results ?? []).map((bar) => ({
        timestamp: new Date(bar.t).toISOString(),
        open: Number(bar.o),
        high: Number(bar.h),
        low: Number(bar.l),
        close: Number(bar.c),
        volume: Number(bar.v),
      }));
    } catch {
      return [];
    }
  }
}
