import { randomUUID } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { config } from '../../config/index.js';
import {
  IBrokerClient,
  BrokerAccount,
  BrokerPosition,
  CreateOrderParams,
  BrokerOrder,
} from './broker_client.js';
import {
  resolveRealQuotePrice,
  isQuoteStale,
  isRegularMarketHours,
} from '../market/quote_engine.js';

export interface SimBrokerOptions {
  userId?: string;
  slippageBps?: number; // default 5 bps (0.05% = 0.0005)
  spreadBps?: number;   // default 5 bps (0.05% = 0.0005)
  cryptoTakerFeePct?: number; // default 0.0025 (0.25%)
  tx?: Prisma.TransactionClient | PrismaClient;
}

export class SimBrokerClient implements IBrokerClient {
  private userId?: string;
  private slippageBps?: number;
  private spreadBps?: number;
  private cryptoTakerFeePct: number;
  private db: Prisma.TransactionClient | PrismaClient;

  constructor(opts?: SimBrokerOptions) {
    this.userId = opts?.userId;
    this.slippageBps = opts?.slippageBps;
    this.spreadBps = opts?.spreadBps;
    this.cryptoTakerFeePct =
      opts?.cryptoTakerFeePct ??
      (process.env.SIM_CRYPTO_TAKER_FEE_PCT
        ? Number(process.env.SIM_CRYPTO_TAKER_FEE_PCT)
        : 0.0025); // 0.25% default
    this.db = opts?.tx ?? defaultPrisma;
  }

