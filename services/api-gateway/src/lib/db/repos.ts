/**
 * Prisma data-access layer — camelCase domain API for routes and services.
 */
import {
  type ActivityEventType,
  type AgentPhase,
  type AssetClass,
  type DigestInterval,
  type ExperienceLevel,
  type MarketDataSource,
  type OnboardingPath,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type PortfolioMode,
  type Prisma,
  type RiskLevel,
} from '@prisma/client';
import { prisma } from '../prisma.js';
import type {
  ActivityFeedEntry,
  AgentState,
  Json,
  MarketObservation,
  NotificationPreferences,
  OnboardingProgress,
  Order,
  Portfolio,
  Position,
  RiskVault,
  Strategy,
  Trade,
  TradeLearningData,
  UserProfile,
  UserStrategy,
} from './types.js';

export type AppUser = {
  id: string;
  firebaseUid: string;
  /** @deprecated Use firebaseUid */
  clerkId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  experienceLevel: ExperienceLevel;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaUser = {
  id: string;
  firebaseUid: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  experienceLevel: ExperienceLevel;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function numOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

function asJson(value: Prisma.JsonValue | null | undefined): Json | null {
  if (value == null) return null;
  return value as Json;
}

function mapUser(row: PrismaUser): AppUser {
  return {
    id: row.id,
    firebaseUid: row.firebaseUid,
    clerkId: row.firebaseUid,
    email: row.email,
    phone: row.phone,
    name: row.name,
    firstName: row.firstName,
    lastName: row.lastName,
    experienceLevel: row.experienceLevel,
    onboardingCompletedAt: row.onboardingCompletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapProfile(row: {
  id: string;
  userId: string;
  riskProfile: Prisma.JsonValue | null;
  tradingCapital: Prisma.Decimal | null;
  preferredTradingMode: PortfolioMode;
  globalBrainConsent: boolean;
  alpacaApiKey: string | null;
  alpacaSecretKey: string | null;
  isBrokerConnected: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserProfile {
  return {
    id: row.id,
    userId: row.userId,
    riskProfile: asJson(row.riskProfile),
    tradingCapital: numOrNull(row.tradingCapital),
    preferredTradingMode: row.preferredTradingMode,
    globalBrainConsent: row.globalBrainConsent,
    alpacaApiKey: row.alpacaApiKey,
    alpacaSecretKey: row.alpacaSecretKey,
    isBrokerConnected: row.isBrokerConnected,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRiskVault(row: {
  id: string;
  userId: string;
  assetClass?: AssetClass;
  dailyLossLimit: Prisma.Decimal;
  maxDrawdown: Prisma.Decimal;
  perTradeExposure: Prisma.Decimal;
  cryptoEnabled: boolean;
  stocksEnabled: boolean;
  forexEnabled: boolean;
  assetsEnabled?: boolean;
  emergencyStop?: boolean;
  emergencyStoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RiskVault {
  return {
    id: row.id,
    userId: row.userId,
    assetClass: row.assetClass ?? 'STOCKS',
    dailyLossLimit: num(row.dailyLossLimit),
    maxDrawdown: num(row.maxDrawdown),
    perTradeExposure: num(row.perTradeExposure),
    cryptoEnabled: row.cryptoEnabled,
    stocksEnabled: row.stocksEnabled,
    forexEnabled: row.forexEnabled,
    assetsEnabled: row.assetsEnabled ?? true,
    emergencyStop: row.emergencyStop ?? false,
    emergencyStoppedAt: row.emergencyStoppedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOnboarding(row: {
  id: string;
  userId: string;
  path: OnboardingPath;
  currentStep: number;
  state: Prisma.JsonValue;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): OnboardingProgress {
  return {
    id: row.id,
    userId: row.userId,
    path: row.path,
    currentStep: row.currentStep,
    state: (row.state ?? {}) as Json,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapStrategy(row: {
  id: string;
  slug: string;
  name: string;
  description: string;
  assetClass: AssetClass;
  riskLevel: RiskLevel;
  style: string;
  rules: Prisma.JsonValue;
  backtestSummary: Prisma.JsonValue;
  activeUserCount: number;
  isPremium: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Strategy {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    assetClass: row.assetClass,
    riskLevel: row.riskLevel,
    style: row.style,
    rules: row.rules as Json,
    backtestSummary: row.backtestSummary as Json,
    activeUserCount: row.activeUserCount,
    isPremium: row.isPremium,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapUserStrategy(row: {
  id: string;
  userId: string;
  strategyId: string;
  isActive: boolean;
  selectedAt: Date;
}): UserStrategy {
  return {
    id: row.id,
    userId: row.userId,
    strategyId: row.strategyId,
    isActive: row.isActive,
    selectedAt: row.selectedAt,
  };
}

function mapAgentState(row: {
  id: string;
  userId: string;
  phase: AgentPhase;
  currentStrategyId: string | null;
  isRunning: boolean;
  startedAt: Date | null;
  stoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AgentState {
  return {
    id: row.id,
    userId: row.userId,
    phase: row.phase,
    currentStrategyId: row.currentStrategyId,
    isRunning: row.isRunning,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPortfolio(row: {
  id: string;
  userId: string;
  mode: PortfolioMode;
  cashBalance: Prisma.Decimal;
  equity: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): Portfolio {
  return {
    id: row.id,
    userId: row.userId,
    mode: row.mode,
    cashBalance: num(row.cashBalance),
    equity: num(row.equity),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPosition(row: {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  brokerPositionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Position {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    symbol: row.symbol,
    quantity: num(row.quantity),
    averageCost: num(row.averageCost),
    brokerPositionId: row.brokerPositionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOrder(row: {
  id: string;
  userId: string;
  symbol: string;
  assetClass?: AssetClass;
  side: OrderSide;
  orderType: OrderType;
  quantity: Prisma.Decimal;
  limitPrice: Prisma.Decimal | null;
  stopPrice?: Prisma.Decimal | null;
  trailingAmount?: Prisma.Decimal | null;
  takeProfit?: Prisma.Decimal | null;
  stopLoss?: Prisma.Decimal | null;
  isOco?: boolean;
  owner?: 'APEX' | 'MANUAL';
  status: OrderStatus;
  isSimulated: boolean;
  brokerOrderId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Order {
  return {
    id: row.id,
    userId: row.userId,
    symbol: row.symbol,
    assetClass: row.assetClass,
    side: row.side,
    orderType: row.orderType,
    quantity: num(row.quantity),
    limitPrice: numOrNull(row.limitPrice),
    stopPrice: numOrNull(row.stopPrice ?? null),
    trailingAmount: numOrNull(row.trailingAmount ?? null),
    takeProfit: numOrNull(row.takeProfit ?? null),
    stopLoss: numOrNull(row.stopLoss ?? null),
    isOco: row.isOco ?? false,
    owner: row.owner ?? 'APEX',
    status: row.status,
    isSimulated: row.isSimulated,
    brokerOrderId: row.brokerOrderId,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTrade(row: {
  id: string;
  orderId: string;
  fillPrice: Prisma.Decimal;
  fillQuantity: Prisma.Decimal;
  realizedPnl: Prisma.Decimal | null;
  aiReasoning: string | null;
  marketContext: Prisma.JsonValue | null;
  owner?: 'APEX' | 'MANUAL';
  filledAt: Date;
}): Trade {
  return {
    id: row.id,
    orderId: row.orderId,
    fillPrice: num(row.fillPrice),
    fillQuantity: num(row.fillQuantity),
    realizedPnl: numOrNull(row.realizedPnl),
    aiReasoning: row.aiReasoning,
    marketContext: asJson(row.marketContext),
    owner: row.owner ?? 'APEX',
    filledAt: row.filledAt,
  };
}

function mapActivity(row: {
  id: string;
  userId: string;
  eventType: ActivityEventType;
  message: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): ActivityFeedEntry {
  return {
    id: row.id,
    userId: row.userId,
    eventType: row.eventType,
    message: row.message,
    metadata: asJson(row.metadata),
    createdAt: row.createdAt,
  };
}

function mapNotificationPrefs(row: {
  id: string;
  userId: string;
  digestInterval: DigestInterval;
  milestoneAlerts: boolean;
  lossThresholdPct: Prisma.Decimal | null;
  lossAlertsEnabled: boolean;
  pushEnabled: boolean;
  fcmToken: string | null;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  phoneE164: string | null;
  createdAt: Date;
  updatedAt: Date;
}): NotificationPreferences {
  return {
    id: row.id,
    userId: row.userId,
    digestInterval: row.digestInterval,
    milestoneAlerts: row.milestoneAlerts,
    lossThresholdPct: numOrNull(row.lossThresholdPct),
    lossAlertsEnabled: row.lossAlertsEnabled,
    pushEnabled: row.pushEnabled,
    fcmToken: row.fcmToken,
    whatsappEnabled: row.whatsappEnabled,
    smsEnabled: row.smsEnabled,
    phoneE164: row.phoneE164,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTradeLearning(row: {
  id: string;
  userId: string;
  symbol: string;
  assetClass: AssetClass;
  side: OrderSide;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  realizedPnl: Prisma.Decimal | null;
  isWin: boolean | null;
  technicalSnapshot: Prisma.JsonValue | null;
  marketContext: Prisma.JsonValue | null;
  source: MarketDataSource;
  isSimulated: boolean;
  observationId: string | null;
  createdAt: Date;
}): TradeLearningData {
  return {
    id: row.id,
    userId: row.userId,
    symbol: row.symbol,
    assetClass: row.assetClass,
    side: row.side,
    quantity: num(row.quantity),
    price: num(row.price),
    realizedPnl: numOrNull(row.realizedPnl),
    isWin: row.isWin,
    technicalSnapshot: asJson(row.technicalSnapshot),
    marketContext: asJson(row.marketContext),
    source: row.source,
    isSimulated: row.isSimulated,
    observationId: row.observationId,
    createdAt: row.createdAt,
  };
}

function mapMarketObservation(row: {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  price: Prisma.Decimal;
  changePct24h: Prisma.Decimal;
  volume: Prisma.Decimal;
  technicalSnapshot: Prisma.JsonValue;
  marketContext: Prisma.JsonValue;
  source: MarketDataSource;
  observedAt: Date;
}): MarketObservation {
  return {
    id: row.id,
    symbol: row.symbol,
    assetClass: row.assetClass,
    price: num(row.price),
    changePct24h: num(row.changePct24h),
    volume: num(row.volume),
    technicalSnapshot: row.technicalSnapshot as Json,
    marketContext: row.marketContext as Json,
    source: row.source,
    observedAt: row.observedAt,
  };
}

/** Map snake_case filter keys (legacy callers) to Prisma camelCase. */
function toPrismaWhere(filters: Record<string, unknown>): Record<string, unknown> {
  const keyMap: Record<string, string> = {
    user_id: 'userId',
    is_win: 'isWin',
    asset_class: 'assetClass',
    observation_id: 'observationId',
    is_simulated: 'isSimulated',
    realized_pnl: 'realizedPnl',
    change_pct_24h: 'changePct24h',
    observed_at: 'observedAt',
  };
  const where: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    where[keyMap[k] ?? k] = v;
  }
  return where;
}

// ── Users ───────────────────────────────────────────────────────────────────

export async function findUserById(userId: string): Promise<AppUser | null> {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  return row ? mapUser(row) : null;
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<AppUser | null> {
  const row = await prisma.user.findUnique({ where: { firebaseUid } });
  return row ? mapUser(row) : null;
}

/** @deprecated Use findUserByFirebaseUid */
export async function findUserByClerkId(clerkId: string): Promise<AppUser | null> {
  return findUserByFirebaseUid(clerkId);
}

export async function createUserWithBootstrap(input: {
  firebaseUid: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string;
}): Promise<AppUser> {
  const email = input.email?.toLowerCase().trim() || null;
  const derivedName = [input.firstName, input.lastName].filter(Boolean).join(' ');
  const name =
    input.name?.trim() ||
    derivedName ||
    email?.split('@')[0] ||
    input.phone ||
    'QuantroApex User';

  const row = await prisma.user.create({
    data: {
      firebaseUid: input.firebaseUid,
      email,
      phone: input.phone ?? null,
      name,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      experienceLevel: 'NEWCOMER',
      profile: { create: {} },
      onboardingProgress: {
        create: { path: 'NEWCOMER', currentStep: 1, state: {} },
      },
      agentState: { create: {} },
      notificationPrefs: { create: {} },
      subscription: { create: { plan: 'FREE' } },
      portfolios: {
        create: [
          { mode: 'LIVE', cashBalance: 0, equity: 0 },
          { mode: 'SIM', cashBalance: 100000, equity: 100000 },
        ],
      },
      riskVaults: {
        create: [
          {
            assetClass: 'STOCKS',
            dailyLossLimit: 500,
            maxDrawdown: 0.15,
            perTradeExposure: 0.05,
            assetsEnabled: true,
          },
          {
            assetClass: 'CRYPTO',
            dailyLossLimit: 500,
            maxDrawdown: 0.2,
            perTradeExposure: 0.05,
            assetsEnabled: false,
          },
          {
            assetClass: 'FOREX',
            dailyLossLimit: 500,
            maxDrawdown: 0.15,
            perTradeExposure: 0.05,
            assetsEnabled: false,
          },
          {
            assetClass: 'GLOBAL',
            dailyLossLimit: 1000,
            maxDrawdown: 0.2,
            perTradeExposure: 0.1,
            assetsEnabled: true,
          },
        ],
      },
    },
  });

  return mapUser(row);
}

export async function updateUser(
  userId: string,
  data: Partial<{
    firstName: string | null;
    lastName: string | null;
    experienceLevel: ExperienceLevel;
    onboardingCompletedAt: Date | null;
    phone: string | null;
    name: string;
  }>,
): Promise<AppUser> {
  const row = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(data.experienceLevel !== undefined ? { experienceLevel: data.experienceLevel } : {}),
      ...(data.onboardingCompletedAt !== undefined
        ? { onboardingCompletedAt: data.onboardingCompletedAt }
        : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.name !== undefined && data.name !== null ? { name: data.name } : {}),
    },
  });
  return mapUser(row);
}

export async function findUserBundle(userId: string) {
  const user = await findUserById(userId);
  if (!user) return null;
  const [profile, onboardingProgress, riskVault, notificationPrefs, agentState] = await Promise.all([
    findUserProfile(userId),
    findOnboardingProgress(userId),
    findRiskVault(userId),
    findNotificationPrefs(userId),
    findAgentState(userId),
  ]);
  return { ...user, profile, onboardingProgress, riskVault, notificationPrefs, agentState };
}

export async function deleteUsersByEmailSuffix(suffix: string): Promise<void> {
  await prisma.user.deleteMany({
    where: { email: { endsWith: suffix } },
  });
}

// ── Profiles ────────────────────────────────────────────────────────────────

export async function findUserProfile(userId: string): Promise<UserProfile | null> {
  const row = await prisma.userProfile.findUnique({ where: { userId } });
  return row ? mapProfile(row) : null;
}

export async function upsertUserProfile(
  userId: string,
  data: Partial<{
    riskProfile: Json | null;
    tradingCapital: number | null;
    preferredTradingMode: PortfolioMode;
    globalBrainConsent: boolean;
    alpacaApiKey: string | null;
    alpacaSecretKey: string | null;
    isBrokerConnected: boolean;
  }>,
): Promise<UserProfile> {
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      ...(data.riskProfile !== undefined
        ? { riskProfile: data.riskProfile as Prisma.InputJsonValue }
        : {}),
      ...(data.tradingCapital !== undefined ? { tradingCapital: data.tradingCapital } : {}),
      ...(data.preferredTradingMode !== undefined
        ? { preferredTradingMode: data.preferredTradingMode }
        : {}),
      ...(data.globalBrainConsent !== undefined
        ? { globalBrainConsent: data.globalBrainConsent }
        : {}),
      ...(data.alpacaApiKey !== undefined ? { alpacaApiKey: data.alpacaApiKey } : {}),
      ...(data.alpacaSecretKey !== undefined ? { alpacaSecretKey: data.alpacaSecretKey } : {}),
      ...(data.isBrokerConnected !== undefined
        ? { isBrokerConnected: data.isBrokerConnected }
        : {}),
    },
    update: {
      ...(data.riskProfile !== undefined
        ? { riskProfile: data.riskProfile as Prisma.InputJsonValue }
        : {}),
      ...(data.tradingCapital !== undefined ? { tradingCapital: data.tradingCapital } : {}),
      ...(data.preferredTradingMode !== undefined
        ? { preferredTradingMode: data.preferredTradingMode }
        : {}),
      ...(data.globalBrainConsent !== undefined
        ? { globalBrainConsent: data.globalBrainConsent }
        : {}),
      ...(data.alpacaApiKey !== undefined ? { alpacaApiKey: data.alpacaApiKey } : {}),
      ...(data.alpacaSecretKey !== undefined ? { alpacaSecretKey: data.alpacaSecretKey } : {}),
      ...(data.isBrokerConnected !== undefined
        ? { isBrokerConnected: data.isBrokerConnected }
        : {}),
    },
  });
  return mapProfile(row);
}

// ── Risk vault ──────────────────────────────────────────────────────────────

export async function findRiskVault(
  userId: string,
  assetClass: AssetClass | string = 'STOCKS',
): Promise<RiskVault | null> {
  const cls = String(assetClass).toUpperCase() as AssetClass;
  const row = await prisma.riskVault.findUnique({
    where: { userId_assetClass: { userId, assetClass: cls } },
  });
  return row ? mapRiskVault(row) : null;
}

export async function createRiskVault(input: {
  userId: string;
  assetClass?: AssetClass | string;
  dailyLossLimit?: number;
  maxDrawdown?: number;
  perTradeExposure?: number;
  cryptoEnabled?: boolean;
  stocksEnabled?: boolean;
  forexEnabled?: boolean;
  assetsEnabled?: boolean;
  emergencyStop?: boolean;
  emergencyStoppedAt?: Date | null;
}): Promise<RiskVault> {
  const cls = String(input.assetClass ?? 'STOCKS').toUpperCase() as AssetClass;
  const row = await prisma.riskVault.create({
    data: {
      userId: input.userId,
      assetClass: cls,
      dailyLossLimit: input.dailyLossLimit ?? 500,
      maxDrawdown: input.maxDrawdown ?? 0.15,
      perTradeExposure: input.perTradeExposure ?? 0.05,
      cryptoEnabled: input.cryptoEnabled ?? false,
      stocksEnabled: input.stocksEnabled ?? true,
      forexEnabled: input.forexEnabled ?? false,
      assetsEnabled: input.assetsEnabled ?? true,
      emergencyStop: input.emergencyStop ?? false,
      emergencyStoppedAt: input.emergencyStoppedAt ?? null,
    },
  });
  return mapRiskVault(row);
}

export async function upsertRiskVault(
  userId: string,
  data: Partial<{
    assetClass: AssetClass | string;
    dailyLossLimit: number;
    maxDrawdown: number;
    perTradeExposure: number;
    cryptoEnabled: boolean;
    stocksEnabled: boolean;
    forexEnabled: boolean;
    assetsEnabled: boolean;
    emergencyStop: boolean;
    emergencyStoppedAt: Date | null;
  }>,
): Promise<RiskVault> {
  const cls = String(data.assetClass ?? 'STOCKS').toUpperCase() as AssetClass;
  const existing = await findRiskVault(userId, cls);
  if (!existing) {
    return createRiskVault({ userId, assetClass: cls, ...data });
  }
  const row = await prisma.riskVault.update({
    where: { userId_assetClass: { userId, assetClass: cls } },
    data: {
      ...(data.dailyLossLimit !== undefined ? { dailyLossLimit: data.dailyLossLimit } : {}),
      ...(data.maxDrawdown !== undefined ? { maxDrawdown: data.maxDrawdown } : {}),
      ...(data.perTradeExposure !== undefined ? { perTradeExposure: data.perTradeExposure } : {}),
      ...(data.cryptoEnabled !== undefined ? { cryptoEnabled: data.cryptoEnabled } : {}),
      ...(data.stocksEnabled !== undefined ? { stocksEnabled: data.stocksEnabled } : {}),
      ...(data.forexEnabled !== undefined ? { forexEnabled: data.forexEnabled } : {}),
      ...(data.assetsEnabled !== undefined ? { assetsEnabled: data.assetsEnabled } : {}),
      ...(data.emergencyStop !== undefined ? { emergencyStop: data.emergencyStop } : {}),
      ...(data.emergencyStoppedAt !== undefined
        ? { emergencyStoppedAt: data.emergencyStoppedAt }
        : {}),
    },
  });
  return mapRiskVault(row);
}

// ── Onboarding ──────────────────────────────────────────────────────────────

export async function findOnboardingProgress(userId: string): Promise<OnboardingProgress | null> {
  const row = await prisma.onboardingProgress.findUnique({ where: { userId } });
  return row ? mapOnboarding(row) : null;
}

export async function upsertOnboardingProgress(
  userId: string,
  data: Partial<{
    path: OnboardingPath;
    currentStep: number;
    state: Json;
    completedAt: Date | null;
  }>,
): Promise<OnboardingProgress> {
  const row = await prisma.onboardingProgress.upsert({
    where: { userId },
    create: {
      userId,
      path: data.path ?? 'NEWCOMER',
      currentStep: data.currentStep ?? 1,
      state: (data.state ?? {}) as Prisma.InputJsonValue,
      completedAt: data.completedAt ?? null,
    },
    update: {
      ...(data.path !== undefined ? { path: data.path } : {}),
      ...(data.currentStep !== undefined ? { currentStep: data.currentStep } : {}),
      ...(data.state !== undefined ? { state: data.state as Prisma.InputJsonValue } : {}),
      ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
    },
  });
  return mapOnboarding(row);
}

// ── Strategies ──────────────────────────────────────────────────────────────

export async function listStrategies(opts?: {
  assetClass?: AssetClass;
  riskLevel?: RiskLevel;
  skip?: number;
  take?: number;
}): Promise<{ strategies: Strategy[]; total: number }> {
  const where = {
    isActive: true,
    ...(opts?.assetClass ? { assetClass: opts.assetClass } : {}),
    ...(opts?.riskLevel ? { riskLevel: opts.riskLevel } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.strategy.findMany({
      where,
      orderBy: { activeUserCount: 'desc' },
      skip: opts?.skip,
      take: opts?.take,
    }),
    prisma.strategy.count({ where }),
  ]);
  return {
    strategies: rows.map(mapStrategy),
    total,
  };
}

export async function findStrategyByIdOrSlug(idOrSlug: string): Promise<Strategy | null> {
  const byId = await prisma.strategy.findUnique({ where: { id: idOrSlug } });
  if (byId) return mapStrategy(byId);
  const bySlug = await prisma.strategy.findUnique({ where: { slug: idOrSlug } });
  return bySlug ? mapStrategy(bySlug) : null;
}

export async function findStrategyById(strategyId: string): Promise<Strategy | null> {
  const row = await prisma.strategy.findUnique({ where: { id: strategyId } });
  return row ? mapStrategy(row) : null;
}

export async function findFirstStrategy(filter: {
  assetClass?: AssetClass;
  riskLevel?: RiskLevel;
}): Promise<Strategy | null> {
  const row = await prisma.strategy.findFirst({
    where: {
      isActive: true,
      ...(filter.assetClass ? { assetClass: filter.assetClass } : {}),
      ...(filter.riskLevel ? { riskLevel: filter.riskLevel } : {}),
    },
  });
  return row ? mapStrategy(row) : null;
}

export async function incrementStrategyActiveUsers(strategyId: string): Promise<void> {
  await prisma.strategy.update({
    where: { id: strategyId },
    data: { activeUserCount: { increment: 1 } },
  }).catch(() => undefined);
}

export async function upsertUserStrategy(userId: string, strategyId: string): Promise<UserStrategy> {
  await prisma.userStrategy.updateMany({
    where: { userId },
    data: { isActive: false },
  });

  const row = await prisma.userStrategy.upsert({
    where: { userId_strategyId: { userId, strategyId } },
    create: { userId, strategyId, isActive: true },
    update: { isActive: true, selectedAt: new Date() },
  });
  return mapUserStrategy(row);
}

export async function findActiveUserStrategy(
  userId: string,
): Promise<(UserStrategy & { strategy: Strategy | null }) | null> {
  const row = await prisma.userStrategy.findFirst({
    where: { userId, isActive: true },
    include: { strategy: true },
  });
  if (!row) return null;
  const us = mapUserStrategy(row);
  return {
    ...us,
    strategy: row.strategy ? mapStrategy(row.strategy) : null,
  } as UserStrategy & { strategy: Strategy | null };
}

// ── Agent state ─────────────────────────────────────────────────────────────

export async function findAgentState(userId: string): Promise<AgentState | null> {
  const row = await prisma.agentState.findUnique({
    where: { userId },
    include: {
      currentStrategy: {
        select: {
          id: true,
          name: true,
          slug: true,
          assetClass: true,
          riskLevel: true,
          description: true,
        },
      },
    },
  });
  if (!row) return null;
  const state = mapAgentState(row);
  if (row.currentStrategy) {
    state.currentStrategy = row.currentStrategy;
  }
  return state;
}

export async function upsertAgentState(
  userId: string,
  data: Partial<{
    phase: AgentPhase;
    currentStrategyId: string | null;
    isRunning: boolean;
    startedAt: Date | null;
    stoppedAt: Date | null;
  }>,
): Promise<AgentState> {
  const row = await prisma.agentState.upsert({
    where: { userId },
    create: {
      userId,
      phase: data.phase ?? 'SEED',
      currentStrategyId: data.currentStrategyId ?? null,
      isRunning: data.isRunning ?? false,
      startedAt: data.startedAt ?? null,
      stoppedAt: data.stoppedAt ?? null,
    },
    update: {
      ...(data.phase !== undefined ? { phase: data.phase } : {}),
      ...(data.currentStrategyId !== undefined
        ? { currentStrategyId: data.currentStrategyId }
        : {}),
      ...(data.isRunning !== undefined ? { isRunning: data.isRunning } : {}),
      ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
      ...(data.stoppedAt !== undefined ? { stoppedAt: data.stoppedAt } : {}),
    },
  });
  return mapAgentState(row);
}

// ── Portfolios / positions ──────────────────────────────────────────────────

export async function findPortfolio(
  userId: string,
  mode: PortfolioMode,
): Promise<(Portfolio & { positions?: Position[] }) | null> {
  const row = await prisma.portfolio.findUnique({
    where: { userId_mode: { userId, mode } },
    include: { positions: true },
  });
  if (!row) return null;
  return {
    ...mapPortfolio(row),
    positions: row.positions.map(mapPosition),
  };
}

export async function createPortfolio(input: {
  userId: string;
  mode: PortfolioMode;
  cashBalance?: number;
  equity?: number;
}): Promise<Portfolio & { positions: Position[] }> {
  const row = await prisma.portfolio.create({
    data: {
      userId: input.userId,
      mode: input.mode,
      cashBalance: input.cashBalance ?? 0,
      equity: input.equity ?? 0,
    },
  });
  return { ...mapPortfolio(row), positions: [] };
}

export async function updatePortfolio(
  portfolioId: string,
  data: Partial<{ cashBalance: number; equity: number }>,
): Promise<Portfolio> {
  const row = await prisma.portfolio.update({
    where: { id: portfolioId },
    data: {
      ...(data.cashBalance !== undefined ? { cashBalance: data.cashBalance } : {}),
      ...(data.equity !== undefined ? { equity: data.equity } : {}),
    },
  });
  return mapPortfolio(row);
}

export async function listPositions(portfolioId: string): Promise<Position[]> {
  const rows = await prisma.position.findMany({ where: { portfolioId } });
  return rows.map(mapPosition);
}

export async function findPosition(
  portfolioId: string,
  symbol: string,
): Promise<Position | null> {
  const row = await prisma.position.findUnique({
    where: { portfolioId_symbol: { portfolioId, symbol } },
  });
  return row ? mapPosition(row) : null;
}

export async function upsertPosition(input: {
  portfolioId: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  brokerPositionId?: string | null;
}): Promise<Position> {
  const row = await prisma.position.upsert({
    where: {
      portfolioId_symbol: { portfolioId: input.portfolioId, symbol: input.symbol },
    },
    create: {
      portfolioId: input.portfolioId,
      symbol: input.symbol,
      quantity: input.quantity,
      averageCost: input.averageCost,
      brokerPositionId: input.brokerPositionId ?? null,
    },
    update: {
      quantity: input.quantity,
      averageCost: input.averageCost,
      ...(input.brokerPositionId !== undefined
        ? { brokerPositionId: input.brokerPositionId }
        : {}),
    },
  });
  return mapPosition(row);
}

export async function updatePosition(
  positionId: string,
  data: Partial<{ quantity: number; averageCost: number }>,
): Promise<Position> {
  const row = await prisma.position.update({
    where: { id: positionId },
    data: {
      ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
      ...(data.averageCost !== undefined ? { averageCost: data.averageCost } : {}),
    },
  });
  return mapPosition(row);
}

export async function deletePosition(positionId: string): Promise<void> {
  await prisma.position.delete({ where: { id: positionId } });
}

export async function deletePositionsForPortfolio(portfolioId: string): Promise<void> {
  await prisma.position.deleteMany({ where: { portfolioId } });
}

// ── Orders / trades ─────────────────────────────────────────────────────────

export async function createOrder(input: {
  userId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  trailingAmount?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  isOco?: boolean;
  owner?: 'APEX' | 'MANUAL';
  assetClass?: AssetClass;
  status?: OrderStatus;
  isSimulated?: boolean;
  brokerOrderId?: string | null;
  idempotencyKey?: string | null;
}): Promise<Order> {
  const row = await prisma.order.create({
    data: {
      userId: input.userId,
      symbol: input.symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      limitPrice: input.limitPrice ?? null,
      stopPrice: input.stopPrice ?? null,
      trailingAmount: input.trailingAmount ?? null,
      takeProfit: input.takeProfit ?? null,
      stopLoss: input.stopLoss ?? null,
      isOco: input.isOco ?? false,
      owner: input.owner ?? 'APEX',
      assetClass: (input.assetClass as AssetClass) ?? 'STOCKS',
      status: input.status ?? 'PENDING',
      isSimulated: input.isSimulated ?? true,
      brokerOrderId: input.brokerOrderId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  return mapOrder(row);
}

export async function updateOrder(
  orderId: string,
  data: Partial<{
    status: OrderStatus;
    brokerOrderId: string | null;
    limitPrice: number | null;
  }>,
): Promise<Order> {
  const row = await prisma.order.update({
    where: { id: orderId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.brokerOrderId !== undefined ? { brokerOrderId: data.brokerOrderId } : {}),
      ...(data.limitPrice !== undefined ? { limitPrice: data.limitPrice } : {}),
    },
  });
  return mapOrder(row);
}

export async function listOrders(
  userId: string,
  opts?: { skip?: number; take?: number },
): Promise<{ orders: (Order & { trades: Trade[] })[]; total: number }> {
  const take = opts?.take ?? 20;
  const skip = opts?.skip ?? 0;
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { trades: true },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    orders: rows.map((r) => ({
      ...mapOrder(r),
      trades: r.trades.map(mapTrade),
    })),
    total,
  };
}

export async function findPendingOrders(userId: string): Promise<Order[]> {
  const rows = await prisma.order.findMany({
    where: {
      userId,
      status: { in: ['SUBMITTED', 'PENDING'] },
      brokerOrderId: { not: null },
    },
  });
  return rows.map(mapOrder);
}

export async function findOrderById(orderId: string): Promise<Order | null> {
  const row = await prisma.order.findUnique({ where: { id: orderId } });
  return row ? mapOrder(row) : null;
}

export async function deleteSimulatedOrders(userId: string): Promise<void> {
  await prisma.order.deleteMany({
    where: { userId, isSimulated: true },
  });
}

export async function createTrade(input: {
  orderId: string;
  fillPrice: number;
  fillQuantity: number;
  realizedPnl?: number | null;
  aiReasoning?: string | null;
  marketContext?: Json | null;
  owner?: 'APEX' | 'MANUAL';
}): Promise<Trade> {
  const row = await prisma.trade.create({
    data: {
      orderId: input.orderId,
      fillPrice: input.fillPrice,
      fillQuantity: input.fillQuantity,
      realizedPnl: input.realizedPnl ?? null,
      aiReasoning: input.aiReasoning ?? null,
      owner: input.owner ?? 'APEX',
      marketContext:
        input.marketContext === undefined || input.marketContext === null
          ? undefined
          : (input.marketContext as Prisma.InputJsonValue),
    },
  });
  return mapTrade(row);
}

export async function findTradeByOrderId(orderId: string): Promise<Trade | null> {
  const row = await prisma.trade.findFirst({ where: { orderId } });
  return row ? mapTrade(row) : null;
}

export async function listTradesForOrder(orderId: string): Promise<Trade[]> {
  const rows = await prisma.trade.findMany({ where: { orderId } });
  return rows.map(mapTrade);
}

export async function listUserTrades(
  userId: string,
  opts?: { symbol?: string; side?: OrderSide; skip?: number; take?: number },
): Promise<Trade[]> {
  const take = opts?.take ?? 100;
  const skip = opts?.skip ?? 0;
  const rows = await prisma.trade.findMany({
    where: {
      order: {
        userId,
        ...(opts?.symbol ? { symbol: opts.symbol } : {}),
        ...(opts?.side ? { side: opts.side } : {}),
      },
    },
    orderBy: { filledAt: 'desc' },
    skip,
    take,
    include: {
      order: {
        select: {
          symbol: true,
          side: true,
          orderType: true,
          isSimulated: true,
          userId: true,
        },
      },
    },
  });

  return rows.map((r) => {
    const trade = mapTrade(r);
    trade.order = r.order;
    return trade;
  });
}

// ── Activity feed ───────────────────────────────────────────────────────────

export async function createActivityEntry(input: {
  userId: string;
  eventType: ActivityEventType;
  message: string;
  metadata?: Json | null;
}): Promise<ActivityFeedEntry> {
  const row = await prisma.activityFeedEntry.create({
    data: {
      userId: input.userId,
      eventType: input.eventType,
      message: input.message,
      metadata:
        input.metadata === undefined || input.metadata === null
          ? undefined
          : (input.metadata as Prisma.InputJsonValue),
    },
  });
  return mapActivity(row);
}

export async function listActivityFeed(
  userId: string,
  opts?: { skip?: number; take?: number },
): Promise<{ entries: ActivityFeedEntry[]; total: number }> {
  const take = opts?.take ?? 20;
  const skip = opts?.skip ?? 0;
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.activityFeedEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.activityFeedEntry.count({ where }),
  ]);
  return {
    entries: rows.map(mapActivity),
    total,
  };
}

// ── Notifications ───────────────────────────────────────────────────────────

export async function findNotificationPrefs(
  userId: string,
): Promise<NotificationPreferences | null> {
  const row = await prisma.notificationPreferences.findUnique({ where: { userId } });
  return row ? mapNotificationPrefs(row) : null;
}

export async function createNotificationPrefs(userId: string): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreferences.create({
    data: { userId },
  });
  return mapNotificationPrefs(row);
}

export async function upsertNotificationPrefs(
  userId: string,
  data: Partial<{
    digestInterval: DigestInterval;
    milestoneAlerts: boolean;
    lossThresholdPct: number | null;
    lossAlertsEnabled: boolean;
    pushEnabled: boolean;
    fcmToken: string | null;
    whatsappEnabled: boolean;
    smsEnabled: boolean;
    phoneE164: string | null;
  }>,
): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      ...(data.digestInterval !== undefined ? { digestInterval: data.digestInterval } : {}),
      ...(data.milestoneAlerts !== undefined ? { milestoneAlerts: data.milestoneAlerts } : {}),
      ...(data.lossThresholdPct !== undefined ? { lossThresholdPct: data.lossThresholdPct } : {}),
      ...(data.lossAlertsEnabled !== undefined
        ? { lossAlertsEnabled: data.lossAlertsEnabled }
        : {}),
      ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
      ...(data.fcmToken !== undefined ? { fcmToken: data.fcmToken } : {}),
      ...(data.whatsappEnabled !== undefined ? { whatsappEnabled: data.whatsappEnabled } : {}),
      ...(data.smsEnabled !== undefined ? { smsEnabled: data.smsEnabled } : {}),
      ...(data.phoneE164 !== undefined ? { phoneE164: data.phoneE164 } : {}),
    },
    update: {
      ...(data.digestInterval !== undefined ? { digestInterval: data.digestInterval } : {}),
      ...(data.milestoneAlerts !== undefined ? { milestoneAlerts: data.milestoneAlerts } : {}),
      ...(data.lossThresholdPct !== undefined ? { lossThresholdPct: data.lossThresholdPct } : {}),
      ...(data.lossAlertsEnabled !== undefined
        ? { lossAlertsEnabled: data.lossAlertsEnabled }
        : {}),
      ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
      ...(data.fcmToken !== undefined ? { fcmToken: data.fcmToken } : {}),
      ...(data.whatsappEnabled !== undefined ? { whatsappEnabled: data.whatsappEnabled } : {}),
      ...(data.smsEnabled !== undefined ? { smsEnabled: data.smsEnabled } : {}),
      ...(data.phoneE164 !== undefined ? { phoneE164: data.phoneE164 } : {}),
    },
  });
  return mapNotificationPrefs(row);
}

export async function clearFcmToken(userId: string): Promise<void> {
  await upsertNotificationPrefs(userId, { fcmToken: null });
}

// ── Learning / observations ─────────────────────────────────────────────────

export async function createTradeLearningLog(input: {
  userId: string;
  symbol: string;
  assetClass: AssetClass;
  side: OrderSide;
  quantity: number;
  price: number;
  realizedPnl?: number | null;
  isWin?: boolean | null;
  technicalSnapshot?: Json | null;
  marketContext?: Json | null;
  source?: MarketDataSource;
  isSimulated?: boolean;
  observationId?: string | null;
}): Promise<TradeLearningData> {
  const row = await prisma.tradeLearningData.create({
    data: {
      userId: input.userId,
      symbol: input.symbol,
      assetClass: input.assetClass,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      realizedPnl: input.realizedPnl ?? null,
      isWin: input.isWin ?? null,
      technicalSnapshot:
        input.technicalSnapshot == null
          ? undefined
          : (input.technicalSnapshot as Prisma.InputJsonValue),
      marketContext:
        input.marketContext == null
          ? undefined
          : (input.marketContext as Prisma.InputJsonValue),
      source: input.source ?? 'SIMULATED',
      isSimulated: input.isSimulated ?? true,
      observationId: input.observationId ?? null,
    },
  });
  return mapTradeLearning(row);
}

export async function countTradeLearning(filters: Record<string, unknown>): Promise<number> {
  return prisma.tradeLearningData.count({
    where: toPrismaWhere(filters) as Prisma.TradeLearningDataWhereInput,
  });
}

export async function findLatestOpenBuyTradeLearning(
  userId: string,
  symbol: string,
): Promise<TradeLearningData | null> {
  const row = await prisma.tradeLearningData.findFirst({
    where: {
      userId,
      symbol,
      side: 'BUY',
      realizedPnl: null,
    },
    orderBy: { createdAt: 'desc' },
  });
  return row ? mapTradeLearning(row) : null;
}

export async function updateTradeLearningLog(
  id: string,
  data: Partial<{ realizedPnl: number | null; isWin: boolean | null }>,
): Promise<TradeLearningData> {
  const row = await prisma.tradeLearningData.update({
    where: { id },
    data: {
      ...(data.realizedPnl !== undefined ? { realizedPnl: data.realizedPnl } : {}),
      ...(data.isWin !== undefined ? { isWin: data.isWin } : {}),
    },
  });
  return mapTradeLearning(row);
}

export async function createMarketObservation(input: {
  symbol: string;
  assetClass: AssetClass;
  price: number;
  changePct24h: number;
  volume: number;
  technicalSnapshot: Json;
  marketContext: Json;
  source: MarketDataSource;
}): Promise<MarketObservation> {
  const row = await prisma.marketObservation.create({
    data: {
      symbol: input.symbol,
      assetClass: input.assetClass,
      price: input.price,
      changePct24h: input.changePct24h,
      volume: input.volume,
      technicalSnapshot: input.technicalSnapshot as Prisma.InputJsonValue,
      marketContext: input.marketContext as Prisma.InputJsonValue,
      source: input.source,
    },
  });
  return mapMarketObservation(row);
}

export async function countMarketObservations(filters?: Record<string, unknown>): Promise<number> {
  return prisma.marketObservation.count({
    where: filters ? (toPrismaWhere(filters) as Prisma.MarketObservationWhereInput) : undefined,
  });
}

export async function latestMarketObservation(
  symbol?: string,
): Promise<MarketObservation | null> {
  const row = await prisma.marketObservation.findFirst({
    where: symbol ? { symbol } : undefined,
    orderBy: { observedAt: 'desc' },
  });
  return row ? mapMarketObservation(row) : null;
}

// ── Health ──────────────────────────────────────────────────────────────────

export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
