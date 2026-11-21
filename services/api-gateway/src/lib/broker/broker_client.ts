export interface BrokerAccount {
  id: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
}

export interface CreateOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  type: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  /** Used by mock/paper fallback when no limit price — live quote from execution engine. */
  estimatedPrice?: number;
  idempotencyKey?: string;
  clientOrderId?: string;
  assetClass?: string;
}

export interface BrokerOrder {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  qtyFilled?: number;
  type: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  status: 'SUBMITTED' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'PARTIALLY_FILLED';
  fillPrice?: number;
  filledAt?: Date;
  fee?: number;
  halfSpreadBps?: number;
  slippageBps?: number;
}

export interface IBrokerClient {
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  createOrder(params: CreateOrderParams): Promise<BrokerOrder>;
  getOrder(orderId: string): Promise<BrokerOrder>;
  cancelOrder(orderId: string): Promise<void>;
  getOrderByClientOrderId?(clientOrderId: string): Promise<BrokerOrder | null>;
}
