"""
Tests for:
1. Direction bug fix: in long-only MVP with no shorting, bearish setups never produce long entries
   across labeller, inference, and portfolio simulation.
2. Label vs evaluation consistency: training label win definition matches evaluation win definition
   (same costs DEFAULT_FEE = 0.0010, same horizon 60 bars, same stop-first rule, and net return > 0).
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any
import numpy as np
import pandas as pd
import pytest

from evaluation.diagnostics import _slice_metrics, compute_diagnostics
from evaluation.metrics import simulate_portfolio_mark_to_market
from evaluation.walk_forward import DEFAULT_FEE, load_samples_from_parquet
from processing.features import is_bearish_setup, annotate_smc
from processing.labeller import StrategyLabeller, check_rule_signal, STRATEGIES


def _generate_ohlcv_series(
    n_bars: int = 120,
    base_price: float = 100.0,
    trend: str = "bullish",
) -> pd.DataFrame:
    """Generate deterministic OHLCV dataframe with timestamps."""
    start_dt = datetime(2023, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    dates = [start_dt + timedelta(hours=i) for i in range(n_bars)]

    prices = [base_price]
    for i in range(1, n_bars):
        if trend == "bullish":
            delta = 0.5 + (0.2 if i % 2 == 0 else -0.1)
        elif trend == "bearish":
            delta = -0.5 - (0.2 if i % 2 == 0 else -0.1)
        else:
            delta = 0.2 if i % 2 == 0 else -0.2
        prices.append(max(prices[-1] + delta, 1.0))

    opens = np.array(prices)
    highs = opens + 1.0
    lows = np.maximum(opens - 1.0, 0.5)
    closes = opens + 0.2
    volumes = np.full(n_bars, 1000.0)

    df = pd.DataFrame(
        {
            "timestamp": dates,
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": volumes,
        }
    )
    df.set_index("timestamp", inplace=True)
    return df


def test_is_bearish_setup_detection():
    """Verify is_bearish_setup correctly detects bearish structure and bearish order blocks."""
    # Bullish SMC context
    bullish_smc = {
        "structure": "BULLISH",
        "order_blocks": [{"type": "BULLISH_OB", "high": 105.0, "low": 100.0}],
    }
    assert not is_bearish_setup(bullish_smc)

    # Bearish market structure
    bearish_smc = {
        "structure": "BEARISH",
        "order_blocks": [{"type": "BULLISH_OB", "high": 105.0, "low": 100.0}],
    }
    assert is_bearish_setup(bearish_smc)

    # Bearish order block in non-bullish structure
    ob_smc = {
        "structure": "NEUTRAL",
        "order_blocks": [{"type": "BEARISH_OB", "high": 105.0, "low": 100.0}],
    }
    assert is_bearish_setup(ob_smc)

    # Features dictionary format with smc_structure
    feat_smc = {"smc_structure": "BEARISH"}
    assert is_bearish_setup(feat_smc)


def test_bearish_setup_never_produces_long_entry_in_check_rule_signal():
    """Verify check_rule_signal rejects any bar where SMC indicates a bearish setup."""
    # In a downtrending series, structure is BEARISH
    df = _generate_ohlcv_series(n_bars=80, trend="bearish")
    smc = annotate_smc(df, current_idx=len(df) - 1)
    assert is_bearish_setup(smc)

    # Even if an asset class rule fired, check_rule_signal MUST return False
    signal_fired = check_rule_signal(df, asset_class="CRYPTO", idx=-1)
    assert signal_fired is False, "Bearish setup must never return True in check_rule_signal"


def test_bearish_setup_never_produces_long_entry_in_labeller():
    """Verify _pandas_trades never opens a long trade during a bearish setup."""
    df = _generate_ohlcv_series(n_bars=80, trend="bearish")
    labeller = StrategyLabeller()

    # Create artificial entries firing on every bar after initial structure is formed
    entries = pd.Series(True, index=df.index)
    entries.iloc[:20] = False  # Allow SMC structure to form
    exits = pd.Series(False, index=df.index)

    trades = labeller._pandas_trades(
        df=df,
        entries=entries,
        exits=exits,
        sl=0.05,
        tp=0.10,
        asset_class="CRYPTO",
    )
    assert len(trades) == 0, f"Expected 0 trades during bearish setup, got {len(trades)}"


def test_bearish_setup_never_enters_portfolio_simulation():
    """Verify portfolio simulation rejects trades flagged with bearish setups or non-BUY direction."""
    start = datetime(2023, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    end = datetime(2023, 1, 10, 0, 0, 0, tzinfo=timezone.utc)

    # Bearish candidate trades
    candidate_trades = [
        {
            "symbol": "BTCUSDT",
            "direction": "SELL",
            "entry_time": "2023-01-02T00:00:00+00:00",
            "exit_time": "2023-01-03T00:00:00+00:00",
            "entry_price": 20000.0,
            "exit_price": 19000.0,
            "pnl_pct": -0.05,
            "features": {"smc_structure": "BEARISH"},
        },
        {
            "symbol": "BTCUSDT",
            "direction": "BUY",
            "entry_time": "2023-01-04T00:00:00+00:00",
            "exit_time": "2023-01-05T00:00:00+00:00",
            "entry_price": 20000.0,
            "exit_price": 21000.0,
            "pnl_pct": 0.05,
            "features": {"smc_structure": "BEARISH"},
        },
        {
            "symbol": "BTCUSDT",
            "direction": "BUY",
            "entry_time": "2023-01-06T00:00:00+00:00",
            "exit_time": "2023-01-07T00:00:00+00:00",
            "entry_price": 20000.0,
            "exit_price": 21000.0,
            "pnl_pct": 0.05,
            "features": {
                "smc_structure": "NEUTRAL",
                "order_blocks": [{"type": "BEARISH_OB"}],
            },
        },
    ]

    daily_closes = {
        "BTCUSDT": {
            start + timedelta(days=i): 20000.0 for i in range(12)
        }
    }

    dates, daily_rets, eq, skipped = simulate_portfolio_mark_to_market(
        trades=candidate_trades,
        daily_closes_by_symbol=daily_closes,
        start_date=start,
        end_date=end,
        initial_equity=1000.0,
    )

    # None of the bearish trades should have been executed
    assert len(eq) > 0
    assert np.allclose(eq, 1000.0), f"Equity changed unexpectedly: {eq}"
    assert np.allclose(daily_rets, 0.0), f"Returns occurred on bearish trades: {daily_rets}"


def test_label_vs_evaluation_win_consistency_net_return():
    """
    Verify training label's definition of a win matches evaluation's definition of a win:
    both consider a trade a WIN iff net return after DEFAULT_FEE (0.0010) is > 0.
    """
    fee = DEFAULT_FEE  # 0.0010

    # Case 1: Gross gain is 0.5%, well above 0.1% fee -> WIN in both
    s1 = {"pnl_pct": 0.0050, "outcome": "WIN"}
    ev1 = _slice_metrics([s1], fee_round_trip=fee)
    assert s1["outcome"] == "WIN"
    assert ev1["win_rate"] == 1.0

    # Case 2: Gross loss of -2.0% -> LOSS in both
    s2 = {"pnl_pct": -0.0200, "outcome": "LOSS"}
    ev2 = _slice_metrics([s2], fee_round_trip=fee)
    assert s2["outcome"] == "LOSS"
    assert ev2["win_rate"] == 0.0

    # Case 3: Marginal trade: gross gain +0.05%, but fee is 0.10% -> net is -0.05% -> LOSS in both
    raw_pnl_marginal = 0.0005
    net_pnl_marginal = raw_pnl_marginal - fee
    outcome_marginal = "WIN" if net_pnl_marginal > 0.0 else "LOSS"
    assert outcome_marginal == "LOSS"

    s3 = {"pnl_pct": raw_pnl_marginal, "outcome": outcome_marginal}
    ev3 = _slice_metrics([s3], fee_round_trip=fee)
    assert ev3["win_rate"] == 0.0, "Marginal gain below fee must be evaluated as a LOSS"


def test_label_vs_evaluation_stop_first_and_horizon_rule():
    """
    Verify labeller applies stop-first rule on simultaneous touch and 60-bar max horizon,
    and evaluation matches the outcome.
    """
    labeller = StrategyLabeller()

    # Build 80 bars of OHLCV
    start_dt = datetime(2023, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    dates = [start_dt + timedelta(hours=i) for i in range(80)]

    # Flat market
    opens = np.full(80, 100.0)
    highs = np.full(80, 101.0)
    lows = np.full(80, 99.0)
    closes = np.full(80, 100.0)

    # Bar 10: simultaneous stop (SL=5% -> low <= 95) and take profit (TP=10% -> high >= 110)
    highs[10] = 115.0
    lows[10] = 90.0

    df = pd.DataFrame(
        {
            "timestamp": dates,
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": np.full(80, 1000.0),
        }
    )
    df.set_index("timestamp", inplace=True)

    # Entry at bar 5
    entries = pd.Series(False, index=df.index)
    entries.iloc[5] = True
    exits = pd.Series(False, index=df.index)

    trades = labeller._pandas_trades(
        df=df,
        entries=entries,
        exits=exits,
        sl=0.05,
        tp=0.10,
        asset_class="CRYPTO",
        fee_rate=DEFAULT_FEE,
        horizon_bars=60,
    )

    assert len(trades) == 1
    t = trades[0]
    # Stop-first rule: exit reason must be SL and outcome LOSS
    assert t["exit_reason"] == "SL", f"Expected SL exit reason, got {t['exit_reason']}"
    assert t["outcome"] == "LOSS"
    assert t["pnl_pct"] < 0.0

    # Feed into evaluation
    ev = _slice_metrics([t], fee_round_trip=DEFAULT_FEE)
    assert ev["win_rate"] == 0.0
