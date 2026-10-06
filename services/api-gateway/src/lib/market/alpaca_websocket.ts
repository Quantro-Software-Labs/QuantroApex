import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { config } from '../../config/index.js';

export interface AlpacaBarEvent {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlpacaQuoteEvent {
  symbol: string;
  timestamp: string;
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
}

type AlpacaWsEvents = {
  bar: [AlpacaBarEvent];
  quote: [AlpacaQuoteEvent];
  connected: [];
  authenticated: [];
  error: [Error];
  close: [];
};

const DEFAULT_WS_URL = 'wss://stream.data.alpaca.markets/v2/iex';

export class AlpacaWebsocketClient extends EventEmitter {
  private apiKey: string;
  private apiSecret: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private subscribedBars = new Set<string>();
  private subscribedQuotes = new Set<string>();
  private authenticated = false;

  constructor(opts?: { apiKey?: string; apiSecret?: string; wsUrl?: string }) {
    super();
    this.apiKey = opts?.apiKey || config.alpaca.apiKey || '';
    this.apiSecret = opts?.apiSecret || config.alpaca.apiSecret || '';
    this.wsUrl = opts?.wsUrl || process.env.ALPACA_WS_URL || DEFAULT_WS_URL;
  }

  override on<K extends keyof AlpacaWsEvents>(
    event: K,
    listener: (...args: AlpacaWsEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: any[]) => void);
  }

  override emit<K extends keyof AlpacaWsEvents>(
    event: K,
    ...args: AlpacaWsEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return !!(this.apiKey && this.apiSecret);
  }

  connect(): void {
    if (!this.isConfigured()) {
      process.stdout.write(
        JSON.stringify({
          event: 'alpaca_ws_skipped_unconfigured',
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.emit('connected');
      this.send({
        action: 'auth',
        key: this.apiKey,
        secret: this.apiSecret,
      });
    });

    this.ws.on('message', (raw) => {
      this.handleMessage(raw.toString());
    });

    this.ws.on('error', (err) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });

    this.ws.on('close', () => {
      this.authenticated = false;
      this.ws = null;
      this.emit('close');
    });
  }

  subscribeBars(symbols: string[]): void {
    for (const s of symbols) this.subscribedBars.add(s.toUpperCase());
    this.sendSubscribe();
  }

  subscribeQuotes(symbols: string[]): void {
    for (const s of symbols) this.subscribedQuotes.add(s.toUpperCase());
    this.sendSubscribe();
  }

  unsubscribeBars(symbols: string[]): void {
    for (const s of symbols) this.subscribedBars.delete(s.toUpperCase());
    this.send({
      action: 'unsubscribe',
      bars: symbols.map((s) => s.toUpperCase()),
    });
  }

  unsubscribeQuotes(symbols: string[]): void {
    for (const s of symbols) this.subscribedQuotes.delete(s.toUpperCase());
    this.send({
      action: 'unsubscribe',
      quotes: symbols.map((s) => s.toUpperCase()),
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
  }

  private sendSubscribe(): void {
    if (!this.authenticated) return;
    const payload: Record<string, unknown> = { action: 'subscribe' };
    if (this.subscribedBars.size > 0) {
      payload.bars = [...this.subscribedBars];
    }
    if (this.subscribedQuotes.size > 0) {
      payload.quotes = [...this.subscribedQuotes];
    }
    this.send(payload);
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private handleMessage(raw: string): void {
    let messages: unknown;
    try {
      messages = JSON.parse(raw);
    } catch {
      return;
    }

    const list = Array.isArray(messages) ? messages : [messages];
    for (const msg of list) {
      if (!msg || typeof msg !== 'object') continue;
      const m = msg as Record<string, unknown>;
      const type = String(m.T ?? m.msg ?? '');

      if (type === 'success' && String(m.msg) === 'authenticated') {
        this.authenticated = true;
        this.emit('authenticated');
        this.sendSubscribe();
        continue;
      }

      if (type === 'b' || type === 'bar') {
        this.emit('bar', {
          symbol: String(m.S ?? ''),
          timestamp: String(m.t ?? new Date().toISOString()),
          open: Number(m.o ?? 0),
          high: Number(m.h ?? 0),
          low: Number(m.l ?? 0),
          close: Number(m.c ?? 0),
          volume: Number(m.v ?? 0),
        });
        continue;
      }

      if (type === 'q' || type === 'quote') {
        this.emit('quote', {
          symbol: String(m.S ?? ''),
          timestamp: String(m.t ?? new Date().toISOString()),
          bidPrice: Number(m.bp ?? 0),
          askPrice: Number(m.ap ?? 0),
          bidSize: Number(m.bs ?? 0),
          askSize: Number(m.as ?? 0),
        });
      }
    }
  }
}

export const alpacaWebsocket = new AlpacaWebsocketClient();
