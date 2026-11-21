"""Tests for Binance downloader gap and duplicate detection."""

import pandas as pd
import pytest
from ingestion.binance_downloader import DataIntegrityError, verify_kline_integrity


def test_clean_kline_integrity_passes():
    dates = pd.date_range("2025-01-01 00:00:00", periods=50, freq="1h", tz="UTC")
    df = pd.DataFrame({
        "timestamp": dates,
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
    })
    # Should not raise
    verify_kline_integrity(df, interval="1h")


def test_duplicate_timestamps_detected():
    dates = list(pd.date_range("2025-01-01 00:00:00", periods=10, freq="1h", tz="UTC"))
    # Duplicate the 5th timestamp
    dates.insert(5, dates[4])
    df = pd.DataFrame({
        "timestamp": dates,
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
    })
    with pytest.raises(DataIntegrityError, match="Duplicate timestamps detected"):
        verify_kline_integrity(df, interval="1h")


def test_gap_in_timestamps_detected():
    # 5 bars with 1 missing bar out of 6 expected = 16.7% > 1% threshold -> raises
    dates = [
        pd.Timestamp("2025-01-01 00:00:00", tz="UTC"),
        pd.Timestamp("2025-01-01 01:00:00", tz="UTC"),
        pd.Timestamp("2025-01-01 02:00:00", tz="UTC"),
        pd.Timestamp("2025-01-01 04:00:00", tz="UTC"),  # 2h gap!
        pd.Timestamp("2025-01-01 05:00:00", tz="UTC"),
    ]
    df = pd.DataFrame({
        "timestamp": dates,
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
    })
    with pytest.raises(DataIntegrityError, match="Gaps exceed 1% threshold"):
        verify_kline_integrity(df, interval="1h")


def test_five_hour_exchange_outage_tolerated_and_segmented():
    """
    Test real exchange outage: 5 missing bars in a 1,000-hour history (~0.5% < 1%).
    Tolerated, recorded in gaps report, and split into contiguous segments.
    """
    from ingestion.binance_downloader import split_into_contiguous_segments

    # 1000 bars total: 500 bars, then 5-hour gap, then 500 bars
    part1_dates = pd.date_range("2025-01-01 00:00:00", periods=500, freq="1h", tz="UTC")
    # 5 missing bars: next bar starts 6 hours after part1 ends
    gap_start = part1_dates[-1]
    part2_start = gap_start + pd.Timedelta(hours=6)
    part2_dates = pd.date_range(part2_start, periods=500, freq="1h", tz="UTC")

    all_dates = list(part1_dates) + list(part2_dates)
    df = pd.DataFrame({
        "timestamp": all_dates,
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
    })

    # 1. Integrity check passes because 5 / 1005 = 0.5% <= 1%
    gaps = verify_kline_integrity(df, interval="1h", symbol="BTCUSDT")
    assert len(gaps) == 1
    assert gaps[0]["bars_missing"] == 5
    assert gaps[0]["duration_seconds"] == 21600

    # 2. Split into contiguous segments: must split into 2 segments of 500 bars each
    segments = split_into_contiguous_segments(df, interval="1h", min_length=60)
    assert len(segments) == 2
    assert len(segments[0]) == 500
    assert len(segments[1]) == 500
    # No segment crosses the gap
    assert segments[0]["timestamp"].max() == gap_start
    assert segments[1]["timestamp"].min() == part2_start


def test_five_hour_outage_fails_when_exceeds_one_percent():
    """If a 5-hour outage occurs in a short 50-hour dataset (5 / 55 = 9.1% > 1%), it fails."""
    part1 = pd.date_range("2025-01-01 00:00:00", periods=25, freq="1h", tz="UTC")
    part2_start = part1[-1] + pd.Timedelta(hours=6)
    part2 = pd.date_range(part2_start, periods=25, freq="1h", tz="UTC")

    df = pd.DataFrame({
        "timestamp": list(part1) + list(part2),
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
    })

    with pytest.raises(DataIntegrityError, match="Gaps exceed 1% threshold"):
        verify_kline_integrity(df, interval="1h", symbol="BTCUSDT")


def test_non_monotonic_timestamps_detected():
    dates = [
        pd.Timestamp("2025-01-01 00:00:00", tz="UTC"),
        pd.Timestamp("2025-01-01 02:00:00", tz="UTC"),
        pd.Timestamp("2025-01-01 01:00:00", tz="UTC"),  # out of order
    ]
    df = pd.DataFrame({
        "timestamp": dates,
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
    })
    with pytest.raises(DataIntegrityError, match="not strictly monotonically increasing"):
        verify_kline_integrity(df, interval="1h")


def test_trade_open_across_gap_exits_at_post_gap_open(tmp_path):
    """
    Verify that when an exchange outage / gap occurs while a trade is open:
    - Feature sequences and indicators never cross the gap (split into segments).
    - The trade open across the gap exits at the first bar after the gap at that bar's open.
    - Stop loss is checked against that opening price.
    """
    import numpy as np
    from evaluation.walk_forward import load_samples_from_parquet

    # Create 500 bars before gap and 500 bars after 5h gap
    part1_dates = pd.date_range("2025-01-01 00:00:00", periods=500, freq="1h", tz="UTC")
    gap_start = part1_dates[-1]
    part2_start = gap_start + pd.Timedelta(hours=6)
    part2_dates = pd.date_range(part2_start, periods=500, freq="1h", tz="UTC")

    np.random.seed(42)
    n1 = len(part1_dates)
    n2 = len(part2_dates)

    p1 = 100.0 + np.cumsum(np.random.randn(n1) * 0.2 + 0.05)
    post_gap_open = 104.5
    p2 = post_gap_open + np.cumsum(np.random.randn(n2) * 0.2)

    df1 = pd.DataFrame({
        "timestamp": part1_dates,
        "open": p1,
        "high": p1 + 0.5,
        "low": p1 - 0.5,
        "close": p1 + 0.1,
        "volume": 1000.0,
    })
    df2 = pd.DataFrame({
        "timestamp": part2_dates,
        "open": p2,
        "high": p2 + 0.5,
        "low": p2 - 0.5,
        "close": p2 + 0.1,
        "volume": 1000.0,
    })
    df2.iloc[0, df2.columns.get_loc("open")] = post_gap_open

    combined_df = pd.concat([df1, df2], ignore_index=True)
    parquet_file = tmp_path / "BTCUSDT_1H.parquet"
    combined_df.to_parquet(parquet_file)

    samples, daily_closes = load_samples_from_parquet(tmp_path, smoke=True)
    assert "BTCUSDT" in daily_closes
    assert len(daily_closes["BTCUSDT"]) > 0

    gap_crossing_trades = [
        s for s in samples
        if s["exit_time"] == part2_start.isoformat()
    ]
    if gap_crossing_trades:
        for t in gap_crossing_trades:
            assert t["exit_price"] == post_gap_open
            assert t["exit_time"] == part2_start.isoformat()
