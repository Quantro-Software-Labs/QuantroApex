import { RiskVault, AssetClass } from '@prisma/client';

export interface RiskValidationParams {
  riskVault: RiskVault | null;
  portfolioEquity: number;
  tradeValue: number;
  assetClass: AssetClass;
  realizedLossToday?: number;
}

export interface RiskValidationResult {
  allowed: boolean;
  code?: 'NO_RISK_VAULT' | 'EMERGENCY_STOPPED' | 'ASSET_CLASS_DISABLED' | 'EXPOSURE_LIMIT_EXCEEDED' | 'DAILY_LOSS_LIMIT_REACHED';
  reason?: string;
}

export function validateTradeRisk(params: RiskValidationParams): RiskValidationResult {
  const { riskVault, portfolioEquity, tradeValue, assetClass, realizedLossToday = 0 } = params;

  if (!riskVault) {
    return {
      allowed: false,
      code: 'NO_RISK_VAULT',
      reason: 'Risk Vault has not been initialized for this account.',
    };
  }

  // 1. Emergency Stop Check
  if (riskVault.emergencyStoppedAt !== null) {
    return {
      allowed: false,
      code: 'EMERGENCY_STOPPED',
      reason: 'Trading is currently halted via Emergency Stop.',
    };
  }

  // 2. Permitted Asset Class Check
  if (assetClass === 'STOCKS' && !riskVault.stocksEnabled) {
    return {
      allowed: false,
      code: 'ASSET_CLASS_DISABLED',
      reason: 'Stocks trading is disabled in your Risk Vault settings.',
    };
  }
  if (assetClass === 'CRYPTO' && !riskVault.cryptoEnabled) {
    return {
      allowed: false,
      code: 'ASSET_CLASS_DISABLED',
      reason: 'Cryptocurrency trading is disabled in your Risk Vault settings.',
    };
  }
  if (assetClass === 'FOREX' && !riskVault.forexEnabled) {
    return {
      allowed: false,
      code: 'ASSET_CLASS_DISABLED',
      reason: 'Forex trading is disabled in your Risk Vault settings.',
    };
  }

  // 3. Per-Trade Exposure Check
  const maxExposurePct = Number(riskVault.perTradeExposure);
  const maxAllowedTradeValue = portfolioEquity * maxExposurePct;

  if (tradeValue > maxAllowedTradeValue) {
    return {
      allowed: false,
      code: 'EXPOSURE_LIMIT_EXCEEDED',
      reason: `Trade value ($${tradeValue.toFixed(2)}) exceeds maximum per-trade exposure limit ($${maxAllowedTradeValue.toFixed(2)}).`,
    };
  }

  // 4. Daily Loss Limit Check
  const dailyLossLimit = Number(riskVault.dailyLossLimit);
  if (realizedLossToday >= dailyLossLimit) {
    return {
      allowed: false,
      code: 'DAILY_LOSS_LIMIT_REACHED',
      reason: `Daily loss limit ($${dailyLossLimit.toFixed(2)}) has been reached.`,
    };
  }

  return { allowed: true };
}
