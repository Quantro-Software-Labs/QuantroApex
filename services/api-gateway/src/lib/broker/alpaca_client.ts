import {
  IBrokerClient,
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
  CreateOrderParams,
} from './broker_client.js';
import { config } from '../../config/index.js';

export class AlpacaClient implements IBrokerClient {
  private apiKey: string | undefined;
  private apiSecret: string | undefined;
  private baseUrl: string;

  // In-memory paper mock state when live sandbox credentials are not present
  private mockCash = 100000;
  private mockPositions: Map<string, { qty: number; avgPrice: number }> = new Map();

  constructor() {
    // Use centralised config — handles env var name normalisation
    this.apiKey = config.alpaca.apiKey || undefined;
    this.apiSecret = config.alpaca.apiSecret || undefined;
    this.baseUrl = config.alpaca.baseUrl;
  }

  private isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  private getHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKey || '',
      'APCA-API-SECRET-KEY': this.apiSecret || '',
      'Content-Type': 'application/json',
    };
  }

  async getAccount(): Promise<BrokerAccount> {
    if (!this.isConfigured()) {
      let totalPositionValue = 0;
      this.mockPositions.forEach((pos) => {
        totalPositionValue += pos.qty * pos.avgPrice;
      });
      return {
        id: 'mock_paper_account',
        cash: this.mockCash,
        portfolioValue: this.mockCash + totalPositionValue,
        buyingPower: this.mockCash * 2,
      };
    }

    const res = await fetch(`${this.baseUrl}/account`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Alpaca getAccount error: ${res.statusText}`);
    }
    const data = (await res.json()) as any;
    return {
      id: data.id,
      cash: parseFloat(data.cash),
      portfolioValue: parseFloat(data.portfolio_value),
      buyingPower: parseFloat(data.buying_power),
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

    const res = await fetch(`${this.baseUrl}/positions`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Alpaca getPositions error: ${res.statusText}`);
    }
    const data = (await res.json()) as any[];
    return data.map((p) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avgEntryPrice: parseFloat(p.avg_entry_price),
      marketValue: parseFloat(p.market_value),
    }));
  }

  async createOrder(params: CreateOrderParams): Promise<BrokerOrder> {
    if (!this.isConfigured()) {
      // Mock instant fill for sandbox/testing
      const fillPrice = params.limitPrice || 150.0;
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
        id: `mock_ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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

    const payload = {
      symbol: params.symbol,
      qty: params.qty.toString(),
      side: params.side.toLowerCase(),
      type: params.type.toLowerCase(),
      time_in_force: 'gtc',
      limit_price: params.limitPrice ? params.limitPrice.toString() : undefined,
      client_order_id: params.idempotencyKey,
    };

    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Alpaca createOrder error: ${err}`);
    }

    const data = (await res.json()) as any;
    return {
      id: data.id,
      clientOrderId: data.client_order_id,
      symbol: data.symbol,
      side: params.side,
      qty: parseFloat(data.qty),
      type: params.type,
      limitPrice: data.limit_price ? parseFloat(data.limit_price) : undefined,
      status: data.status === 'filled' ? 'FILLED' : 'SUBMITTED',
      fillPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
      filledAt: data.filled_at ? new Date(data.filled_at) : undefined,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const res = await fetch(`${this.baseUrl}/orders/${orderId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Alpaca cancelOrder error: ${res.statusText}`);
    }
  }
}

export const defaultBrokerClient: IBrokerClient = new AlpacaClient();
