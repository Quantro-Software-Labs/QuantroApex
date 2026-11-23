"""
Honest metrics computation, Daily Sharpe, Block Bootstrap, and Pre-registered Success Bar.

Key requirements:
1. Sharpe computed strictly from DAILY returns of the strategy's equity curve
   (days with no position count as 0.0 return), annualised with sqrt(365) for crypto
   and sqrt(252) for stocks. Never from per-trade returns.
2. Any fold with fewer than 30 trades reports Sharpe as null with reason INSUFFICIENT_TRADES.
   It still counts in the pooled results.
3. Pre-registered Success Bar:
   EDGE_SUPPORTED only if:
     - at least 300 trades pooled
     - Sharpe above BOTH buy-and-hold and rule-only
     - bootstrap 90% lower bound of (model Sharpe - buy-and-hold Sharpe) > 0
       (block bootstrap on daily returns, block length 20 days)
     - at least 60% of folds with positive after-cost return
     - max drawdown better than -35%
   INSUFFICIENT_DATA if fewer than 300 trades.
   Otherwise NO_EVIDENCE_OF_EDGE.
4. Report positive folds as 'k of N'.
5. Holdout locked (final 6 months): raises PermissionError unless allow_holdout=True,
   and logs access to holdout_access.log.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from loguru import logger

from config import MLSuccessBar, get_settings


def compute_daily_equity_curve(
    trade_returns_by_date: dict[datetime, list[float]],
    start_date: datetime,
    end_date: datetime,
    initial_equity: float = 1.0,
) -> tuple[list[datetime], np.ndarray, np.ndarray]:
    """
    Construct daily returns and equity curve across all calendar days in [start_date, end_date].
    Calendar days with no closed positions receive exactly 0.0 return.
    When multiple trades close on day d, daily return is compound return: prod(1 + r_i) - 1.
    """
    def to_midnight(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return datetime(dt.year, dt.month, dt.day, 0, 0, 0, tzinfo=timezone.utc)

    cur = to_midnight(start_date)
    end = to_midnight(end_date)
    if cur > end:
        return [], np.array([], dtype=np.float64), np.array([], dtype=np.float64)

    daily_trade_map: dict[datetime, list[float]] = {}
    for dt, rets in trade_returns_by_date.items():
        m_dt = to_midnight(dt)
        daily_trade_map.setdefault(m_dt, []).extend(rets)

    dates: list[datetime] = []
    daily_rets: list[float] = []
    equity: list[float] = []
    current_eq = initial_equity

    while cur <= end:
        dates.append(cur)
        day_rets = daily_trade_map.get(cur, [])
        if not day_rets:
            day_r = 0.0
        else:
            comp = 1.0
            for r in day_rets:
                comp *= (1.0 + float(r))
            day_r = comp - 1.0

        daily_rets.append(day_r)
        current_eq *= (1.0 + day_r)
        equity.append(current_eq)
        cur = cur + pd.Timedelta(days=1).to_pytimedelta()

    return dates, np.array(daily_rets, dtype=np.float64), np.array(equity, dtype=np.float64)


def simulate_portfolio_mark_to_market(
    trades: list[dict[str, Any]],
    daily_closes_by_symbol: dict[str, dict[datetime, float]],
    start_date: datetime,
    end_date: datetime,
    max_concurrent_positions: int = 10,
    position_size_frac: float = 0.10,
    fee_per_side: float = 0.0040,
    initial_equity: float = 1000.0,
    test_mode: bool | None = None,
) -> tuple[list[datetime], np.ndarray, np.ndarray, int, int]:
    """
    Simulate a portfolio of up to max_concurrent_positions (default 10),
    each taking a fixed position_size_frac (default 10%) of current equity at entry.
    Marks open positions to daily close (UTC) every day for honest comparison with buy-and-hold.
    Signals arriving when all slots are full are skipped.
    Returns: (dates, daily_returns, equity_curve, skipped_signals_count)
    """
    def to_midnight(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return datetime(dt.year, dt.month, dt.day, 0, 0, 0, tzinfo=timezone.utc)

    cur = to_midnight(start_date)
    end = to_midnight(end_date)
    if cur > end:
        return [], np.array([], dtype=np.float64), np.array([], dtype=np.float64), 0

    # Sort candidate trades chronologically by entry_time
    def _parse_t(val: Any) -> datetime:
        if val is None:
            return datetime.fromtimestamp(0, tz=timezone.utc)
        if isinstance(val, str):
            val = datetime.fromisoformat(val.replace("Z", "+00:00"))
        if hasattr(val, "tzinfo"):
            if val.tzinfo is None:
                val = val.replace(tzinfo=timezone.utc)
            return val.astimezone(timezone.utc)
        return datetime.fromtimestamp(0, tz=timezone.utc)

    sorted_trades = sorted(
        trades, key=lambda x: _parse_t(x.get("entry_time") or x.get("timestamp"))
    )

    cash = float(initial_equity)
    prev_equity = float(initial_equity)
    active_positions: list[dict[str, Any]] = []
    skipped_signals = 0
    rejected_invalid_trades = 0

    dates: list[datetime] = []
    daily_rets: list[float] = []
    equity_curve: list[float] = []

    trade_ptr = 0
    n_trades = len(sorted_trades)

    while cur <= end:
        day_start = cur
        day_end = cur + pd.Timedelta(days=1).to_pytimedelta()

        # 1. Exit positions that closed on or before day_end
        remaining_positions: list[dict[str, Any]] = []
        for p in active_positions:
            exit_t = p["exit_time"]
            if exit_t < day_end:
                proceeds = p["shares"] * p["exit_price"] * (1.0 - fee_per_side)
                cash += proceeds
            else:
                remaining_positions.append(p)
        active_positions = remaining_positions

        # 2. Process trade entries on day d (between day_start and day_end)
        while trade_ptr < n_trades:
            t_cand = sorted_trades[trade_ptr]
            e_time = _parse_t(t_cand["entry_time"])
            if e_time >= day_end:
                break
            trade_ptr += 1

            # Long-only MVP with no shorting: bearish setups and non-BUY directions must never enter
            is_invalid = False
            invalid_reason = ""
            if str(t_cand.get("direction", "BUY")).upper() != "BUY":
                is_invalid = True
                invalid_reason = f"non-BUY direction: {t_cand.get('direction')}"
            else:
                feats = t_cand.get("features", {}) or {}
                if str(feats.get("smc_structure", "")).upper() == "BEARISH":
                    is_invalid = True
                    invalid_reason = "bearish smc_structure"
                else:
                    obs = feats.get("order_blocks", [])
                    if obs and any(isinstance(ob, dict) and ob.get("type") == "BEARISH_OB" for ob in obs):
                        is_invalid = True
                        invalid_reason = "bearish order block present"

            if is_invalid:
                is_test_mode = (
                    test_mode
                    if test_mode is not None
                    else (
                        "pytest" in sys.modules
                        or os.environ.get("PYTEST_CURRENT_TEST") is not None
                        or os.environ.get("NODE_ENV") == "test"
                    )
                )
                if is_test_mode:
                    raise ValueError(
                        f"Invalid trade detected in simulate_portfolio_mark_to_market ({invalid_reason}): {t_cand}"
                    )
                rejected_invalid_trades += 1
                continue

            if len(active_positions) >= max_concurrent_positions:
                skipped_signals += 1
                continue

            slot_capital = prev_equity * position_size_frac
            actual_capital = min(cash, slot_capital)
            if actual_capital <= 0:
                skipped_signals += 1
                continue

            entry_px = float(t_cand.get("entry_price") or t_cand.get("entry_fill_price") or 100.0)
            exit_px = float(t_cand.get("exit_price") or t_cand.get("exit_fill_price") or entry_px)
            exit_t = _parse_t(t_cand.get("exit_time") or t_cand.get("timestamp"))

            shares = (actual_capital * (1.0 - fee_per_side)) / entry_px
            cash -= actual_capital

            active_positions.append({
                "symbol": t_cand.get("symbol", "UNKNOWN"),
                "shares": shares,
                "entry_price": entry_px,
                "exit_price": exit_px,
                "entry_time": e_time,
                "exit_time": exit_t,
            })

        # 3. Mark remaining open positions to day close
        marked_position_val = 0.0
        for p in active_positions:
            sym = p["symbol"]
            sym_closes = daily_closes_by_symbol.get(sym, {})
            # Use day's close if available, else entry price
            close_px = sym_closes.get(cur, p["entry_price"])
            marked_position_val += p["shares"] * close_px

        day_equity = cash + marked_position_val
        day_ret = (day_equity - prev_equity) / prev_equity if prev_equity > 0 else 0.0

        dates.append(cur)
        daily_rets.append(day_ret)
        equity_curve.append(day_equity)

        prev_equity = day_equity
        cur = day_end

    return (
        dates,
        np.array(daily_rets, dtype=np.float64),
        np.array(equity_curve, dtype=np.float64),
        skipped_signals,
        rejected_invalid_trades,
    )


def compute_buy_and_hold_basket(
    daily_closes_by_symbol: dict[str, dict[datetime, float]],
    start_date: datetime,
    end_date: datetime,
    fee_per_side: float = 0.0040,
    initial_equity: float = 1.0,
) -> tuple[list[datetime], np.ndarray, np.ndarray]:
    """
    Equal-weight buy-and-hold basket of available symbols among BTC, ETH, SOL, BNB, XRP,
    rebalanced monthly (1st of each month) with transaction fees deducted on turnover.
    Each coin joins at its listing date.
    """
    def to_midnight(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return datetime(dt.year, dt.month, dt.day, 0, 0, 0, tzinfo=timezone.utc)

    cur = to_midnight(start_date)
    end = to_midnight(end_date)
    if cur > end or not daily_closes_by_symbol:
        return [], np.array([], dtype=np.float64), np.array([], dtype=np.float64)

    dates: list[datetime] = []
    daily_rets: list[float] = []
    equity_curve: list[float] = []

    current_equity = float(initial_equity)
    prev_equity = float(initial_equity)
    prev_month = -1

    weights: dict[str, float] = {}

    while cur <= end:
        dates.append(cur)
        available_syms = [
            s for s, c_map in daily_closes_by_symbol.items()
            if cur in c_map and c_map[cur] > 0
        ]

        if not available_syms:
            daily_rets.append(0.0)
            equity_curve.append(current_equity)
            cur = cur + pd.Timedelta(days=1).to_pytimedelta()
            continue

        # Monthly rebalance on 1st of month or first day
        is_first_day_of_month = cur.day == 1 or prev_month != cur.month
        if is_first_day_of_month:
            target_w = 1.0 / len(available_syms)
            turnover = sum(abs(weights.get(s, 0.0) - target_w) for s in available_syms)
            rebalance_cost = turnover * fee_per_side * current_equity
            current_equity -= rebalance_cost
            weights = {s: target_w for s in available_syms}
            prev_month = cur.month

        # Compute basket return for day d
        day_ret = 0.0
        prev_day = cur - pd.Timedelta(days=1).to_pytimedelta()
        for s in available_syms:
            w = weights.get(s, 0.0)
            c_today = daily_closes_by_symbol[s][cur]
            c_prev = daily_closes_by_symbol[s].get(prev_day, c_today)
            asset_ret = (c_today - c_prev) / c_prev if c_prev > 0 else 0.0
            day_ret += w * asset_ret

        current_equity *= (1.0 + day_ret)
        period_ret = (current_equity - prev_equity) / prev_equity if prev_equity > 0 else 0.0

        daily_rets.append(period_ret)
        equity_curve.append(current_equity)
        prev_equity = current_equity
        cur = cur + pd.Timedelta(days=1).to_pytimedelta()

    return dates, np.array(daily_rets, dtype=np.float64), np.array(equity_curve, dtype=np.float64)


def compute_btc_only_buy_and_hold(
    btc_daily_closes: dict[datetime, float],
    start_date: datetime,
    end_date: datetime,
    initial_equity: float = 1.0,
) -> tuple[list[datetime], np.ndarray, np.ndarray]:
    """BTC-only Buy-and-Hold benchmark for reference."""
    def to_midnight(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return datetime(dt.year, dt.month, dt.day, 0, 0, 0, tzinfo=timezone.utc)

    cur = to_midnight(start_date)
    end = to_midnight(end_date)
    dates: list[datetime] = []
    daily_rets: list[float] = []
    equity_curve: list[float] = []
    eq = float(initial_equity)
    prev_eq = float(initial_equity)

    while cur <= end:
        dates.append(cur)
        prev_day = cur - pd.Timedelta(days=1).to_pytimedelta()
        c_today = btc_daily_closes.get(cur)
        c_prev = btc_daily_closes.get(prev_day, c_today)

        if c_today and c_prev and c_prev > 0:
            ret = (c_today - c_prev) / c_prev
        else:
            ret = 0.0

        eq *= (1.0 + ret)
        daily_rets.append((eq - prev_eq) / prev_eq if prev_eq > 0 else 0.0)
        equity_curve.append(eq)
        prev_eq = eq
        cur = cur + pd.Timedelta(days=1).to_pytimedelta()

    return dates, np.array(daily_rets, dtype=np.float64), np.array(equity_curve, dtype=np.float64)


def compute_daily_sharpe(
    daily_returns: np.ndarray | list[float],
    annualization_factor: float = 365.0,
) -> float:
    """
    Compute annualized Sharpe ratio from daily returns.
    Sharpe = (mean(daily_returns) / std(daily_returns, ddof=1)) * sqrt(annualization_factor).
    """
    arr = np.asarray(daily_returns, dtype=np.float64)
    if len(arr) < 2:
        return 0.0
    mean_ret = float(np.mean(arr))
    std_ret = float(np.std(arr, ddof=1))
    if std_ret <= 1e-12:
        return 0.0
    return float((mean_ret / std_ret) * np.sqrt(annualization_factor))


def compute_max_drawdown(equity_curve: np.ndarray | list[float]) -> float:
    """Compute maximum drawdown percentage from an equity curve."""
    arr = np.asarray(equity_curve, dtype=np.float64)
    if len(arr) < 2:
        return 0.0
    peak = np.maximum.accumulate(arr)
    drawdowns = (arr - peak) / peak
    return float(np.min(drawdowns)) * 100.0


def block_bootstrap_sharpe_difference(
    model_daily_returns: np.ndarray | list[float],
    bnh_daily_returns: np.ndarray | list[float],
    block_length_days: int = 20,
    n_bootstraps: int = 1000,
    alpha: float = 0.10,
    annualization_factor: float = 365.0,
    seed: int = 42,
) -> float:
    """
    20-day block bootstrap of (Model Sharpe - B&H Sharpe) on daily returns.
    Returns the 90% lower bound (10th percentile of the bootstrap differences).
    """
    m_arr = np.asarray(model_daily_returns, dtype=np.float64)
    b_arr = np.asarray(bnh_daily_returns, dtype=np.float64)
    n = min(len(m_arr), len(b_arr))
    if n < block_length_days:
        return 0.0

    m_arr = m_arr[:n]
    b_arr = b_arr[:n]
    rng = np.random.default_rng(seed)

    # Number of candidate block start indices
    max_start = n - block_length_days
    if max_start <= 0:
        return 0.0

    n_blocks = int(np.ceil(n / block_length_days))
    diffs: list[float] = []

    for _ in range(n_bootstraps):
        starts = rng.integers(0, max_start + 1, size=n_blocks)
        m_sample_blocks = [m_arr[s : s + block_length_days] for s in starts]
        b_sample_blocks = [b_arr[s : s + block_length_days] for s in starts]

        m_sample = np.concatenate(m_sample_blocks)[:n]
        b_sample = np.concatenate(b_sample_blocks)[:n]

        m_sh = compute_daily_sharpe(m_sample, annualization_factor=annualization_factor)
        b_sh = compute_daily_sharpe(b_sample, annualization_factor=annualization_factor)
        diffs.append(m_sh - b_sh)

    return float(np.percentile(diffs, alpha * 100.0))


def evaluate_success_bar(
    pooled_trades: int,
    model_sharpe: float | None,
    bnh_sharpe: float | None,
    rule_sharpe: float | None,
    bootstrap_90_lb: float,
    positive_folds_pct: float,
    max_drawdown_pct: float,
    bar: MLSuccessBar | None = None,
    smoke: bool = False,
) -> tuple[str, dict[str, Any]]:
    """
    Pre-registered success bar evaluation.
    Evaluates and reports EVERY criterion with its actual pass/fail, even when trades < 300.
    Machine verdict is exactly one of:
      - 'SMOKE_ONLY' (if smoke is True)
      - 'INSUFFICIENT_DATA' (if pooled_trades < min_pooled_trades)
      - 'EDGE_SUPPORTED' (if all 6 conditions hold)
      - 'NO_EVIDENCE_OF_EDGE' (otherwise)
    """
    config_bar = bar or get_settings().success_bar

    min_trades_passed = bool(pooled_trades >= config_bar.min_pooled_trades)
    sharpe_above_bnh = bool(model_sharpe is not None and bnh_sharpe is not None and model_sharpe > bnh_sharpe)
    sharpe_above_rule = bool(model_sharpe is not None and rule_sharpe is not None and model_sharpe > rule_sharpe)
    bootstrap_lb_passed = bool(bootstrap_90_lb > config_bar.min_bootstrap_90_lower_bound)
    positive_folds_passed = bool(positive_folds_pct >= config_bar.min_positive_fold_pct)
    # max drawdown is negative, so max_dd >= -35.0 means better than -35% (e.g. -20% >= -35%)
    max_drawdown_passed = bool(max_drawdown_pct >= config_bar.max_drawdown_limit_pct)

    checks = {
        "min_trades_passed": min_trades_passed,
        "sharpe_above_bnh": sharpe_above_bnh,
        "sharpe_above_rule": sharpe_above_rule,
        "bootstrap_lb_passed": bootstrap_lb_passed,
        "positive_folds_passed": positive_folds_passed,
        "max_drawdown_passed": max_drawdown_passed,
    }

    if smoke:
        verdict = "SMOKE_ONLY"
        checks["reason"] = "Smoke test run — verdict disabled"
    elif not min_trades_passed:
        verdict = "INSUFFICIENT_DATA"
        checks["reason"] = f"Insufficient trades ({pooled_trades} < {config_bar.min_pooled_trades})"
    elif all(checks.values()):
        verdict = "EDGE_SUPPORTED"
    else:
        verdict = "NO_EVIDENCE_OF_EDGE"

    return verdict, checks


def log_holdout_access(
    caller: str,
    reason: str = "Evaluation run",
    log_path: str = "holdout_access.log",
) -> None:
    """Log an audited holdout opening to holdout_access.log."""
    timestamp_utc = datetime.now(timezone.utc).isoformat()
    entry = f"{timestamp_utc} | Holdout accessed | caller={caller} | reason={reason}\n"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(entry)
    logger.warning(f"AUDIT LOG: Holdout accessed by {caller}. Logged to {log_path}")


def guard_holdout_access(
    allow_holdout: bool,
    caller: str = "evaluation.walk_forward",
    reason: str = "Final holdout requested",
    log_path: str = "holdout_access.log",
) -> None:
    """
    Enforce final holdout lock.
    Raises PermissionError if allow_holdout is False.
    Logs access if allow_holdout is True.
    """
    if not allow_holdout:
        raise PermissionError(
            "Final holdout access is locked. Pass --final-holdout to unlock and audit."
        )
    log_holdout_access(caller=caller, reason=reason, log_path=log_path)
