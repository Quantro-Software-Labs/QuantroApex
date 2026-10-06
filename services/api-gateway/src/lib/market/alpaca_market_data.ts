import { config } from '../../config/index.js';

export interface AlpacaBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlpacaSnapshotQuote {
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume: number;
}

export class AlpacaMarketDataClient {
  private apiKey: string | undefined;
  private apiSecret: string | undefined;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; apiSecret?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || config.alpaca.apiKey || undefined;
    this.apiSecret = opts?.apiSecret || config.alpaca.apiSecret || undefined;
    this.baseUrl = opts?.baseUrl || process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets/v2';
  }

  private isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return !!(this.apiKey && this.apiSecret);
  }

  private headers(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKey || '',
      'APCA-API-SECRET-KEY': this.apiSecret || '',
    };
  }

  async getSnapshots(symbols: string[]): Promise<Map<string, AlpacaSnapshotQuote>> {
    const results = new Map<string, AlpacaSnapshotQuote>();
    if (!this.isConfigured() || symbols.length === 0) {
      return results;
    }

    const chunkSize = 20;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      try {
        const res = await fetch(
          `${this.baseUrl}/stocks/snapshots?symbols=${chunk.join(',')}`,
          { headers: this.headers() },
        );
        if (!res.ok) continue;

        const data = (await res.json()) as Record<string, any>;
        for (const symbol of chunk) {
          const snap = data[symbol];
          if (!snap) continue;

          const daily = snap.dailyBar;
          const prev = snap.prevDailyBar;
          const latestTrade = snap.latestTrade;
          const price = Number(
            latestTrade?.p ?? daily?.c ?? prev?.c ?? 0,
          );
          if (!price) continue;

          const prevClose = Number(prev?.c ?? price);
          const change24h = price - prevClose;
          const changePct24h = prevClose ? (change24h / prevClose) * 100 : 0;

          results.set(symbol, {
            price: Number(price.toFixed(price < 2 ? 4 : 2)),
            change24h: Number(change24h.toFixed(price < 2 ? 4 : 2)),
            changePct24h: Number(changePct24h.toFixed(2)),
            high24h: Number((daily?.h ?? price).toFixed(price < 2 ? 4 : 2)),
            low24h: Number((daily?.l ?? price).toFixed(price < 2 ? 4 : 2)),
            volume: Number(daily?.v ?? 0),
          });
        }
      } catch {
        // Fall back per-chunk silently
      }
    }

    return results;
  }

  async getDailyBars(symbol: string, limit = 30): Promise<AlpacaBar[]> {
    if (!this.isConfigured()) return [];

    try {
      const res = await fetch(
        `${this.baseUrl}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Day&limit=${limit}&adjustment=raw`,
        { headers: this.headers() },
      );
      if (!res.ok) return [];

      const data = (await res.json()) as { bars?: any[] };
      return (data.bars ?? []).map((bar) => ({
        timestamp: bar.t,
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
