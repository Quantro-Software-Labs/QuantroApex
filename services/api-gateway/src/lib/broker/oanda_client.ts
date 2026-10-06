import {
  IBrokerClient,
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
  CreateOrderParams,
} from './broker_client.js';
import { config } from '../../config/index.js';

/** Map Quantro symbols (EUR/USD) → OANDA instruments (EUR_USD). */
function toOandaInstrument(symbol: string): string {
  return symbol.replace('/', '_').toUpperCase();
}

function fromOandaInstrument(instrument: string): string {
  return instrument.replace('_', '/');
}

export class OandaClient implements IBrokerClient {
  private apiKey: string | undefined;
  private accountId: string | undefined;
  private baseUrl: string;

  private mockCash = 100000;
  private mockPositions: Map<string, { qty: number; avgPrice: number }> = new Map();

  constructor(opts?: { apiKey?: string; accountId?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || config.oanda.apiKey || undefined;
    this.accountId = opts?.accountId || config.oanda.accountId || undefined;
    this.baseUrl = opts?.baseUrl || config.oanda.baseUrl || 'https://api-fxpractice.oanda.com';
  }

  private isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return !!(this.apiKey && this.accountId);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private accountUrl(path = ''): string {
    return `${this.baseUrl}/v3/accounts/${this.accountId}${path}`;
  }

  async getAccount(): Promise<BrokerAccount> {
    if (!this.isConfigured()) {
      let totalPositionValue = 0;
      this.mockPositions.forEach((pos) => {
        totalPositionValue += pos.qty * pos.avgPrice;
      });
      return {
        id: 'mock_oanda_account',
        cash: this.mockCash,
        portfolioValue: this.mockCash + totalPositionValue,
        buyingPower: this.mockCash,
      };
    }

    const res = await fetch(this.accountUrl(''), { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`OANDA getAccount error: ${res.statusText}`);
    }
    const data = (await res.json()) as {
      account?: {
        id?: string;
        balance?: string;
        NAV?: string;
        marginAvailable?: string;
      };
    };
    const acct = data.account ?? {};
    return {
      id: acct.id || this.accountId || 'oanda',
      cash: parseFloat(acct.balance || '0'),
      portfolioValue: parseFloat(acct.NAV || acct.balance || '0'),
      buyingPower: parseFloat(acct.marginAvailable || acct.balance || '0'),
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    if (!this.isConfigured()) {
      const positions: BrokerPosition[] = [];
      this.mockPositions.forEach((pos, symbol) => {
        positions.push({
          symbol,
          qty: pos.qty,
          avgEntryPrice: pos.avgPrice,
          marketValue: pos.qty * pos.avgPrice,
        });
      });
      return positions;
    }

    const res = await fetch(this.accountUrl('/openPositions'), { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`OANDA getPositions error: ${res.statusText}`);
    }
    const data = (await res.json()) as {
      positions?: Array<{
        instrument: string;
        long?: { units?: string; averagePrice?: string };
        short?: { units?: string; averagePrice?: string };
      }>;
    };

    return (data.positions ?? []).flatMap((p) => {
      const longUnits = parseFloat(p.long?.units || '0');
      const shortUnits = parseFloat(p.short?.units || '0');
      const qty = longUnits !== 0 ? longUnits : Math.abs(shortUnits);
      if (!qty) return [];
      const avg =
        longUnits !== 0
          ? parseFloat(p.long?.averagePrice || '0')
          : parseFloat(p.short?.averagePrice || '0');
      return [
        {
          symbol: fromOandaInstrument(p.instrument),
          qty,
          avgEntryPrice: avg,
          marketValue: qty * avg,
        },
      ];
    });
  }

  async createOrder(params: CreateOrderParams): Promise<BrokerOrder> {
    if (!this.isConfigured()) {
      const fillPrice = params.limitPrice || params.estimatedPrice || 1.1;
      const orderValue = fillPrice * params.qty;

      if (params.side === 'BUY') {
        this.mockCash -= orderValue;
        const current = this.mockPositions.get(params.symbol) || { qty: 0, avgPrice: 0 };
        const newQty = current.qty + params.qty;
        const newAvg = (current.qty * current.avgPrice + orderValue) / newQty;
        this.mockPositions.set(params.symbol, { qty: newQty, avgPrice: newAvg });
      } else {
        this.mockCash += orderValue;
        const current = this.mockPositions.get(params.symbol);
        if (current) {
          const newQty = current.qty - params.qty;
          if (newQty <= 0) {
            this.mockPositions.delete(params.symbol);
          } else {
            this.mockPositions.set(params.symbol, { qty: newQty, avgPrice: current.avgPrice });
          }
        }
      }

      return {
        id: `mock_oanda_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        clientOrderId: params.idempotencyKey,
        symbol: params.symbol,
        side: params.side,
        qty: params.qty,
        type: params.type,
        limitPrice: params.limitPrice,
        status: 'FILLED',
        fillPrice,
        filledAt: new Date(),
      };
    }

    const units = params.side === 'BUY' ? params.qty : -params.qty;
    const orderBody: Record<string, unknown> = {
      order: {
        type: params.type === 'LIMIT' ? 'LIMIT' : 'MARKET',
        instrument: toOandaInstrument(params.symbol),
        units: String(units),
        timeInForce: params.type === 'LIMIT' ? 'GTC' : 'FOK',
        positionFill: 'DEFAULT',
        ...(params.type === 'LIMIT' && params.limitPrice
          ? { price: params.limitPrice.toFixed(5) }
          : {}),
        ...(params.idempotencyKey ? { clientExtensions: { id: params.idempotencyKey } } : {}),
      },
    };

    const res = await fetch(this.accountUrl('/orders'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(orderBody),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OANDA createOrder error: ${err}`);
    }

    const data = (await res.json()) as {
      orderFillTransaction?: {
        id?: string;
        price?: string;
        time?: string;
        instrument?: string;
        units?: string;
      };
      orderCreateTransaction?: { id?: string };
      orderCancelTransaction?: { id?: string };
    };

    const fill = data.orderFillTransaction;
    if (fill?.id) {
      return {
        id: fill.id,
        clientOrderId: params.idempotencyKey,
        symbol: params.symbol,
        side: params.side,
        qty: params.qty,
        type: params.type,
        limitPrice: params.limitPrice,
        status: 'FILLED',
        fillPrice: fill.price ? parseFloat(fill.price) : undefined,
        filledAt: fill.time ? new Date(fill.time) : new Date(),
      };
    }

    const created = data.orderCreateTransaction;
    return {
      id: created?.id || `oanda_${Date.now()}`,
      clientOrderId: params.idempotencyKey,
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      type: params.type,
      limitPrice: params.limitPrice,
      status: data.orderCancelTransaction ? 'CANCELLED' : 'SUBMITTED',
    };
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    if (!this.isConfigured()) {
      return {
        id: orderId,
        symbol: 'EUR/USD',
        side: 'BUY',
        qty: 1000,
        type: 'MARKET',
        status: 'FILLED',
        fillPrice: 1.1,
        filledAt: new Date(),
      };
    }

    const res = await fetch(this.accountUrl(`/orders/${orderId}`), {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`OANDA getOrder error: ${res.statusText}`);
    }
    const data = (await res.json()) as {
      order?: {
        id?: string;
        instrument?: string;
        units?: string;
        type?: string;
        price?: string;
        state?: string;
        clientExtensions?: { id?: string };
      };
    };
    const order = data.order ?? {};
    const units = parseFloat(order.units || '0');
    const state = (order.state || '').toUpperCase();
    const status: BrokerOrder['status'] =
      state === 'FILLED'
        ? 'FILLED'
        : state === 'CANCELLED'
          ? 'CANCELLED'
          : 'SUBMITTED';

    return {
      id: order.id || orderId,
      clientOrderId: order.clientExtensions?.id,
      symbol: order.instrument ? fromOandaInstrument(order.instrument) : 'UNKNOWN',
      side: units >= 0 ? 'BUY' : 'SELL',
      qty: Math.abs(units),
      type: (order.type || 'MARKET').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET',
      limitPrice: order.price ? parseFloat(order.price) : undefined,
      status,
      filledAt: status === 'FILLED' ? new Date() : undefined,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const res = await fetch(this.accountUrl(`/orders/${orderId}/cancel`), {
      method: 'PUT',
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`OANDA cancelOrder error: ${res.statusText}`);
    }
  }

  /** Fetch mid pricing for instruments (used by unified market data). */
  async getPricing(symbols: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    if (!this.isConfigured() || symbols.length === 0) return results;

    const instruments = symbols.map(toOandaInstrument).join(',');
    try {
      const res = await fetch(
        this.accountUrl(`/pricing?instruments=${encodeURIComponent(instruments)}`),
        { headers: this.headers() },
      );
      if (!res.ok) return results;

      const data = (await res.json()) as {
        prices?: Array<{ instrument?: string; bids?: Array<{ price?: string }>; asks?: Array<{ price?: string }> }>;
      };
      for (const p of data.prices ?? []) {
        if (!p.instrument) continue;
        const bid = parseFloat(p.bids?.[0]?.price || '0');
        const ask = parseFloat(p.asks?.[0]?.price || '0');
        const mid = bid && ask ? (bid + ask) / 2 : bid || ask;
        if (mid) {
          results.set(fromOandaInstrument(p.instrument), mid);
        }
      }
    } catch {
      // Fall through empty
    }
    return results;
  }
}

export const forexBrokerClient: IBrokerClient = new OandaClient();
