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
  idempotencyKey?: string;
}

export interface BrokerOrder {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  type: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  status: 'SUBMITTED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  fillPrice?: number;
  filledAt?: Date;
}

export interface IBrokerClient {
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  createOrder(params: CreateOrderParams): Promise<BrokerOrder>;
  cancelOrder(orderId: string): Promise<void>;
}
