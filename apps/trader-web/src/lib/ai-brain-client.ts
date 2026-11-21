/**
 * Quantro Global Brain AI Client
 * Connects Trader Web directly to services/ai-service (port 8001) for SMC Overlays
 * and services/data-pipeline (port 8002) for Global Brain V2 Model Predictions.
 */

const AI_SERVICE_BASE = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? 'http://localhost:8001';
const DATA_PIPELINE_BASE = process.env.NEXT_PUBLIC_DATA_SERVICE_URL ?? 'http://localhost:8002';

export interface SMCStructure {
  type: 'BOS' | 'CHoCH';
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  time: string;
}

export interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  mitigated: boolean;
  time: string;
}

export interface FairValueGap {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  filled: boolean;
  time: string;
}

export interface SMCAnalysisResponse {
  symbol: string;
  asset_class: string;
  timeframe: string;
  current_price: number;
  indicators_mode: 'normal' | 'degraded';
  smc: {
    structures: SMCStructure[];
    order_blocks: OrderBlock[];
    fvg: FairValueGap[];
    liquidity_pools: { type: 'EQUAL_HIGHS' | 'EQUAL_LOWS'; level: number }[];
    pd_zone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  };
  indicators: {
    rsi: number;
    macd: { macd: number; signal: number; hist: number };
    ema: { ema20: number; ema50: number; ema200: number };
  };
  ai_signal: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    suggested_entry: number;
    stop_loss: number;
    take_profit: number;
    recommended_strategy: string;
  };
}

export interface GlobalBrainStats {
  status: string;
  service: string;
  ohlcv_count: number;
  labelled_samples: number;
  inference_gate: number;
  paper_universe_size: number;
}

export interface AISignalCardData {
  id: string;
  symbol: string;
  assetClass: 'STOCKS' | 'CRYPTO' | 'FOREX';
  bias: 'BUY' | 'SELL';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  timeframe: string;
  strategyName: string;
  smcInsight: string;
  timestamp: string;
}

export const aiBrainApi = {
  /** Fetch SMC analysis from ai-service (port 8001) */
  getSMCAnalysis: async (
    assetClass = 'stocks',
    symbol = 'AAPL',
    timeframe = '1h',
  ): Promise<SMCAnalysisResponse | null> => {
    try {
      const res = await fetch(
        `${AI_SERVICE_BASE}/analysis/${assetClass.toLowerCase()}/${symbol.toUpperCase()}/${timeframe}`,
      );
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Service unreachable
    }
    return null;
  },

  /** Fetch Global Brain pipeline stats from data-pipeline (port 8002) */
  getBrainStats: async (): Promise<GlobalBrainStats | null> => {
    try {
      const res = await fetch(`${DATA_PIPELINE_BASE}/health`);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Service unreachable
    }
    return null;
  },

  /**
   * Fetch curated Global Brain AI Signals.
   * If real model inference is not actively producing a signal, returns an honest empty list.
   * No fake signals or invented confidence numbers are returned.
   */
  getAdvisorySignals: async (): Promise<AISignalCardData[]> => {
    try {
      const res = await fetch(`${AI_SERVICE_BASE}/signals/active`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.signals ?? []);
      }
    } catch {
      // Offline or not producing signals
    }
    return [];
  },
};
