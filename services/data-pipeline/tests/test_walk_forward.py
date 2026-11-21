import pytest
import numpy as np
from datetime import datetime, timedelta, timezone

from evaluation.walk_forward import (
    get_purged_train_test_indices,
    compute_purged_walk_forward_folds,
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
