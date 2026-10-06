/**
 * Database row types (snake_case) and camelCase domain mappers for QuantroApex.
 * Matches supabase/migrations/20260916120000_init.sql
 */

export type ExperienceLevel = 'NEWCOMER' | 'INTERMEDIATE' | 'PROFESSIONAL';
export type DigestInterval = 'OFF' | 'DAILY' | 'WEEKLY';
export type OnboardingPath = 'NEWCOMER' | 'EXPRESS';
export type PortfolioMode = 'LIVE' | 'SIM';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TRAILING_STOP';
export type TradeOwner = 'APEX' | 'MANUAL';
export type OrderStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'FILLED'
  | 'PARTIALLY_FILLED'
  | 'CANCELLED'
  | 'REJECTED';
export type AgentPhase = 'SEED' | 'LEARNING' | 'ADAPTING' | 'AUTONOMOUS';
export type AssetClass = 'CRYPTO' | 'STOCKS' | 'FOREX' | 'GLOBAL';
export type RiskLevel = 'CONSERVATIVE' | 'GROWTH' | 'AGGRESSIVE' | 'EXPERIMENTAL';
export type ActivityEventType =
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'POSITION_ADJUSTED'
  | 'TRADING_PAUSED'
  | 'TRADING_RESUMED'
  | 'STRATEGY_CHANGED'
  | 'RISK_LIMIT_HIT'
  | 'EMERGENCY_STOP'
  | 'AGENT_PHASE_CHANGED'
  | 'SYSTEM';
export type MarketDataSource = 'ALPACA' | 'POLYGON' | 'CCXT' | 'OANDA' | 'SIMULATED';
export type KycProvider = 'sumsub';
export type KycStatus = 'PENDING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
export type SubscriptionPlan = 'FREE' | 'CORE' | 'PRO' | 'ELITE';
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'TRIALING' | 'INACTIVE';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Row types (snake_case — as stored in Postgres / returned by Supabase)
// ---------------------------------------------------------------------------

