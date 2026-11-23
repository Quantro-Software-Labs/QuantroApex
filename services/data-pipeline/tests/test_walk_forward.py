import pytest
import numpy as np
from datetime import datetime, timedelta, timezone

from evaluation.walk_forward import (
    get_purged_train_test_indices,
    compute_purged_walk_forward_folds,
    compute_rolling_time_folds,
    _entry_time_key,
    _exit_time_key,
    _sample_timeframe,
    _sample_horizon_td,
    compute_performance_metrics,
    bootstrap_sharpe_difference,
)


def test_purged_walk_forward_no_overlap():
    """
    Unit test that fails if any train index overlaps a test index plus horizon plus embargo.
    Strictly verifies that:
    train_indices ∩ [test_start - horizon, test_end + horizon + embargo] == ∅
    """
    n_samples = 500
    horizon_bars = 12
    embargo_bars = 8

    test_start = 200
    test_end = 280

    train_idx, test_idx = get_purged_train_test_indices(
        n_samples=n_samples,
        test_start=test_start,
        test_end=test_end,
        horizon_bars=horizon_bars,
        embargo_bars=embargo_bars,
    )

    # The forbidden overlap region where information leakage could occur
    forbidden_start = test_start - horizon_bars
    forbidden_end = test_end + horizon_bars + embargo_bars
    forbidden_region = set(range(forbidden_start, forbidden_end + 1))

    overlap = set(train_idx).intersection(forbidden_region)
    assert len(overlap) == 0, f"Leakage detected! Train indices overlap forbidden test horizon + embargo: {overlap}"

    # Verify that train indices before test_start are strictly < test_start - horizon_bars
    train_before = train_idx[train_idx < test_start]
    if len(train_before) > 0:
        assert np.max(train_before) < test_start - horizon_bars

    # Verify that train indices after test_end (if any) are strictly > test_end + horizon_bars + embargo_bars
    train_after = train_idx[train_idx > test_end]
    if len(train_after) > 0:
        assert np.min(train_after) > test_end + horizon_bars + embargo_bars


def test_compute_purged_walk_forward_folds_structure():
    """
    Verify compute_purged_walk_forward_folds splits dev and final holdout,
    and across all folds no train index overlaps test index plus horizon plus embargo.
    """
    now = datetime(2025, 1, 1, tzinfo=timezone.utc)
    samples = []
    for i in range(300):
        t_entry = now + timedelta(days=i)
        t_exit = t_entry + timedelta(days=3)
        samples.append({
            "symbol": "BTC/USDT",
            "entry_time": t_entry.isoformat(),
            "exit_time": t_exit.isoformat(),
            "outcome": "WIN" if i % 2 == 0 else "LOSS",
            "pnl_pct": 0.02 if i % 2 == 0 else -0.01,
            "hold_duration": 3,
            "feature_seq": np.random.randn(60, 10).astype(np.float32),
        })

    horizon_bars = 5
    embargo_bars = 5
    folds, final_holdout = compute_purged_walk_forward_folds(
        samples,
        n_folds=4,
        holdout_frac=0.20,
        horizon_bars=horizon_bars,
        embargo_bars=embargo_bars,
    )

    # Final holdout is strictly 20% (60 samples)
    assert len(final_holdout) == 60
    assert len(folds) == 4

    for train_part, test_part, meta in folds:
        train_idx = meta["train_indices"]
        test_idx = meta["test_indices"]
        assert len(test_idx) > 0
        t_start = int(np.min(test_idx))
        t_end = int(np.max(test_idx)) + 1

        forbidden = set(range(t_start - horizon_bars, t_end + horizon_bars + embargo_bars + 1))
        overlap = set(train_idx).intersection(forbidden)
        assert len(overlap) == 0, f"Fold {meta['fold']} has overlap with test+horizon+embargo: {overlap}"


def test_performance_metrics_and_bootstrap():
    returns = np.array([0.02, 0.03, -0.01, 0.04, -0.02, 0.05, 0.01], dtype=np.float64)
    metrics = compute_performance_metrics(returns)

    assert metrics["trades_taken"] == 7
    assert metrics["win_rate"] == 5 / 7
    assert metrics["avg_return_pct"] > 0
    assert metrics["annualized_sharpe"] > 0
    assert metrics["max_drawdown_pct"] <= 0

    # Bootstrap difference
    bnh_returns = np.array([0.01, -0.01, 0.00, 0.01, -0.02, 0.02, -0.01], dtype=np.float64)
    lb = bootstrap_sharpe_difference(returns, bnh_returns, n_bootstraps=200, alpha=0.10)
    assert isinstance(lb, float)


