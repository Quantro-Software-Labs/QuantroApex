import pytest
import numpy as np
import pandas as pd
import torch

from processing.labeller import StrategyLabeller, check_rule_signal, STRATEGIES
from inference.engine import GlobalBrainInference, InferenceResult
from processing.features import FEATURE_KEYS
from config import settings


def test_train_inference_rule_signal_match():
    """
    Train/inference match test:
    Verify that check_rule_signal produces identical entry signal decisions
    whether evaluated during labelling (training) or inference gating.
    """
    n = 100
    dates = pd.date_range("2025-01-01", periods=n, freq="1d")
    close = np.linspace(100.0, 200.0, n)  # upward trend
    high = close * 1.01
    low = close * 0.99
    open_p = close * 0.995
    vol = np.full(n, 1000.0)

    df = pd.DataFrame(
        {"open": open_p, "high": high, "low": low, "close": close, "volume": vol},
        index=dates,
    )

    # Check signal across all bars
    strat_key = "apex-momentum-alpha"
    strat = STRATEGIES[strat_key]
    entry_mask = np.asarray(strat["entry"](df)).astype(bool)

    for i in range(50, n):
        labeller_signal = bool(entry_mask[i])
        inference_signal = check_rule_signal(df, strategy_id=strat_key, idx=i)
        assert labeller_signal == inference_signal, f"Mismatch at bar {i}: labeller={labeller_signal}, inference={inference_signal}"


def test_realistic_fill_and_no_force_close():
    """
    Realistic fills test:
    1. Enter at NEXT bar's open, not signal bar's close.
    2. Check stops and targets against bar high/low (if both hit in one bar, stop hits first).
    3. Apply fees plus slippage consistently.
    4. Trades still open at end of data are dropped (never force-closed).
    """
    dates = pd.date_range("2025-01-01", periods=10, freq="1d")
    # Bar 0: Signal fires. Close = 100
    # Bar 1: Opens at 105. High = 106, Low = 104, Close = 105 (Trade enters at 105 + slippage)
    # Bar 2: High = 115, Low = 90 (Both TP and SL hit -> SL must hit first!)
    opens = [100.0, 105.0, 105.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0]
    highs = [101.0, 106.0, 115.0, 101.0, 101.0, 101.0, 101.0, 101.0, 101.0, 101.0]
    lows  = [99.0,  104.0,  90.0,  99.0,  99.0,  99.0,  99.0,  99.0,  99.0,  99.0]
    closes= [100.0, 105.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0]

    df = pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": 1000.0},
        index=dates,
    )

    # Signal on bar 0 only
    entries = pd.Series([True, False, False, False, False, False, False, False, False, False], index=dates)
    exits = pd.Series([False] * 10, index=dates)

    labeller = StrategyLabeller()
    trades = labeller._pandas_trades(
        df,
        entries=entries,
        exits=exits,
        sl=0.05,
        tp=0.08,
        asset_class="CRYPTO",
    )

    assert len(trades) == 1
    t0 = trades[0]
    # Trade entered at bar 1's open (105.0), NOT bar 0's close (100.0)
    slip = settings.slippage_bps_crypto / 10000.0
    expected_entry = 105.0 * (1.0 + slip)
    assert abs(t0["entry_price"] - expected_entry) < 1e-4

    # On Bar 2, both TP (105 * 1.08 = 113.4 < 115) and SL (105 * 0.95 = 99.75 > 90) were hit.
    # The requirement: if both hit in one bar, assume the stop hit first!
    assert t0["exit_reason"] == "SL"
    assert t0["outcome"] == "LOSS"

    # Test open trade at end of data is dropped, not force-closed:
    # Signal on bar 7, no exit triggered on bars 8, 9
    entries_open = pd.Series([False, False, False, False, False, False, False, True, False, False], index=dates)
    trades_open = labeller._pandas_trades(
        df,
        entries=entries_open,
        exits=exits,
        sl=0.50,  # wide SL
        tp=0.50,  # wide TP
        asset_class="CRYPTO",
    )
    # The trade is still open at bar 9 (end of data) -> MUST BE DROPPED!
    assert len(trades_open) == 0


def test_checkpoint_refuses_feature_mismatch(tmp_path):
    """Inference must refuse checkpoints whose feature list does not match system FEATURE_KEYS."""
    pt_path = tmp_path / "bad_checkpoint.pt"
    # Create checkpoint with mismatched feature list
    payload = {
        "model_state_dict": {},
        "model_config": {"input_dim": 14, "seq_len": 60, "d_model": 128, "nhead": 4, "num_layers": 3, "num_classes": 2},
        "feature_list": ["rsi", "macd", "fake_feature"],
    }
    torch.save(payload, str(pt_path))

    inference = GlobalBrainInference(checkpoint_path=str(pt_path))
    with pytest.raises(ValueError) as excinfo:
        inference.load()
    assert "Feature mismatch" in str(excinfo.value) or "mismatch" in str(excinfo.value).lower()
