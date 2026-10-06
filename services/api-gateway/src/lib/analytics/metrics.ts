/**
 * Pure portfolio metric helpers — unit-tested for Sprint 10 financial audit.
 */

export interface TradePnlLike {
  realizedPnl?: number | null;
}

export interface PortfolioMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  closedTrades: number;
  winRate: number;
  profitFactor: number;
  totalRealizedPnl: number;
  grossProfit: number;
  grossLoss: number;
}

/**
 * Win rate = wins / closed trades (pnl ≠ 0). Breakevens excluded from denominator.
 * Profit factor = grossProfit / grossLoss; if no losses but profits exist, returns grossProfit
 * (finite stand-in — never Infinity for JSON). If no closed PnL, 0.
 */
export function computeTradeMetrics(trades: TradePnlLike[]): PortfolioMetrics {
  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalRealizedPnl = 0;

  for (const t of trades) {
    const pnl = Number(t.realizedPnl ?? 0);
    totalRealizedPnl += pnl;
    if (pnl > 0) {
      winningTrades += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losingTrades += 1;
      grossLoss += Math.abs(pnl);
    }
  }

  const closedTrades = winningTrades + losingTrades;
  const winRate = closedTrades > 0 ? winningTrades / closedTrades : 0;
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0;

  return {
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    closedTrades,
    winRate,
    profitFactor,
    totalRealizedPnl,
    grossProfit,
    grossLoss,
  };
}

/**
 * Build equity curve points from chronological realized PnL deltas.
 */
export function buildEquityCurve(
  startingEquity: number,
  pnlsChronological: number[],
): { tradeIndex: number; equity: number }[] {
  let current = startingEquity;
  return pnlsChronological.map((pnl, i) => {
    current += pnl;
    return { tradeIndex: i + 1, equity: parseFloat(current.toFixed(2)) };
  });
}
