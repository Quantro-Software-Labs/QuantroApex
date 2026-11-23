"""
Tests for H2 Daily Regime Allocation Model.

Requirements:
1. Feature causality via truncation: verify features at bar t are identical whether or not data after t exists.
2. Label uses only the next 7 days: verify prices after t+8 do not affect label at t.
3. Purge test: verify training samples whose 7-day window touches test_start are purged, with >= 1-day embargo.
4. 7-day minimum hold is strictly enforced: coin cannot switch before 7 days in state.
5. Costs charged on every switch: 0.40% per side deducted from sleeve on state switch.
6. A switch decided at close t fills at the open of t+1.
"""

from datetime import datetime, timezone, timedelta
import numpy as np
import pandas as pd
import pytest

from evaluation.h2_regime import (
    compute_h2_features_and_labels,
    build_h2_fold_schedule,
    simulate_daily_portfolio,
    SYMBOLS,
    FEATURE_COLUMNS,
    FEE_PER_SIDE,
    MIN_HOLD_DAYS,
)


def _generate_synthetic_daily_data(n_days: int = 300) -> dict[str, pd.DataFrame]:
    """Generate consistent multi-asset daily bars."""
    start_dt = datetime(2020, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    dates = [start_dt + timedelta(days=i) for i in range(n_days)]

    np.random.seed(42)
    daily_dfs: dict[str, pd.DataFrame] = {}

    for sym in SYMBOLS:
        px = 100.0
        opens, highs, lows, closes, vols = [], [], [], [], []
        for _ in range(n_days):
            ret = np.random.normal(0.001, 0.02)
            c = px * (1.0 + ret)
            o = px * (1.0 + np.random.normal(0.0, 0.005))
            h = max(o, c) * (1.0 + abs(np.random.normal(0.005, 0.005)))
            l = min(o, c) * (1.0 - abs(np.random.normal(0.005, 0.005)))
            v = float(np.random.uniform(1000, 5000))

            opens.append(o)
            highs.append(h)
            lows.append(l)
            closes.append(c)
            vols.append(v)
            px = c

        daily_dfs[sym] = pd.DataFrame({
            "timestamp": dates,
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": vols,
        })

    return daily_dfs


def test_feature_causality_via_truncation():
    """
    Verify feature causality: for any bar t, truncating the daily series at bar t
    leaves all 11 features at bar t identical to computing them on the full series.
    """
    dfs_full = _generate_synthetic_daily_data(n_days=350)
    featured_full = compute_h2_features_and_labels(dfs_full)

    # Test truncation at several evaluation dates after the 200-day warmup
    btc_dates = dfs_full["BTCUSDT"]["timestamp"].tolist()
    test_eval_indices = [210, 240, 270, 300, 330]

    for t_idx in test_eval_indices:
        t_date = btc_dates[t_idx]

        # Truncate all raw data at bar t
        dfs_trunc = {
            sym: df.iloc[: t_idx + 1].copy()
            for sym, df in dfs_full.items()
        }
        featured_trunc = compute_h2_features_and_labels(dfs_trunc)

        for sym in SYMBOLS:
            full_row = featured_full[sym].set_index("timestamp").loc[t_date]
            trunc_row = featured_trunc[sym].set_index("timestamp").loc[t_date]

            for feat in FEATURE_COLUMNS:
                val_full = float(full_row[feat])
                val_trunc = float(trunc_row[feat])
                assert np.isclose(val_full, val_trunc, atol=1e-10), (
                    f"Causality leak in {feat} for {sym} at bar {t_idx} ({t_date}): "
                    f"full={val_full} vs trunc={val_trunc}"
                )


def test_label_uses_only_next_7_days():
    """
    Verify that the label at day t depends strictly on open[t+1] and open[t+8],
    and is completely unaffected by prices after t+8.
    """
    dfs = _generate_synthetic_daily_data(n_days=100)
    featured_base = compute_h2_features_and_labels(dfs)

    btc_base = featured_base["BTCUSDT"]
    t_idx = 30
    base_label = btc_base.iloc[t_idx]["label"]
    base_fwd_ret = btc_base.iloc[t_idx]["fwd_7d_ret"]

    # Perturb prices at t+9, t+10, t+15 (far in the future)
    dfs_perturbed = {s: d.copy() for s, d in dfs.items()}
    dfs_perturbed["BTCUSDT"].loc[t_idx + 9 :, "close"] *= 2.5
    dfs_perturbed["BTCUSDT"].loc[t_idx + 9 :, "open"] *= 2.5

    featured_perturbed = compute_h2_features_and_labels(dfs_perturbed)
    btc_perturbed = featured_perturbed["BTCUSDT"]

    perturbed_label = btc_perturbed.iloc[t_idx]["label"]
    perturbed_fwd_ret = btc_perturbed.iloc[t_idx]["fwd_7d_ret"]

    assert base_label == perturbed_label, "Future prices after t+8 leaked into label at t"
    assert np.isclose(base_fwd_ret, perturbed_fwd_ret, atol=1e-12)


def test_h2_purging_and_embargo():
    """
    Verify that in every fold, no training sample's label reaches or touches test start.
    With a 7-day label horizon and 1-day embargo, effective train end must be <= test_start - 8 days.
    """
    dfs = _generate_synthetic_daily_data(n_days=1200)
    folds, holdout_cutoff = build_h2_fold_schedule(dfs, train_days=365, test_days=90, step_days=90, holdout_days=180)

    assert len(folds) > 0

    for f in folds:
        test_start = f["test_start"]
        eff_train_end = f["eff_train_end"]

        # Effective train end must be at least 8 days prior to test start
        diff_days = (test_start - eff_train_end).days
        assert diff_days >= 8, f"Fold {f['fold']}: eff_train_end is only {diff_days} days before test_start"

        # Any sample at eff_train_end: label window ends at eff_train_end + 7 days
        label_horizon_end = eff_train_end + timedelta(days=7)
        assert label_horizon_end < test_start, (
            f"Fold {f['fold']}: label horizon {label_horizon_end} reaches test_start {test_start}"
        )


def test_seven_day_minimum_hold_enforced():
    """
    Verify that a coin must stay in a state (HOLD or CASH) for at least 7 days before it can switch.
    """
    dfs = _generate_synthetic_daily_data(n_days=50)
    featured = compute_h2_features_and_labels(dfs)

    btc_dates = dfs["BTCUSDT"]["timestamp"].tolist()
    start_date = btc_dates[5]
    end_date = btc_dates[40]

    # Create decision dataframe trying to flip-flop every single day
    decisions = []
    for i, d in enumerate(btc_dates):
        state = "HOLD" if i % 2 == 0 else "CASH"
        for sym in SYMBOLS:
            decisions.append({"timestamp": d, "symbol": sym, "target_state": state})
    decisions_df = pd.DataFrame(decisions)

    sim = simulate_daily_portfolio(
        featured,
        decisions_df,
        start_date,
        end_date,
        min_hold_days=MIN_HOLD_DAYS,
    )

    # In 35 days, with 7-day minimum hold, a coin can switch at most 35 / 7 = 5 times
    for sym, switches in sim["switches_by_symbol"].items():
        assert switches <= (35 // MIN_HOLD_DAYS) + 1, (
            f"{sym} switched {switches} times in 35 days despite {MIN_HOLD_DAYS}-day min hold!"
        )


def test_costs_charged_on_switch():
    """
    Verify that on every switch, exactly 0.40% fee is deducted from the sleeve.
    """
    # Create flat market (0% price change) to isolate fee impact
    start_dt = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    dates = [start_dt + timedelta(days=i) for i in range(25)]

    daily_dfs = {}
    for sym in SYMBOLS:
        daily_dfs[sym] = pd.DataFrame({
            "timestamp": dates,
            "open": [100.0] * 25,
            "high": [100.0] * 25,
            "low": [100.0] * 25,
            "close": [100.0] * 25,
            "volume": [1000.0] * 25,
        })

    featured = compute_h2_features_and_labels(daily_dfs)

    # Force a single switch from CASH to HOLD on day 2 (decision at close of day 1)
    decisions = []
    for d in dates:
        decisions.append({
            "timestamp": d,
            "symbol": "BTCUSDT",
            "target_state": "HOLD" if d >= dates[1] else "CASH",
        })
        for s in SYMBOLS[1:]:
            decisions.append({"timestamp": d, "symbol": s, "target_state": "CASH"})
    decisions_df = pd.DataFrame(decisions)

    # Initial equity 100,000. Each sleeve = 20,000.
    sim = simulate_daily_portfolio(
        featured,
        decisions_df,
        dates[0],
        dates[10],
        fee_per_side=FEE_PER_SIDE,
        min_hold_days=7,
        initial_equity=100000.0,
    )

    # Exactly 1 switch occurred for BTCUSDT
    assert sim["switches"] == 1
    # Cost should be exactly 0.40% of BTC sleeve (0.0040 * 20,000 = $80)
    expected_ending_equity = 100000.0 - (20000.0 * FEE_PER_SIDE)
    assert np.isclose(sim["equity_curve"][-1], expected_ending_equity, atol=1e-3), (
        f"Expected ending equity {expected_ending_equity}, got {sim['equity_curve'][-1]}"
    )


def test_switch_fills_at_next_day_open():
    """
    Verify that a switch decided at close t fills at the open of t+1.
    If open[t+1] gaps up 5% from close[t], the entry is at open[t+1],
    so the sleeve does NOT capture the overnight gap.
    """
    start_dt = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    dates = [start_dt + timedelta(days=i) for i in range(15)]

    daily_dfs = {}
    for sym in SYMBOLS:
        opens = [100.0] * 15
        closes = [100.0] * 15
        if sym == "BTCUSDT":
            # Day 0: close = 100.0
            # Day 1: open gaps up to 105.0 (+5%), close = 105.0
            opens[1] = 105.0
            closes[1] = 105.0

        daily_dfs[sym] = pd.DataFrame({
            "timestamp": dates,
            "open": opens,
            "high": [max(o, c) for o, c in zip(opens, closes)],
            "low": [min(o, c) for o, c in zip(opens, closes)],
            "close": closes,
            "volume": [1000.0] * 15,
        })

    featured = compute_h2_features_and_labels(daily_dfs)

    # Switch decided at close of day 0 to enter HOLD on day 1
    decisions = []
    for d in dates:
        decisions.append({
            "timestamp": d,
            "symbol": "BTCUSDT",
            "target_state": "HOLD" if d >= dates[0] else "CASH",
        })
        for s in SYMBOLS[1:]:
            decisions.append({"timestamp": d, "symbol": s, "target_state": "CASH"})
    decisions_df = pd.DataFrame(decisions)

    # With zero fees to isolate price action
    sim = simulate_daily_portfolio(
        featured,
        decisions_df,
        dates[0],
        dates[5],
        fee_per_side=0.0,
        min_hold_days=7,
        initial_equity=100000.0,
    )

    # Since entry is at open of day 1 (105.0) and close of day 1 is 105.0,
    # intraday return on day 1 is (105.0 - 105.0) / 105.0 = 0.0%!
    # The portfolio should NOT capture the 5% overnight gap before open!
    assert np.isclose(sim["equity_curve"][1], 100000.0, atol=1e-3), (
        f"Switch captured pre-market gap! Equity on day 1 = {sim['equity_curve'][1]} instead of 100000.0"
    )
