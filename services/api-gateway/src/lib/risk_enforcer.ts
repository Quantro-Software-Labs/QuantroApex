import type { AssetClass } from '@prisma/client';
import { prisma } from './prisma.js';

export interface RiskValidationParams {
  userId?: string;
  riskVault: {
    dailyLossLimit: number | { toString(): string };
    dailyLossLimitUnit?: 'PERCENT' | 'USD';
    maxDrawdown: number | { toString(): string };
    maxDrawdownUnit?: 'PERCENT' | 'USD';
    perTradeExposure: number | { toString(): string };
    perTradeExposureUnit?: 'PERCENT' | 'USD';
    emergencyStop?: boolean;
    emergencyStoppedAt?: Date | null;
    assetsEnabled?: boolean;
    stocksEnabled?: boolean;
    cryptoEnabled?: boolean;
    forexEnabled?: boolean;
  } | null;
  globalVault?: {
    dailyLossLimit: number | { toString(): string };
    dailyLossLimitUnit?: 'PERCENT' | 'USD';
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
    | 'EMERGENCY_STOP_ACTIVE'
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
        code: 'EMERGENCY_STOP_ACTIVE',
        reason: 'Global emergency stop is active. All trading is paused.',
      };
    }
    const rawGlobalLimit = Number(globalVault.dailyLossLimit);
    const globalUnit = globalVault.dailyLossLimitUnit ?? 'PERCENT';
    const globalLossLimit =
      globalUnit === 'PERCENT' ? portfolioEquity * rawGlobalLimit : rawGlobalLimit;
    if (globalRealizedLossToday >= globalLossLimit) {
      return {
        allowed: false,
        code: 'GLOBAL_DAILY_LOSS_LIMIT',
        reason: `Global daily loss limit ($${globalLossLimit.toFixed(2)}) has been reached.`,
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
      code: 'EMERGENCY_STOP_ACTIVE',
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

  const rawClassLimit = Number(riskVault.dailyLossLimit);
  const classUnit = riskVault.dailyLossLimitUnit ?? 'PERCENT';
  const classLossLimit =
    classUnit === 'PERCENT' ? portfolioEquity * rawClassLimit : rawClassLimit;
  if (realizedLossToday >= classLossLimit) {
    return {
      allowed: false,
      code: 'CLASS_DAILY_LOSS_LIMIT',
      reason: `Daily loss limit ($${classLossLimit.toFixed(2)}) has been reached for ${cls}.`,
    };
  }

  const rawExposure = Number(riskVault.perTradeExposure);
  const exposureUnit = riskVault.perTradeExposureUnit ?? 'PERCENT';
  const maxAllowedTradeValue =
    exposureUnit === 'PERCENT' ? portfolioEquity * rawExposure : rawExposure;
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

  const rawDrawdown = Number(riskVault.maxDrawdown);
  const drawdownUnit = riskVault.maxDrawdownUnit ?? 'PERCENT';
  let computedDrawdownPct = currentDrawdownPct;
  if (computedDrawdownPct === undefined) {
    if (!peakEquity || peakEquity <= 0) {
      computedDrawdownPct = 0;
    } else if (portfolioEquity < peakEquity) {
      computedDrawdownPct = (peakEquity - portfolioEquity) / peakEquity;
    } else {
      computedDrawdownPct = 0;
    }
  }

  if (drawdownUnit === 'PERCENT') {
    if (computedDrawdownPct !== undefined && computedDrawdownPct >= rawDrawdown) {
      return {
        allowed: false,
        code: 'DRAWDOWN_LIMIT_EXCEEDED',
        reason: `Current drawdown (${(computedDrawdownPct * 100).toFixed(1)}%) exceeds the limit.`,
      };
    }
  } else {
    // USD drawdown
    const effectivePeak = peakEquity && peakEquity > 0 ? peakEquity : portfolioEquity;
    const dollarDrawdown = Math.max(0, effectivePeak - portfolioEquity);
    if (dollarDrawdown >= rawDrawdown) {
      return {
        allowed: false,
        code: 'DRAWDOWN_LIMIT_EXCEEDED',
        reason: `Current drawdown ($${dollarDrawdown.toFixed(2)}) exceeds the dollar limit ($${rawDrawdown.toFixed(2)}).`,
      };
    }
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
