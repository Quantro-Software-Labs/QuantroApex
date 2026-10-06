import ccxt, { type Exchange } from 'ccxt';
import {
  IBrokerClient,
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
  CreateOrderParams,
} from './broker_client.js';
import { config } from '../../config/index.js';

export class CcxtClient implements IBrokerClient {
  private exchangeId: string;
  private apiKey: string | undefined;
  private apiSecret: string | undefined;
  private exchange: Exchange | null = null;

  private mockCash = 100000;
  private mockPositions: Map<string, { qty: number; avgPrice: number }> = new Map();

  constructor(opts?: { exchangeId?: string; apiKey?: string; apiSecret?: string }) {
    this.exchangeId = opts?.exchangeId || config.crypto.exchange || 'binance';
    this.apiKey = opts?.apiKey || config.crypto.apiKey || undefined;
    this.apiSecret = opts?.apiSecret || config.crypto.apiSecret || undefined;
  }

  private isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return !!(this.apiKey && this.apiSecret);
  }

  private getExchange(): Exchange {
    if (this.exchange) return this.exchange;

    const ExchangeClass = (ccxt as unknown as Record<string, new (opts?: object) => Exchange>)[
      this.exchangeId
    ];
    if (!ExchangeClass) {
      throw new Error(`Unsupported CCXT exchange: ${this.exchangeId}`);
    }

    this.exchange = new ExchangeClass({
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
      options: { defaultType: 'spot' },
    });
    return this.exchange;
  }

  async getAccount(): Promise<BrokerAccount> {
    if (!this.isConfigured()) {
      let totalPositionValue = 0;
      this.mockPositions.forEach((pos) => {
        totalPositionValue += pos.qty * pos.avgPrice;
      });
      return {
        id: `mock_${this.exchangeId}_account`,
        cash: this.mockCash,
        portfolioValue: this.mockCash + totalPositionValue,
        buyingPower: this.mockCash,
      };
    }

    const ex = this.getExchange();
    const balance = await ex.fetchBalance();
    const freeBal = balance.free as unknown as Record<string, number | undefined> | undefined;
    const totalBal = balance.total as unknown as Record<string, number | undefined> | undefined;
    const free = Number(freeBal?.['USDT'] ?? freeBal?.['USD'] ?? 0);
    const total = Number(totalBal?.['USDT'] ?? totalBal?.['USD'] ?? free);

    return {
      id: `${this.exchangeId}_account`,
      cash: free,
      portfolioValue: total,
      buyingPower: free,
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

    const ex = this.getExchange();
    const balance = await ex.fetchBalance();
    const positions: BrokerPosition[] = [];

    for (const [currency, total] of Object.entries(balance.total ?? {})) {
      const qty = Number(total);
      if (!qty || qty <= 0 || currency === 'USDT' || currency === 'USD') continue;
      positions.push({
        symbol: `${currency}/USDT`,
        qty,
        avgEntryPrice: 0,
        marketValue: qty,
      });
    }
    return positions;
  }

  async createOrder(params: CreateOrderParams): Promise<BrokerOrder> {
    if (!this.isConfigured()) {
      const fillPrice = params.limitPrice || params.estimatedPrice || 100.0;
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
        id: `mock_ccxt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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

    const ex = this.getExchange();
    const side = params.side.toLowerCase() as 'buy' | 'sell';
    const type = params.type.toLowerCase() as 'market' | 'limit';
    const order = await ex.createOrder(
      params.symbol,
      type,
      side,
      params.qty,
      params.type === 'LIMIT' ? params.limitPrice : undefined,
      params.idempotencyKey ? { clientOrderId: params.idempotencyKey } : undefined,
    );

    const fillPrice =
      order.average != null
        ? Number(order.average)
        : order.price != null
          ? Number(order.price)
          : undefined;
    const status: BrokerOrder['status'] =
      order.status === 'closed' || order.status === 'filled'
        ? 'FILLED'
        : order.status === 'canceled'
          ? 'CANCELLED'
          : order.status === 'rejected'
            ? 'REJECTED'
            : 'SUBMITTED';

    return {
      id: String(order.id),
      clientOrderId: order.clientOrderId ? String(order.clientOrderId) : params.idempotencyKey,
      symbol: order.symbol || params.symbol,
      side: params.side,
      qty: Number(order.amount ?? params.qty),
      type: params.type,
      limitPrice: params.limitPrice,
      status,
      fillPrice,
      filledAt: status === 'FILLED' ? new Date(order.timestamp || Date.now()) : undefined,
    };
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    if (!this.isConfigured()) {
      return {
        id: orderId,
        symbol: 'MOCK',
        side: 'BUY',
        qty: 1,
        type: 'MARKET',
        status: 'FILLED',
        fillPrice: 100.0,
        filledAt: new Date(),
      };
    }

    const ex = this.getExchange();
    const order = await ex.fetchOrder(orderId);
    const status: BrokerOrder['status'] =
      order.status === 'closed' || order.status === 'filled'
        ? 'FILLED'
        : order.status === 'canceled'
          ? 'CANCELLED'
          : order.status === 'rejected'
            ? 'REJECTED'
            : 'SUBMITTED';

    return {
      id: String(order.id),
      clientOrderId: order.clientOrderId ? String(order.clientOrderId) : undefined,
      symbol: order.symbol || 'UNKNOWN',
      side: (order.side || 'buy').toUpperCase() as 'BUY' | 'SELL',
      qty: Number(order.amount ?? 0),
      type: (order.type || 'market').toUpperCase() as 'MARKET' | 'LIMIT',
      limitPrice: order.price != null ? Number(order.price) : undefined,
      status,
      fillPrice: order.average != null ? Number(order.average) : undefined,
      filledAt: status === 'FILLED' ? new Date(order.timestamp || Date.now()) : undefined,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }
    const ex = this.getExchange();
    await ex.cancelOrder(orderId);
  }
}

export const cryptoBrokerClient: IBrokerClient = new CcxtClient();
