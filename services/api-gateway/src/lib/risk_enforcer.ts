import type { AssetClass } from '@prisma/client';
import { prisma } from './prisma.js';

export interface RiskValidationParams {
  userId?: string;
  riskVault: {
    dailyLossLimit: number | { toString(): string };
    maxDrawdown: number | { toString(): string };
    perTradeExposure: number | { toString(): string };
    emergencyStop?: boolean;
    emergencyStoppedAt?: Date | null;
    assetsEnabled?: boolean;
    stocksEnabled?: boolean;
    cryptoEnabled?: boolean;
    forexEnabled?: boolean;
  } | null;
  globalVault?: {
    dailyLossLimit: number | { toString(): string };
    emergencyStop?: boolean;
    emergencyStoppedAt?: Date | null;
  } | null;
  portfolioEquity: number;
  tradeValue: number;
  assetClass: AssetClass | string;
  realizedLossToday?: number;
  globalRealizedLossToday?: number;
  peakEquity?: number;
  currentDrawdownPct?: number;
}

export interface RiskValidationResult {
  allowed: boolean;
  code?:
    | 'NO_RISK_VAULT'
    | 'EMERGENCY_STOPPED'
    | 'GLOBAL_EMERGENCY_STOP'
    | 'CLASS_EMERGENCY_STOP'
    | 'DAILY_LOSS_LIMIT_REACHED'
    | 'GLOBAL_DAILY_LOSS_LIMIT'
    | 'CLASS_DAILY_LOSS_LIMIT'
    | 'EXPOSURE_LIMIT_EXCEEDED'
    | 'ASSET_CLASS_DISABLED'
    | 'DRAWDOWN_LIMIT_EXCEEDED'
    | 'KYC_REQUIRED';
  reason?: string;
}

/**
 * Enforce GLOBAL vault first, then class-specific vault.
 */
export function validateTradeRisk(params: RiskValidationParams): RiskValidationResult {
  const {
    riskVault,
    globalVault,
    portfolioEquity,
    tradeValue,
    assetClass,
    realizedLossToday = 0,
    globalRealizedLossToday = 0,
    peakEquity,
    currentDrawdownPct,
  } = params;

  const cls = String(assetClass).toUpperCase();

  if (globalVault) {
    if (globalVault.emergencyStop || globalVault.emergencyStoppedAt) {
      return {
        allowed: false,
        code: 'GLOBAL_EMERGENCY_STOP',
        reason: 'Global emergency stop is active. All trading is paused.',
      };
    }
    const globalLimit = Number(globalVault.dailyLossLimit);
    if (globalRealizedLossToday >= globalLimit) {
      return {
        allowed: false,
        code: 'GLOBAL_DAILY_LOSS_LIMIT',
        reason: `Global daily loss limit ($${globalLimit.toFixed(2)}) has been reached.`,
      };
    }
  }

  if (!riskVault) {
    return {
      allowed: false,
      code: 'NO_RISK_VAULT',
      reason: 'Risk Vault has not been initialized for this account.',
    };
  }

  if (riskVault.emergencyStop || riskVault.emergencyStoppedAt) {
    return {
      allowed: false,
      code: 'CLASS_EMERGENCY_STOP',
      reason: `${cls} trading is currently halted via Emergency Stop.`,
    };
  }

  if (riskVault.assetsEnabled === false) {
    return {
      allowed: false,
      code: 'ASSET_CLASS_DISABLED',
      reason: `${cls} trading is disabled in your Risk Vault settings.`,
    };
  }

  const dailyLossLimit = Number(riskVault.dailyLossLimit);
  if (realizedLossToday >= dailyLossLimit) {
    return {
      allowed: false,
      code: 'CLASS_DAILY_LOSS_LIMIT',
      reason: `Daily loss limit ($${dailyLossLimit.toFixed(2)}) has been reached for ${cls}.`,
    };
  }

  const maxExposurePct = Number(riskVault.perTradeExposure);
  const maxAllowedTradeValue = portfolioEquity * maxExposurePct;
  if (tradeValue > maxAllowedTradeValue) {
    return {
      allowed: false,
      code: 'EXPOSURE_LIMIT_EXCEEDED',
      reason: `Trade value ($${tradeValue.toFixed(2)}) exceeds maximum per-trade exposure ($${maxAllowedTradeValue.toFixed(2)}).`,
    };
  }

  // Legacy boolean flags (kept for older clients)
  if (cls === 'STOCKS' && riskVault.stocksEnabled === false) {
    return { allowed: false, code: 'ASSET_CLASS_DISABLED', reason: 'Stocks trading is disabled.' };
  }
  if (cls === 'CRYPTO' && riskVault.cryptoEnabled === false) {
    return {
      allowed: false,
      code: 'ASSET_CLASS_DISABLED',
      reason: 'Cryptocurrency trading is disabled.',
    };
  }
  if (cls === 'FOREX' && riskVault.forexEnabled === false) {
    return { allowed: false, code: 'ASSET_CLASS_DISABLED', reason: 'Forex trading is disabled.' };
  }

  const maxDrawdown = Number(riskVault.maxDrawdown);
  let computedDrawdownPct = currentDrawdownPct ?? 0;
  if (currentDrawdownPct === undefined && peakEquity !== undefined && peakEquity > 0) {
    if (portfolioEquity < peakEquity) {
      computedDrawdownPct = (peakEquity - portfolioEquity) / peakEquity;
    }
  }
  if (computedDrawdownPct >= maxDrawdown) {
    return {
      allowed: false,
      code: 'DRAWDOWN_LIMIT_EXCEEDED',
      reason: `Current drawdown (${(computedDrawdownPct * 100).toFixed(1)}%) exceeds the limit.`,
    };
  }

  return { allowed: true };
}

export async function enforceRisk(
  userId: string,
  assetClass: AssetClass | string,
  tradeValue: number,
  portfolioEquity: number,
): Promise<RiskValidationResult> {
  const cls = String(assetClass).toUpperCase() as AssetClass;
  const [globalVault, classVault] = await Promise.all([
    prisma.riskVault.findUnique({
      where: { userId_assetClass: { userId, assetClass: 'GLOBAL' } },
    }),
    prisma.riskVault.findUnique({
      where: { userId_assetClass: { userId, assetClass: cls } },
    }),
  ]);

  return validateTradeRisk({
    userId,
    globalVault,
    riskVault: classVault,
    portfolioEquity,
    tradeValue,
    assetClass: cls,
  });
}
