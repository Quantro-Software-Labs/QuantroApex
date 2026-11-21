import pytest
import numpy as np
import pandas as pd

from processing.features import (
    FEATURE_KEYS,
    TALIB_AVAILABLE,
    _talib,
    wilder_rsi,
    _rsi,
    extract_indicator_features,
    annotate_smc,
    precompute_feature_matrix,
    sequence_from_matrix,
)


def test_feature_keys_count_and_columns():
    """Verify dead columns 4-6 and duplicate column 10 are dropped (10 features remain)."""
    assert len(FEATURE_KEYS) == 10
    assert "ema20" not in FEATURE_KEYS
    assert "ema50" not in FEATURE_KEYS
    assert "ema200" not in FEATURE_KEYS
    assert "atr" not in FEATURE_KEYS
    assert "atr_pct" in FEATURE_KEYS
    assert FEATURE_KEYS == [
        "rsi",
        "macd",
        "macd_signal",
        "macd_hist",
        "price_vs_ema20",
        "price_vs_ema50",
        "price_vs_ema200",
        "atr_pct",
        "bb_position",
        "volume_ratio",
    ]


def test_wilder_rsi_matches_talib():
    """Wilder smoothing in fallback matches TA-Lib within 1e-6."""
    np.random.seed(42)
    # Generate realistic random walk price series
    returns = np.random.normal(0.0005, 0.02, size=300)
    prices = 100.0 * np.cumprod(1.0 + returns)

    py_rsi = wilder_rsi(prices, period=14)

    if TALIB_AVAILABLE and _talib is not None:
        ta_rsi = _talib.RSI(prices, timeperiod=14)
        # Compare from index 14 onwards where RSI is defined
        valid_idx = ~np.isnan(ta_rsi)
        max_diff = np.max(np.abs(py_rsi[valid_idx] - ta_rsi[valid_idx]))
        assert max_diff < 1e-6, f"Wilder RSI difference with TA-Lib exceeded 1e-6: {max_diff}"
    else:
        # If TA-Lib not installed, verify mathematically that fallback produces valid bounds
        valid = py_rsi[~np.isnan(py_rsi)]
        assert np.all(valid >= 0.0) and np.all(valid <= 100.0)


def test_no_lookahead_truncation():
    """
    Audit for look-ahead: truncating the data at t must not change any feature value at t.
    Tests indicator features, feature matrix, and SMC annotations.
    """
    np.random.seed(123)
    n = 200
    dates = pd.date_range("2025-01-01", periods=n, freq="1h")
    close = 50000.0 * np.cumprod(1.0 + np.random.normal(0.0001, 0.01, size=n))
    high = close * (1.0 + np.abs(np.random.normal(0.002, 0.005, size=n)))
    low = close * (1.0 - np.abs(np.random.normal(0.002, 0.005, size=n)))
    open_p = (high + low) / 2.0
    vol = np.random.uniform(10.0, 100.0, size=n)

    df_full = pd.DataFrame(
        {"open": open_p, "high": high, "low": low, "close": close, "volume": vol},
        index=dates,
    )

    # Test several truncation points t
    for t in [70, 100, 150, 180]:
        df_truncated = df_full.iloc[: t + 1].copy()

        # 1. Feature matrix at t
        mat_full = precompute_feature_matrix(df_full)
        mat_trunc = precompute_feature_matrix(df_truncated)

        diff = np.max(np.abs(mat_full[t] - mat_trunc[t]))
        assert diff < 1e-5, f"Feature matrix at t={t} changed when data after t was truncated! Diff: {diff}"

        # 2. SMC annotations at t
        # Full dataframe evaluated causally at current_idx=t vs truncated dataframe
        smc_full = annotate_smc(df_full, lookback=2, current_idx=t)
        smc_trunc = annotate_smc(df_truncated, lookback=2, current_idx=None)

        assert smc_full["structure"] == smc_trunc["structure"]
        assert len(smc_full["fvgs"]) == len(smc_trunc["fvgs"])
        assert len(smc_full["order_blocks"]) == len(smc_trunc["order_blocks"])