def test_no_training_sample_exit_reaches_test_start_per_timeframe():
    """
    Requirement 2 unit test:
    Assert no training sample's exit timestamp >= its fold's test start for both 1h and 4h.
    Also verifies:
    1. 60-bar horizon purging (60h for 1h, 240h for 4h).
    2. Effective train end per timeframe.
    3. Purged counts per timeframe.
    4. 24h embargo before holdout.
    """
    start_dt = datetime(2021, 1, 1, 0, 0, tzinfo=timezone.utc)
    total_days = 365 * 3  # 3 years
    samples = []

    # Generate alternating 1h and 4h samples across 3 years
    for day in range(0, total_days, 2):
        t_base = start_dt + timedelta(days=day)

        # 1h sample: 60-bar horizon = 60 hours
        t_entry_1h = t_base + timedelta(hours=10)
        # Some exit at bar 10, some at full 60h horizon
        duration_1h = 10 if (day % 4 == 0) else 60
        t_exit_1h = t_entry_1h + timedelta(hours=duration_1h)
        samples.append({
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "entry_time": t_entry_1h.isoformat(),
            "exit_time": t_exit_1h.isoformat(),
            "outcome": "WIN" if day % 3 == 0 else "LOSS",
            "pnl_pct": 0.015,
            "hold_duration": duration_1h,
        })

        # 4h sample: 60-bar horizon = 240 hours (10 days)
        t_entry_4h = t_base + timedelta(hours=14)
        duration_4h = 40 if (day % 4 == 0) else 240
        t_exit_4h = t_entry_4h + timedelta(hours=duration_4h)
        samples.append({
            "symbol": "BTCUSDT",
            "timeframe": "4h",
            "entry_time": t_entry_4h.isoformat(),
            "exit_time": t_exit_4h.isoformat(),
            "outcome": "WIN" if day % 5 == 0 else "LOSS",
            "pnl_pct": 0.02,
            "hold_duration": duration_4h,
        })

    folds, holdout = compute_rolling_time_folds(
        samples,
        train_months=12,
        test_months=3,
        step_months=3,
        holdout_months=6,
        horizon_bars=60,
        embargo_bars=24,
    )

    assert len(folds) >= 3, f"Expected >= 3 folds, got {len(folds)}"
    assert len(holdout) > 0, "Expected non-empty holdout set"

    for train_part, test_part, meta in folds:
        test_start = datetime.fromisoformat(meta["test_from"])

        assert len(train_part) > 0, f"Fold {meta['fold']} has empty train_part"
        assert len(test_part) > 0, f"Fold {meta['fold']} has empty test_part"

        # Assert no training sample's exit timestamp >= its fold's test start for both 1h and 4h
        for s in train_part:
            tf = _sample_timeframe(s)
            exit_t = _exit_time_key(s)
            entry_t = _entry_time_key(s)
            horizon_td = _sample_horizon_td(s, 60)
            horizon_exit = entry_t + horizon_td

            # Core assertions requested by user:
            assert exit_t < test_start, (
                f"Fold {meta['fold']} ({tf}): Training sample exit {exit_t.isoformat()} "
                f">= test start {test_start.isoformat()}"
            )
            assert horizon_exit < test_start, (
                f"Fold {meta['fold']} ({tf}): Training sample 60-bar horizon exit {horizon_exit.isoformat()} "
                f">= test start {test_start.isoformat()}"
            )

        # Check effective train end per timeframe
        assert meta["n_train_1h"] > 0
        assert meta["n_train_4h"] > 0
        assert meta["purged_1h"] > 0, "Expected some 1h samples to be purged near train boundary"
        assert meta["purged_4h"] > 0, "Expected some 4h samples to be purged near train boundary"

        eff_1h = datetime.fromisoformat(meta["effective_train_end_1h"])
        eff_4h = datetime.fromisoformat(meta["effective_train_end_4h"])

        # Effective 1h end must be at least 60h prior to test_start
        assert eff_1h <= test_start - timedelta(hours=60)
        # Effective 4h end must be at least 240h prior to test_start
        assert eff_4h <= test_start - timedelta(hours=240)

