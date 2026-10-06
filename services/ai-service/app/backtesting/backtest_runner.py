"""VectorBT backtesting wrapper for simple strategies."""

from __future__ import annotations

import logging
from typing import Any, Literal

import numpy as np
import pandas as pd

from app.backtesting.signals import StrategyId, build_entries_exits, generate_signals

logger = logging.getLogger(__name__)

VECTORBT_AVAILABLE = False
_vbt: Any = None

try:
    import vectorbt as _vbt  # type: ignore[no-redef]

    VECTORBT_AVAILABLE = True
except Exception as exc:  # ImportError or runtime incompat (e.g. plotly)
    logger.warning(
        "vectorbt not available (%s). Backtests will use a minimal pandas fallback.",
        exc,
    )


def _to_close_series(candles: list[dict[str, Any]]) -> pd.Series:
    if not candles:
        raise ValueError("candles must be non-empty")
    df = pd.DataFrame(candles)
    if "close" not in df.columns:
        raise ValueError("Missing required candle field: close")
    close = pd.to_numeric(df["close"], errors="coerce")
    if close.isna().any():
        raise ValueError("close values must be numeric")
    if "timestamp" in df.columns and df["timestamp"].notna().any():
        idx = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
        if idx.notna().all():
            close.index = idx
            return close
    close.index = pd.RangeIndex(len(close))
    return close


def _fallback_backtest(
    close: pd.Series,
    entries: pd.Series,
    exits: pd.Series,
    initial_cash: float,
) -> dict[str, Any]:
    """Minimal long-only simulator when vectorbt is missing."""
    cash = float(initial_cash)
    position = 0.0
    equity: list[float] = []
    trades = 0
    wins = 0
    entry_price: float | None = None

    for i, price in enumerate(close.to_numpy(dtype=np.float64)):
        if position == 0 and bool(entries.iloc[i]) and price > 0:
            position = cash / price
            cash = 0.0
            entry_price = float(price)
            trades += 1
        elif position > 0 and bool(exits.iloc[i]):
            cash = position * price
            if entry_price is not None and price > entry_price:
                wins += 1
            position = 0.0
            entry_price = None
        equity.append(cash + position * price)

    if position > 0:
        cash = position * close.iloc[-1]
        if entry_price is not None and float(close.iloc[-1]) > entry_price:
            wins += 1
        position = 0.0

    eq = np.asarray(equity, dtype=np.float64)
    if len(eq) == 0:
        eq = np.array([initial_cash], dtype=np.float64)

    total_return = float(eq[-1] / initial_cash - 1.0)
    rets = np.diff(eq) / np.maximum(eq[:-1], 1e-12)
    sharpe = 0.0
    if len(rets) > 1 and np.std(rets) > 0:
        sharpe = float(np.mean(rets) / np.std(rets) * np.sqrt(252))

    peak = np.maximum.accumulate(eq)
    dd = (eq - peak) / np.maximum(peak, 1e-12)
    max_dd = float(dd.min()) if len(dd) else 0.0
    win_rate = float(wins / trades) if trades else 0.0

    sample = _sample_equity(eq, close.index)
    return {
        "total_return": total_return,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
        "win_rate": win_rate,
        "trades": trades,
        "equity_curve": sample,
        "final_value": float(eq[-1]),
        "engine": "fallback",
    }