  async getAccount(): Promise<BrokerAccount> {
    if (!this.userId) {
      return { id: 'sim_account', cash: 100000, portfolioValue: 100000, buyingPower: 100000 };
    }
    const portfolio = await this.db.portfolio.findUnique({
      where: { userId_mode: { userId: this.userId, mode: 'SIM' } },
    });
    const cash = portfolio ? Number(portfolio.cashBalance) : 100000;
    const value = portfolio ? Number(portfolio.equity) : 100000;
    return {
      id: portfolio?.id || 'sim_account',
      cash,
      portfolioValue: value,
      buyingPower: cash,
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    if (!this.userId) return [];
    const portfolio = await this.db.portfolio.findUnique({
      where: { userId_mode: { userId: this.userId, mode: 'SIM' } },
      include: { positions: true },
    });
    if (!portfolio) return [];
    return portfolio.positions.map((p) => ({
      symbol: p.symbol,
      qty: Number(p.quantity),
      avgEntryPrice: Number(p.averageCost),
      marketValue: Number(p.quantity) * Number(p.averageCost),
    }));
  }

  async createOrder(params: CreateOrderParams): Promise<BrokerOrder> {
    const sym = params.symbol.toUpperCase();
    const assetClass = (params.assetClass || 'STOCKS').toUpperCase();

    // 1. Regular market hours check for STOCKS market orders (matches Alpaca LIVE behavior: rejects when market closed)
    if (assetClass === 'STOCKS' && params.type === 'MARKET') {
      if (!isRegularMarketHours()) {
        const err = new Error(
          'Market is closed. Market orders open at 9:30 am New York time, or place a limit order.',
        );
        (err as any).code = 'MARKET_CLOSED';
        throw err;
      }
    }

    // 2. Real quote resolution & staleness verification
    const realQuote = await resolveRealQuotePrice(sym);
    if (!realQuote || realQuote.price <= 0) {
      const err = new Error(`No real quote available for symbol ${sym}. Order rejected.`);
      (err as any).code = 'NO_REAL_QUOTE';
      throw err;
    }

    if (isQuoteStale(realQuote, assetClass)) {
      const err = new Error(`Market quote for ${sym} is stale (older than allowed max age).`);
      (err as any).code = 'STALE_QUOTE';
      throw err;
    }

    const basePrice = realQuote.price;
    const cls = assetClass.toUpperCase();
    const cfg =
      cls === 'CRYPTO'
        ? config.trading.spreadAndSlippage.crypto
        : cls === 'FOREX'
        ? config.trading.spreadAndSlippage.forex
        : config.trading.spreadAndSlippage.stocks;

    const usedHalfSpreadBps = this.spreadBps !== undefined ? this.spreadBps / 2 : cfg.halfSpreadBps;
    const usedSlippageBps = this.slippageBps !== undefined ? this.slippageBps : cfg.slippageBps;
    const slippageFrac = usedSlippageBps / 10000;
    const halfSpreadFrac = usedHalfSpreadBps / 10000;

    if (params.type === 'MARKET') {
      // Market orders fill at latest real quote plus spread and slippage:
      // BUY market order fills at Ask + slippage: realPrice * (1 + halfSpread + slippage)
      // SELL market order fills at Bid - slippage: realPrice * (1 - halfSpread - slippage)
      const rawFillPrice =
        params.side === 'BUY'
          ? basePrice * (1 + halfSpreadFrac + slippageFrac)
          : basePrice * (1 - halfSpreadFrac - slippageFrac);

      const fillPrice = Number(new Prisma.Decimal(rawFillPrice).toFixed(4));
      const orderId = `sim_ord_${Date.now()}_${randomUUID().slice(0, 8)}`;

      // 3. Fee calculation (stocks: 0, crypto taker: default 0.25%)
      let fee = 0;
      if (assetClass === 'CRYPTO') {
        fee = Number(
          new Prisma.Decimal(fillPrice).mul(params.qty).mul(this.cryptoTakerFeePct).toFixed(4),
        );
      }

      return {
        id: orderId,
        clientOrderId: params.clientOrderId || params.idempotencyKey,
        symbol: sym,
        side: params.side,
        qty: params.qty,
        type: 'MARKET',
        status: 'FILLED',
        fillPrice,
        filledAt: new Date(),
        fee,
        halfSpreadBps: usedHalfSpreadBps,
        slippageBps: usedSlippageBps,
      };
    }

    // LIMIT orders: fill only when the real price crosses the limit
    const limitPrice = params.limitPrice;
    if (limitPrice === undefined || limitPrice <= 0) {
      throw new Error('Limit order must include a positive limitPrice');
    }

    // BUY LIMIT: crosses limit when real market price <= limitPrice
    // SELL LIMIT: crosses limit when real market price >= limitPrice
    const crosses =
      params.side === 'BUY' ? basePrice <= limitPrice : basePrice >= limitPrice;

    const orderId = `sim_ord_${Date.now()}_${randomUUID().slice(0, 8)}`;

    if (crosses) {
      const fillPrice =
        params.side === 'BUY'
          ? Math.min(limitPrice, basePrice)
          : Math.max(limitPrice, basePrice);

      let fee = 0;
      if (assetClass === 'CRYPTO') {
        fee = Number(
          new Prisma.Decimal(fillPrice).mul(params.qty).mul(this.cryptoTakerFeePct).toFixed(4),
        );
      }

      return {
        id: orderId,
        clientOrderId: params.clientOrderId || params.idempotencyKey,
        symbol: sym,
        side: params.side,
        qty: params.qty,
        type: 'LIMIT',
        limitPrice,
        status: 'FILLED',
        fillPrice: Number(new Prisma.Decimal(fillPrice).toFixed(4)),
        filledAt: new Date(),
        fee,
        halfSpreadBps: usedHalfSpreadBps,
        slippageBps: usedSlippageBps,
      };
    }

    // Real price has not crossed the limit: remains open
    return {
      id: orderId,
      clientOrderId: params.clientOrderId || params.idempotencyKey,
      symbol: sym,
      side: params.side,
      qty: params.qty,
      type: 'LIMIT',
      limitPrice,
      status: 'SUBMITTED',
      halfSpreadBps: usedHalfSpreadBps,
      slippageBps: usedSlippageBps,
    };
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    const order = await this.db.order.findFirst({
      where: {
        OR: [{ id: orderId }, { brokerOrderId: orderId }],
      },
      include: { trades: true },
    });
    if (!order) {
      throw new Error(`Order ${orderId} not found in database`);
    }
    const trade = order.trades[0];
    return {
      id: order.brokerOrderId || order.id,
      clientOrderId: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: Number(order.quantity),
      type: order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT' ? 'LIMIT' : 'MARKET',
      limitPrice: order.limitPrice ? Number(order.limitPrice) : undefined,
      status: order.status as any,
      fillPrice: trade ? Number(trade.fillPrice) : undefined,
      filledAt: trade ? trade.filledAt : undefined,
      fee: trade ? Number(trade.fee) : 0,
    };
  }

  async getOrderByClientOrderId(clientOrderId: string): Promise<BrokerOrder | null> {
    const order = await this.db.order.findFirst({
      where: {
        OR: [{ id: clientOrderId }, { idempotencyKey: clientOrderId }],
      },
      include: { trades: true },
    });
    if (!order) return null;
    const trade = order.trades[0];
    return {
      id: order.brokerOrderId || order.id,
      clientOrderId: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: Number(order.quantity),
      type: order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT' ? 'LIMIT' : 'MARKET',
      limitPrice: order.limitPrice ? Number(order.limitPrice) : undefined,
      status: order.status as any,
      fillPrice: trade ? Number(trade.fillPrice) : undefined,
      filledAt: trade ? trade.filledAt : undefined,
      fee: trade ? Number(trade.fee) : 0,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = await this.db.order.findFirst({
      where: {
        OR: [{ id: orderId }, { brokerOrderId: orderId }],
      },
    });
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (order.status === 'FILLED' || order.status === 'CANCELLED') {
      throw new Error(`Order ${orderId} is already in final state: ${order.status}`);
    }
    await this.db.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', reservedCash: 0, reservedQuantity: 0 },
    });
  }
}

export const defaultSimBroker = new SimBrokerClient();
