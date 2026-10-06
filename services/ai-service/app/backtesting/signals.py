"""Strategy signal generators for VectorBT / fallback backtests."""

from __future__ import annotations

from typing import Any, Literal

import numpy as np
import pandas as pd

StrategyId = Literal["sma_crossover", "rsi", "buy_hold"]


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def generate_signals(
    strategy_id: StrategyId | str,
    df: pd.DataFrame,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build entry/exit boolean series (and optional SL/TP) for a strategy.

    Returns a dict compatible with ``BacktestRunner.run`` /
    ``vbt.Portfolio.from_signals``.
    """
    params = params or {}
    if "close" not in df.columns:
        raise ValueError("OHLCV frame must include a close column")
    close = pd.to_numeric(df["close"], errors="coerce")
    if close.isna().any():
        raise ValueError("close values must be numeric")

    entries, exits = build_entries_exits(close, strategy_id, params)
    out: dict[str, Any] = {
        "entries": entries,
        "exits": exits,
        "strategy_id": strategy_id,
        "params": params,
    }
    if "stop_loss" in params:
        out["stop_loss"] = float(params["stop_loss"])
    if "take_profit" in params:
        out["take_profit"] = float(params["take_profit"])
    return out


def build_entries_exits(
    close: pd.Series,
    strategy_type: StrategyId | str,
    params: dict[str, Any],
) -> tuple[pd.Series, pd.Series]:
    """Return (entries, exits) boolean Series aligned to ``close``."""
    if strategy_type == "buy_hold":
        entries = pd.Series(False, index=close.index)
        exits = pd.Series(False, index=close.index)
        if len(close) > 0:
            entries.iloc[0] = True
        return entries, exits

    if strategy_type == "sma_crossover":
        fast = int(params.get("fast", 10))
        slow = int(params.get("slow", 30))
        if fast >= slow:
            raise ValueError("sma_crossover requires fast < slow")
        sma_fast = close.rolling(fast).mean()
        sma_slow = close.rolling(slow).mean()
        entries = (sma_fast > sma_slow) & (sma_fast.shift(1) <= sma_slow.shift(1))
        exits = (sma_fast < sma_slow) & (sma_fast.shift(1) >= sma_slow.shift(1))
        return entries.fillna(False), exits.fillna(False)

    if strategy_type == "rsi":
        period = int(params.get("period", 14))
        lower = float(params.get("lower", 30))
        upper = float(params.get("upper", 70))
        rsi = _rsi(close, period)
        entries = (rsi < lower) & (rsi.shift(1) >= lower)
        exits = (rsi > upper) & (rsi.shift(1) <= upper)
        return entries.fillna(False), exits.fillna(False)

    raise ValueError(f"Unknown strategy type: {strategy_type}")