def _sample_equity(eq: np.ndarray, index: pd.Index, max_points: int = 200) -> list[dict[str, Any]]:
    n = len(eq)
    if n == 0:
        return []
    step = max(1, n // max_points)
    points: list[dict[str, Any]] = []
    for i in range(0, n, step):
        ts: Any = index[i]
        if hasattr(ts, "isoformat"):
            t_val: Any = ts.isoformat()
        else:
            t_val = int(i) if not isinstance(ts, (int, float, str)) else ts
        points.append({"t": t_val, "equity": float(eq[i])})
    if points and (n - 1) % step != 0:
        ts = index[n - 1]
        t_val = (
            ts.isoformat()
            if hasattr(ts, "isoformat")
            else (int(n - 1) if not isinstance(ts, (int, float, str)) else ts)
        )
        points.append({"t": t_val, "equity": float(eq[-1])})
    return points


def run_backtest(
    candles: list[dict[str, Any]],
    strategy_type: StrategyId | str,
    params: dict[str, Any] | None = None,
    initial_cash: float = 10_000.0,
) -> dict[str, Any]:
    """
    Run a VectorBT (or fallback) backtest.

    Strategies: sma_crossover, rsi, buy_hold.
    """
    if initial_cash <= 0:
        raise ValueError("initial_cash must be positive")

    params = params or {}
    close = _to_close_series(candles)
    df = pd.DataFrame({"close": close})
    signals = generate_signals(strategy_type, df, params)
    entries = signals["entries"]
    exits = signals["exits"]

    runner = BacktestRunner()
    result = runner.run(
        df,
        signals,
        initial_cash=initial_cash,
        fees=float(params.get("fees", 0.0)),
        freq=str(params.get("freq", "1D")),
    )
    result["strategy"] = {"type": strategy_type, "params": params}
    # Keep response schema used by FastAPI (sharpe / trades aliases)
    if "sharpe" not in result and "sharpe_ratio" in result:
        result["sharpe"] = result["sharpe_ratio"] or 0.0
    if "trades" not in result and "total_trades" in result:
        result["trades"] = result["total_trades"]
    return result


class BacktestRunner:
    """Facade matching the product-brief VectorBT runner surface."""

    def run(
        self,
        ohlcv: pd.DataFrame,
        strategy_signals: dict[str, Any],
        initial_cash: float = 10_000.0,
        fees: float = 0.0,
        freq: str = "1D",
    ) -> dict[str, Any]:
        if "close" not in ohlcv.columns:
            raise ValueError("ohlcv must include close")
        price = pd.to_numeric(ohlcv["close"], errors="coerce")
        if price.isna().any():
            raise ValueError("close values must be numeric")

        entries = pd.Series(strategy_signals["entries"], index=ohlcv.index).fillna(False)
        exits = pd.Series(strategy_signals["exits"], index=ohlcv.index).fillna(False)

        if not VECTORBT_AVAILABLE:
            result = _fallback_backtest(price, entries, exits, initial_cash)
            result["warning"] = "vectorbt not installed — using minimal pandas fallback"
            result["sharpe_ratio"] = result["sharpe"]
            result["total_trades"] = result["trades"]
            return result

        assert _vbt is not None
        kwargs: dict[str, Any] = {
            "init_cash": initial_cash,
            "fees": fees,
            "freq": freq,
        }
        if strategy_signals.get("stop_loss") is not None:
            kwargs["sl_stop"] = strategy_signals["stop_loss"]
        if strategy_signals.get("take_profit") is not None:
            kwargs["tp_stop"] = strategy_signals["take_profit"]

        pf = _vbt.Portfolio.from_signals(price, entries=entries, exits=exits, **kwargs)

        total_return = float(pf.total_return())
        try:
            sharpe = float(pf.sharpe_ratio())
            if np.isnan(sharpe):
                sharpe = 0.0
        except Exception:  # noqa: BLE001
            sharpe = 0.0

        try:
            max_dd = float(pf.max_drawdown())
            if np.isnan(max_dd):
                max_dd = 0.0
        except Exception:  # noqa: BLE001
            max_dd = 0.0

        try:
            trades_obj = pf.trades
            trades_count = int(trades_obj.count())
            try:
                win_rate = float(trades_obj.win_rate())
                if np.isnan(win_rate):
                    win_rate = 0.0
            except Exception:  # noqa: BLE001
                win_rate = 0.0
        except Exception:  # noqa: BLE001
            trades_count = 0
            win_rate = 0.0

        equity = pf.value()
        eq_arr = equity.to_numpy(dtype=np.float64)
        sample = _sample_equity(eq_arr, equity.index)

        return {
            "total_return": total_return,
            "sharpe": sharpe,
            "sharpe_ratio": sharpe,
            "max_drawdown": max_dd,
            "win_rate": win_rate,
            "trades": trades_count,
            "total_trades": trades_count,
            "equity_curve": sample,
            "final_value": float(eq_arr[-1]) if len(eq_arr) else float(initial_cash),
            "engine": "vectorbt",
        }


# Re-export for callers that previously imported signal helpers from here
__all__ = [
    "VECTORBT_AVAILABLE",
    "BacktestRunner",
    "run_backtest",
    "build_entries_exits",
    "generate_signals",
    "StrategyId",
]