export type UserRow = {
  id: string;
  clerk_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  experience_level: ExperienceLevel;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type UserProfileRow = {
  id: string;
  user_id: string;
  risk_profile: Json | null;
  trading_capital: string | null;
  preferred_trading_mode: PortfolioMode;
  global_brain_consent: boolean;
  alpaca_api_key: string | null;
  alpaca_secret_key: string | null;
  is_broker_connected: boolean;
  created_at: string;
  updated_at: string;
}

export type OnboardingProgressRow = {
  id: string;
  user_id: string;
  path: OnboardingPath;
  current_step: number;
  state: Json;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RiskVaultRow = {
  id: string;
  user_id: string;
  daily_loss_limit: string;
  max_drawdown: string;
  per_trade_exposure: string;
  crypto_enabled: boolean;
  stocks_enabled: boolean;
  forex_enabled: boolean;
  emergency_stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

export type StrategyRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  asset_class: AssetClass;
  risk_level: RiskLevel;
  style: string;
  rules: Json;
  backtest_summary: Json;
  active_user_count: number;
  is_premium: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type UserStrategyRow = {
  id: string;
  user_id: string;
  strategy_id: string;
  is_active: boolean;
  selected_at: string;
}

export type PortfolioRow = {
  id: string;
  user_id: string;
  mode: PortfolioMode;
  cash_balance: string;
  equity: string;
  created_at: string;
  updated_at: string;
}

export type PositionRow = {
  id: string;
  portfolio_id: string;
  symbol: string;
  quantity: string;
  average_cost: string;
  broker_position_id: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderRow = {
  id: string;
  user_id: string;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: string;
  limit_price: string | null;
  status: OrderStatus;
  is_simulated: boolean;
  broker_order_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export type TradeRow = {
  id: string;
  order_id: string;
  fill_price: string;
  fill_quantity: string;
  realized_pnl: string | null;
  ai_reasoning: string | null;
  market_context: Json | null;
  filled_at: string;
}

export type ActivityFeedEntryRow = {
  id: string;
  user_id: string;
  event_type: ActivityEventType;
  message: string;
  metadata: Json | null;
  created_at: string;
}

export type AgentStateRow = {
  id: string;
  user_id: string;
  phase: AgentPhase;
  current_strategy_id: string | null;
  is_running: boolean;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationPreferencesRow = {
  id: string;
  user_id: string;
  digest_interval: DigestInterval;
  milestone_alerts: boolean;
  loss_threshold_pct: string | null;
  loss_alerts_enabled: boolean;
  push_enabled: boolean;
  fcm_token: string | null;
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
  phone_e164: string | null;
  created_at: string;
  updated_at: string;
}

export type MarketObservationRow = {
  id: string;
  symbol: string;
  asset_class: AssetClass;
  price: string;
  change_pct_24h: string;
  volume: string;
  technical_snapshot: Json;
  market_context: Json;
  source: MarketDataSource;
  observed_at: string;
}

export type TradeLearningDataRow = {
  id: string;
  user_id: string;
  symbol: string;
  asset_class: AssetClass;
  side: OrderSide;
  quantity: string;
  price: string;
  realized_pnl: string | null;
  is_win: boolean | null;
  technical_snapshot: Json | null;
  market_context: Json | null;
  source: MarketDataSource;
  is_simulated: boolean;
  observation_id: string | null;
  created_at: string;
}

export type KycVerificationRow = {
  id: string;
  user_id: string;
  provider: KycProvider;
  status: KycStatus;
  reference: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export type PaymentRow = {
  id: string;
  user_id: string;
  provider: string;
  reference: string;
  amount_kobo: number;
  currency: string;
  status: PaymentStatus;
  purpose: string;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// CamelCase domain models
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  experienceLevel: ExperienceLevel;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  userId: string;
  riskProfile: Json | null;
  tradingCapital: number | null;
  preferredTradingMode: PortfolioMode;
  globalBrainConsent: boolean;
  alpacaApiKey: string | null;
  alpacaSecretKey: string | null;
  isBrokerConnected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskVault {
  id: string;
  userId: string;
  assetClass?: AssetClass;
  dailyLossLimit: number;
  maxDrawdown: number;
  perTradeExposure: number;
  cryptoEnabled: boolean;
  stocksEnabled: boolean;
  forexEnabled: boolean;
  assetsEnabled?: boolean;
  emergencyStop?: boolean;
  emergencyStoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Strategy {
  id: string;
  slug: string;
  name: string;
  description: string;
  assetClass: AssetClass;
  riskLevel: RiskLevel;
  style: string;
  rules: Json;
  backtestSummary: Json;
  activeUserCount: number;
  isPremium: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Portfolio {
  id: string;
  userId: string;
  mode: PortfolioMode;
  cashBalance: number;
  equity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  digestInterval: DigestInterval;
  milestoneAlerts: boolean;
  lossThresholdPct: number | null;
  lossAlertsEnabled: boolean;
  pushEnabled: boolean;
  fcmToken: string | null;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  phoneE164: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KycVerification {
  id: string;
  userId: string;
  provider: KycProvider;
  status: KycStatus;
  reference: string | null;
  metadata: Json | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  userId: string;
  provider: string;
  reference: string;
  amountKobo: number;
  currency: string;
  status: PaymentStatus;
  purpose: string;
  metadata: Json | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  paystackSubscriptionCode: string | null;
  paystackCustomerCode: string | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function asDate(value: string | null | undefined): Date | null {
  if (value == null) return null;
  return new Date(value);
}

function asNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    clerkId: row.clerk_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    experienceLevel: row.experience_level,
    onboardingCompletedAt: asDate(row.onboarding_completed_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapUserProfileRow(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    userId: row.user_id,
    riskProfile: row.risk_profile,
    tradingCapital: asNumber(row.trading_capital),
    preferredTradingMode: row.preferred_trading_mode,
    globalBrainConsent: row.global_brain_consent,
    alpacaApiKey: row.alpaca_api_key,
    alpacaSecretKey: row.alpaca_secret_key,
    isBrokerConnected: row.is_broker_connected,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapRiskVaultRow(row: RiskVaultRow): RiskVault {
  return {
    id: row.id,
    userId: row.user_id,
    dailyLossLimit: asNumber(row.daily_loss_limit) ?? 0,
    maxDrawdown: asNumber(row.max_drawdown) ?? 0,
    perTradeExposure: asNumber(row.per_trade_exposure) ?? 0,
    cryptoEnabled: row.crypto_enabled,
    stocksEnabled: row.stocks_enabled,
    forexEnabled: row.forex_enabled,
    emergencyStoppedAt: asDate(row.emergency_stopped_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapStrategyRow(row: StrategyRow): Strategy {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    assetClass: row.asset_class,
    riskLevel: row.risk_level,
    style: row.style,
    rules: row.rules,
    backtestSummary: row.backtest_summary,
    activeUserCount: row.active_user_count,
    isPremium: row.is_premium,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapPortfolioRow(row: PortfolioRow): Portfolio {
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    cashBalance: asNumber(row.cash_balance) ?? 0,
    equity: asNumber(row.equity) ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapNotificationPreferencesRow(
  row: NotificationPreferencesRow,
): NotificationPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    digestInterval: row.digest_interval,
    milestoneAlerts: row.milestone_alerts,
    lossThresholdPct: asNumber(row.loss_threshold_pct),
    lossAlertsEnabled: row.loss_alerts_enabled,
    pushEnabled: row.push_enabled,
    fcmToken: row.fcm_token,
    whatsappEnabled: row.whatsapp_enabled,
    smsEnabled: row.sms_enabled,
    phoneE164: row.phone_e164,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapKycVerificationRow(row: KycVerificationRow): KycVerification {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    status: row.status,
    reference: row.reference,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapPaymentRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    reference: row.reference,
    amountKobo: row.amount_kobo,
    currency: row.currency,
    status: row.status,
    purpose: row.purpose,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapSubscriptionRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    status: row.status,
    paystackSubscriptionCode: row.paystack_subscription_code,
    paystackCustomerCode: row.paystack_customer_code,
    currentPeriodEnd: asDate(row.current_period_end),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface OnboardingProgress {
  id: string;
  userId: string;
  path: OnboardingPath;
  currentStep: number;
  state: Json;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  brokerPositionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  userId: string;
  symbol: string;
  assetClass?: AssetClass;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice: number | null;
  stopPrice?: number | null;
  trailingAmount?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  isOco?: boolean;
  owner?: TradeOwner;
  status: OrderStatus;
  isSimulated: boolean;
  brokerOrderId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  trades?: Trade[];
}

export interface Trade {
  id: string;
  orderId: string;
  fillPrice: number;
  fillQuantity: number;
  realizedPnl: number | null;
  aiReasoning: string | null;
  marketContext: Json | null;
  owner?: TradeOwner;
  filledAt: Date;
  order?: Pick<Order, 'symbol' | 'side' | 'orderType' | 'isSimulated' | 'userId'>;
}

export interface ActivityFeedEntry {
  id: string;
  userId: string;
  eventType: ActivityEventType;
  message: string;
  metadata: Json | null;
  createdAt: Date;
}

export interface AgentState {
  id: string;
  userId: string;
  phase: AgentPhase;
  currentStrategyId: string | null;
  isRunning: boolean;
  startedAt: Date | null;
  stoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentStrategy?: Pick<
    Strategy,
    'id' | 'name' | 'slug' | 'assetClass' | 'riskLevel' | 'description'
  > | null;
}

export interface UserStrategy {
  id: string;
  userId: string;
  strategyId: string;
  isActive: boolean;
  selectedAt: Date;
  strategy?: Strategy;
}

export interface TradeLearningData {
  id: string;
  userId: string;
  symbol: string;
  assetClass: AssetClass;
  side: OrderSide;
  quantity: number;
  price: number;
  realizedPnl: number | null;
  isWin: boolean | null;
  technicalSnapshot: Json | null;
  marketContext: Json | null;
  source: MarketDataSource;
  isSimulated: boolean;
  observationId: string | null;
  createdAt: Date;
}

export interface MarketObservation {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  price: number;
  changePct24h: number;
  volume: number;
  technicalSnapshot: Json;
  marketContext: Json;
  source: MarketDataSource;
  observedAt: Date;
}

export function mapOnboardingProgressRow(row: OnboardingProgressRow): OnboardingProgress {
  return {
    id: row.id,
    userId: row.user_id,
    path: row.path,
    currentStep: row.current_step,
    state: row.state,
    completedAt: asDate(row.completed_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapPositionRow(row: PositionRow): Position {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    symbol: row.symbol,
    quantity: asNumber(row.quantity) ?? 0,
    averageCost: asNumber(row.average_cost) ?? 0,
    brokerPositionId: row.broker_position_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: row.side,
    orderType: row.order_type,
    quantity: asNumber(row.quantity) ?? 0,
    limitPrice: asNumber(row.limit_price),
    status: row.status,
    isSimulated: row.is_simulated,
    brokerOrderId: row.broker_order_id,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapTradeRow(row: TradeRow): Trade {
  return {
    id: row.id,
    orderId: row.order_id,
    fillPrice: asNumber(row.fill_price) ?? 0,
    fillQuantity: asNumber(row.fill_quantity) ?? 0,
    realizedPnl: asNumber(row.realized_pnl),
    aiReasoning: row.ai_reasoning,
    marketContext: row.market_context,
    filledAt: new Date(row.filled_at),
  };
}

export function mapActivityFeedEntryRow(row: ActivityFeedEntryRow): ActivityFeedEntry {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    message: row.message,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
  };
}

export function mapAgentStateRow(row: AgentStateRow): AgentState {
  return {
    id: row.id,
    userId: row.user_id,
    phase: row.phase,
    currentStrategyId: row.current_strategy_id,
    isRunning: row.is_running,
    startedAt: asDate(row.started_at),
    stoppedAt: asDate(row.stopped_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapUserStrategyRow(row: UserStrategyRow): UserStrategy {
  return {
    id: row.id,
    userId: row.user_id,
    strategyId: row.strategy_id,
    isActive: row.is_active,
    selectedAt: new Date(row.selected_at),
  };
}

export function mapTradeLearningDataRow(row: TradeLearningDataRow): TradeLearningData {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    assetClass: row.asset_class,
    side: row.side,
    quantity: asNumber(row.quantity) ?? 0,
    price: asNumber(row.price) ?? 0,
    realizedPnl: asNumber(row.realized_pnl),
    isWin: row.is_win,
    technicalSnapshot: row.technical_snapshot,
    marketContext: row.market_context,
    source: row.source,
    isSimulated: row.is_simulated,
    observationId: row.observation_id,
    createdAt: new Date(row.created_at),
  };
}

export function mapMarketObservationRow(row: MarketObservationRow): MarketObservation {
  return {
    id: row.id,
    symbol: row.symbol,
    assetClass: row.asset_class,
    price: asNumber(row.price) ?? 0,
    changePct24h: asNumber(row.change_pct_24h) ?? 0,
    volume: asNumber(row.volume) ?? 0,
    technicalSnapshot: row.technical_snapshot,
    marketContext: row.market_context,
    source: row.source,
    observedAt: new Date(row.observed_at),
  };
}

/** Empty relationship list — expand when generating types from Supabase CLI. */
type Rel = [];

/**
 * Supabase Database schema for createClient<Database>.
 * Relationships/Views/Functions required by @supabase/postgrest-js GenericSchema.
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: {
          id?: string;
          clerk_id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          experience_level?: ExperienceLevel;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          experience_level?: ExperienceLevel;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: Rel;
      };
      user_profiles: {
        Row: UserProfileRow;
        Insert: {
          id?: string;
          user_id: string;
          risk_profile?: Json | null;
          trading_capital?: number | string | null;
          preferred_trading_mode?: PortfolioMode;
          global_brain_consent?: boolean;
          alpaca_api_key?: string | null;
          alpaca_secret_key?: string | null;
          is_broker_connected?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<UserProfileRow>;
        Relationships: Rel;
      };
      onboarding_progress: {
        Row: OnboardingProgressRow;
        Insert: {
          id?: string;
          user_id: string;
          path?: OnboardingPath;
          current_step?: number;
          state?: Json;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<OnboardingProgressRow>;
        Relationships: Rel;
      };
      risk_vaults: {
        Row: RiskVaultRow;
        Insert: {
          id?: string;
          user_id: string;
          daily_loss_limit: number | string;
          max_drawdown: number | string;
          per_trade_exposure: number | string;
          crypto_enabled?: boolean;
          stocks_enabled?: boolean;
          forex_enabled?: boolean;
          emergency_stopped_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<RiskVaultRow>;
        Relationships: Rel;
      };
      strategies: {
        Row: StrategyRow;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description: string;
          asset_class: AssetClass;
          risk_level: RiskLevel;
          style: string;
          rules: Json;
          backtest_summary: Json;
          active_user_count?: number;
          is_premium?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<StrategyRow>;
        Relationships: Rel;
      };
      user_strategies: {
        Row: UserStrategyRow;
        Insert: {
          id?: string;
          user_id: string;
          strategy_id: string;
          is_active?: boolean;
          selected_at?: string;
        };
        Update: Partial<UserStrategyRow>;
        Relationships: Rel;
      };
      portfolios: {
        Row: PortfolioRow;
        Insert: {
          id?: string;
          user_id: string;
          mode: PortfolioMode;
          cash_balance?: number | string;
          equity?: number | string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PortfolioRow>;
        Relationships: Rel;
      };
      positions: {
        Row: PositionRow;
        Insert: {
          id?: string;
          portfolio_id: string;
          symbol: string;
          quantity: number | string;
          average_cost: number | string;
          broker_position_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PositionRow>;
        Relationships: Rel;
      };
      orders: {
        Row: OrderRow;
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          side: OrderSide;
          order_type: OrderType;
          quantity: number | string;
          limit_price?: number | string | null;
          status?: OrderStatus;
          is_simulated?: boolean;
          broker_order_id?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<OrderRow>;
        Relationships: Rel;
      };
      trades: {
        Row: TradeRow;
        Insert: {
          id?: string;
          order_id: string;
          fill_price: number | string;
          fill_quantity: number | string;
          realized_pnl?: number | string | null;
          ai_reasoning?: string | null;
          market_context?: Json | null;
          filled_at?: string;
        };
        Update: Partial<TradeRow>;
        Relationships: Rel;
      };
      activity_feed_entries: {
        Row: ActivityFeedEntryRow;
        Insert: {
          id?: string;
          user_id: string;
          event_type: ActivityEventType;
          message: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<ActivityFeedEntryRow>;
        Relationships: Rel;
      };
      agent_states: {
        Row: AgentStateRow;
        Insert: {
          id?: string;
          user_id: string;
          phase?: AgentPhase;
          current_strategy_id?: string | null;
          is_running?: boolean;
          started_at?: string | null;
          stopped_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AgentStateRow>;
        Relationships: Rel;
      };
      notification_preferences: {
        Row: NotificationPreferencesRow;
        Insert: {
          id?: string;
          user_id: string;
          digest_interval?: DigestInterval;
          milestone_alerts?: boolean;
          loss_threshold_pct?: number | string | null;
          loss_alerts_enabled?: boolean;
          push_enabled?: boolean;
          fcm_token?: string | null;
          whatsapp_enabled?: boolean;
          sms_enabled?: boolean;
          phone_e164?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<NotificationPreferencesRow>;
        Relationships: Rel;
      };
      market_observations: {
        Row: MarketObservationRow;
        Insert: {
          id?: string;
          symbol: string;
          asset_class: AssetClass;
          price: number | string;
          change_pct_24h: number | string;
          volume: number | string;
          technical_snapshot: Json;
          market_context: Json;
          source: MarketDataSource;
          observed_at?: string;
        };
        Update: Partial<MarketObservationRow>;
        Relationships: Rel;
      };
      trade_learning_data: {
        Row: TradeLearningDataRow;
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          asset_class: AssetClass;
          side: OrderSide;
          quantity: number | string;
          price: number | string;
          realized_pnl?: number | string | null;
          is_win?: boolean | null;
          technical_snapshot?: Json | null;
          market_context?: Json | null;
          source?: MarketDataSource;
          is_simulated?: boolean;
          observation_id?: string | null;
          created_at?: string;
        };
        Update: Partial<TradeLearningDataRow>;
        Relationships: Rel;
      };
      kyc_verifications: {
        Row: KycVerificationRow;
        Insert: {
          id?: string;
          user_id: string;
          provider: KycProvider;
          status?: KycStatus;
          reference?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<KycVerificationRow>;
        Relationships: Rel;
      };
      payments: {
        Row: PaymentRow;
        Insert: {
          id?: string;
          user_id: string;
          provider?: string;
          reference: string;
          amount_kobo: number;
          currency?: string;
          status?: PaymentStatus;
          purpose: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PaymentRow>;
        Relationships: Rel;
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: {
          id?: string;
          user_id: string;
          plan?: SubscriptionPlan;
          status?: SubscriptionStatus;
          paystack_subscription_code?: string | null;
          paystack_customer_code?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<SubscriptionRow>;
        Relationships: Rel;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
}
