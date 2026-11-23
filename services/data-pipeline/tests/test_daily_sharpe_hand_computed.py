"""Test daily-return Sharpe on a hand-computed example and fold threshold."""

import math
import numpy as np
import pytest
from evaluation.metrics import compute_daily_sharpe, compute_daily_equity_curve


def test_hand_computed_daily_sharpe():
    """
    Hand-worked example:
    Returns over 5 days: [0.02, 0.0, -0.01, 0.0, 0.01] (days 2 and 4 have no position -> 0.0 return).
    Mean = (0.02 + 0.0 - 0.01 + 0.0 + 0.01) / 5 = 0.02 / 5 = 0.004
    Deviations: [0.016, -0.004, -0.014, -0.004, 0.006]
    Squared dev: [0.000256, 0.000016, 0.000196, 0.000016, 0.000036]
    Sum of sq = 0.000520
    Variance (ddof=1) = 0.000520 / 4 = 0.000130
    Std = sqrt(0.000130) = 0.01140175425099138
    Crypto factor = sqrt(365) = 19.1049731745428
    Expected crypto Sharpe = (0.004 / 0.01140175425099138) * 19.1049731745428 = 6.702472740263673
    Stocks factor = sqrt(252) = 15.874507866387544
    Expected stocks Sharpe = (0.004 / 0.01140175425099138) * 15.874507866387544 = 5.569107936165243
    """
    daily_rets = [0.02, 0.0, -0.01, 0.0, 0.01]

    # Verify crypto Sharpe (sqrt(365))
    crypto_sharpe = compute_daily_sharpe(daily_rets, annualization_factor=365.0)
    expected_crypto = (0.004 / math.sqrt(0.000130)) * math.sqrt(365.0)
    assert abs(crypto_sharpe - expected_crypto) < 1e-12
    assert abs(crypto_sharpe - 6.70246797) < 1e-6

    # Verify stocks Sharpe (sqrt(252))
    stocks_sharpe = compute_daily_sharpe(daily_rets, annualization_factor=252.0)
    expected_stocks = (0.004 / math.sqrt(0.000130)) * math.sqrt(252.0)
    assert abs(stocks_sharpe - expected_stocks) < 1e-12
    assert abs(stocks_sharpe - 5.56914577) < 1e-6


def test_daily_equity_curve_empty_days_zero_return():
    """Verify days without trades receive exactly 0 return in daily equity curve."""
    from datetime import datetime, timezone

    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    end = datetime(2025, 1, 5, tzinfo=timezone.utc)

    # Trade closes only on Jan 1 and Jan 3
    trade_map = {
        datetime(2025, 1, 1, 14, 0, tzinfo=timezone.utc): [0.05],
        datetime(2025, 1, 3, 10, 0, tzinfo=timezone.utc): [-0.02],
    }

    dates, daily_rets, equity = compute_daily_equity_curve(trade_map, start, end, initial_equity=1.0)
    assert len(dates) == 5
    # Jan 1: +5%
    assert abs(daily_rets[0] - 0.05) < 1e-7
    # Jan 2: 0% (no position)
    assert daily_rets[1] == 0.0
    # Jan 3: -2%
    assert abs(daily_rets[2] - (-0.02)) < 1e-7
    # Jan 4: 0%
    assert daily_rets[3] == 0.0
    # Jan 5: 0%
    assert daily_rets[4] == 0.0

    # Equity progression: 1.0 -> 1.05 -> 1.05 -> 1.05 * 0.98 = 1.029 -> 1.029 -> 1.029
    assert abs(equity[0] - 1.05) < 1e-7
    assert abs(equity[1] - 1.05) < 1e-7
    assert abs(equity[2] - 1.029) < 1e-7
    assert abs(equity[4] - 1.029) < 1e-7


def test_multiday_trade_mark_to_market_daily_sharpe():
    """
    Hand-computed test with a multi-day trade marked to market daily:
    Initial equity: $1,000.0, cash = $1,000.0
    Day 1 (2025-01-01): 10% slot ($100) enters trade at $100.0 (1.0 share). Cash = $900.
      Day 1 close: $105.0 -> Equity = $900 + $105 = $1005.0. Return = (1005 - 1000) / 1000 = +0.005
    Day 2 (2025-01-02): Open trade marked to Day 2 close $101.0 -> Equity = $900 + $101 = $1001.0.
      Return = (1001 - 1005) / 1005 = -4.0 / 1005.0
    Day 3 (2025-01-03): Trade exits at $110.0 -> Cash = $900 + $110 = $1010.0.
      Return = (1010 - 1001) / 1001 = +9.0 / 1001.0
    Day 4 (2025-01-04): Cash = $1010.0 -> Return = 0.0
    Day 5 (2025-01-05): Cash = $1010.0 -> Return = 0.0

    Mean = (0.005 - 4.0/1005.0 + 9.0/1001.0 + 0 + 0) / 5 = 0.002002181897704286
    Sample std (ddof=1) = 0.005040728443603974
    Expected crypto Sharpe = (mean / std) * sqrt(365) = 7.588512627521505
    """
    from datetime import datetime, timezone
    from evaluation.metrics import simulate_portfolio_mark_to_market

    d1 = datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)
    d2 = datetime(2025, 1, 2, 0, 0, tzinfo=timezone.utc)
    d3 = datetime(2025, 1, 3, 0, 0, tzinfo=timezone.utc)
    d4 = datetime(2025, 1, 4, 0, 0, tzinfo=timezone.utc)
    d5 = datetime(2025, 1, 5, 0, 0, tzinfo=timezone.utc)

    daily_closes = {
        "BTCUSDT": {
            d1: 105.0,
            d2: 101.0,
            d3: 110.0,
            d4: 110.0,
            d5: 110.0,
        }
    }

    trades = [
        {
            "symbol": "BTCUSDT",
            "entry_time": datetime(2025, 1, 1, 9, 0, tzinfo=timezone.utc),
            "exit_time": datetime(2025, 1, 3, 15, 0, tzinfo=timezone.utc),
            "entry_price": 100.0,
            "exit_price": 110.0,
        }
    ]

    dates, daily_rets, eq_curve, skipped, rejected = simulate_portfolio_mark_to_market(
        trades=trades,
        daily_closes_by_symbol=daily_closes,
        start_date=d1,
        end_date=d5,
        max_concurrent_positions=10,
        position_size_frac=0.10,
        fee_per_side=0.0,  # 0 fee for exact hand comparison
        initial_equity=1000.0,
    )

    assert len(dates) == 5
    assert skipped == 0
    assert rejected == 0

    # Verify daily returns
    assert abs(daily_rets[0] - 0.005) < 1e-7
    assert abs(daily_rets[1] - (-4.0 / 1005.0)) < 1e-7
    assert abs(daily_rets[2] - (9.0 / 1001.0)) < 1e-7
    assert daily_rets[3] == 0.0
    assert daily_rets[4] == 0.0

    # Verify annualized Sharpe
    sharpe = compute_daily_sharpe(daily_rets, annualization_factor=365.0)
    expected_sharpe = 7.588512627521505
    assert abs(sharpe - expected_sharpe) < 1e-7

