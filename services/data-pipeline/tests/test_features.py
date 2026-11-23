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
    is_bearish_setup,
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
    Audit for look-ahead: truncating data at t must not change any feature or SMC annotation at t.
    Specifically verifies that with the 100-bar lookback window in annotate_smc and
    is_bearish_setup, features at bar t are identical whether or not data after t exists.
    """
    np.random.seed(123)
    n = 300
    dates = pd.date_range("2025-01-01", periods=n, freq="1h")

    # Generate a series with both trending and ranging regimes to exercise bullish/bearish swings
    trend = np.concatenate([
        np.linspace(100, 150, 100),   # uptrend
        np.linspace(150, 110, 100),   # downtrend
        np.linspace(110, 130, 100),   # recovery
    ])
    noise = np.random.normal(0.0, 1.0, size=n)
    close = np.maximum(trend + noise, 10.0)
    high = close + np.abs(np.random.normal(1.0, 0.5, size=n))
    low = close - np.abs(np.random.normal(1.0, 0.5, size=n))
    open_p = (high + low) / 2.0
    vol = np.random.uniform(10.0, 100.0, size=n)

    df_full = pd.DataFrame(
        {"open": open_p, "high": high, "low": low, "close": close, "volume": vol},
        index=dates,
    )

    mat_full = precompute_feature_matrix(df_full)

    # Test truncation points t before, at, and well beyond the 100-bar lookback window boundary
    test_points = [25, 50, 75, 99, 100, 101, 120, 150, 180, 220, 250, 290]

    for t in test_points:
        df_truncated = df_full.iloc[: t + 1].copy()

        # 1. Feature matrix at bar t
        mat_trunc = precompute_feature_matrix(df_truncated)
        diff = np.max(np.abs(mat_full[t] - mat_trunc[t]))
        assert diff < 1e-5, (
            f"Feature matrix at t={t} changed when data after t was truncated! Diff: {diff}"
        )

        # 2. SMC annotations at bar t (100-bar lookback window)
        # Causally evaluated at current_idx=t on full df vs evaluated on truncated df ending at t
        smc_full = annotate_smc(df_full, lookback=2, current_idx=t)
        smc_trunc = annotate_smc(df_truncated, lookback=2, current_idx=None)

        assert smc_full["structure"] == smc_trunc["structure"], (
            f"SMC structure differed at t={t}: {smc_full['structure']} vs {smc_trunc['structure']}"
        )
        assert smc_full["fvgs"] == smc_trunc["fvgs"], (
            f"FVGs differed at t={t}: {smc_full['fvgs']} vs {smc_trunc['fvgs']}"
        )
        assert smc_full["order_blocks"] == smc_trunc["order_blocks"], (
            f"Order blocks differed at t={t}: {smc_full['order_blocks']} vs {smc_trunc['order_blocks']}"
        )
        assert smc_full["liquidity"] == smc_trunc["liquidity"], (
            f"Liquidity differed at t={t}: {smc_full['liquidity']} vs {smc_trunc['liquidity']}"
        )

        # 3. is_bearish_setup evaluation at bar t
        bear_full = is_bearish_setup(smc_full)
        bear_trunc = is_bearish_setup(smc_trunc)
        assert bear_full == bear_trunc, (
            f"is_bearish_setup differed at t={t}: full={bear_full}, trunc={bear_trunc}"
        )
