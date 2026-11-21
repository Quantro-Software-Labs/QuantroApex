"""
Purged Rolling Walk-Forward Validation with Embargo and Pre-Registered Success Bar.

Key requirements:
1. Rolling walk-forward: 12-month train, 3-month test, step 3 months.
   Purging: label horizon before test window purged.
   Embargo: embargo buffer after test window.
2. Final 6 months locked as holdout.
   Refuses access without --final-holdout; audited access logged to holdout_access.log.
3. Sharpe computed from DAILY returns of the strategy's equity curve
   (days with no position count as 0 return), annualised with sqrt(365) for crypto
   and sqrt(252) for stocks. Never from per-trade returns.
4. Fold Sharpe is null if < 30 trades (sharpe_reason="INSUFFICIENT_TRADES").
5. Pre-registered Success Bar:
   Machine verdict: exactly one of EDGE_SUPPORTED, NO_EVIDENCE_OF_EDGE, INSUFFICIENT_DATA.
6. Diagnostics:
   - Breakdown by setup type (SMC rule families)
   - Breakdown by direction (LONG vs SHORT)
   - Breakdown by symbol
   - Breakdown by timeframe
   - Model calibration: probability buckets vs realised win rate
   - Turnover & total costs paid as % of gross PnL.
7. Fault-tolerant checkpointing after every fold to resume on disconnect.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from loguru import logger
from sklearn.utils.class_weight import compute_class_weight
from torch.utils.data import DataLoader

from config import get_settings
from evaluation.diagnostics import compute_diagnostics
from evaluation.metrics import (
    block_bootstrap_sharpe_difference,
    compute_btc_only_buy_and_hold,
    compute_buy_and_hold_basket,
    compute_daily_equity_curve,
    compute_daily_sharpe,
    compute_max_drawdown,
    evaluate_success_bar,
    guard_holdout_access,
    simulate_portfolio_mark_to_market,
)
from ingestion.binance_downloader import (
    detect_kline_gaps,
    split_into_contiguous_segments,
    record_gaps_report,
)
from inference.policy import INFERENCE_MIN_WIN_PROB
from processing.features import FEATURE_KEYS, annotate_smc, extract_indicator_features
from processing.labeller import STRATEGIES, check_rule_signal
from storage.timescale import TimescaleReader, apply_schema, close_pool
from training.dataset import (
    OUTCOME_MAP,
    MarketDataset,
    fit_dataset_scaler,
    sample_label,
)
from training.model import GlobalBrain
from training.sequences import attach_feature_sequences, filter_sequence_ready

DEFAULT_FEE = 0.0010  # 10 bps round-trip


def _as_utc(t: datetime) -> datetime:
    if t.tzinfo is None:
        return t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc)


def _entry_time_key(sample: dict[str, Any]) -> datetime:
    t = sample.get("entry_time")
    if t is None:
        return datetime.fromtimestamp(0, tz=timezone.utc)
    if isinstance(t, str):
        try:
            return _as_utc(datetime.fromisoformat(t.replace("Z", "+00:00")))
        except Exception:
            return datetime.fromtimestamp(0, tz=timezone.utc)
    if hasattr(t, "tzinfo"):
        return _as_utc(t)
    return datetime.fromtimestamp(0, tz=timezone.utc)


def _exit_time_key(sample: dict[str, Any], default_horizon_hours: int = 10) -> datetime:
    t = sample.get("exit_time")
    if t is not None:
        if isinstance(t, str):
            try:
                return _as_utc(datetime.fromisoformat(t.replace("Z", "+00:00")))
            except Exception:
                pass
        elif hasattr(t, "tzinfo"):
            return _as_utc(t)
    entry = _entry_time_key(sample)
    duration_days = int(sample.get("hold_duration") or 0)
    if duration_days > 0:
        return entry + timedelta(days=duration_days)
    return entry + timedelta(hours=default_horizon_hours)


def get_purged_train_test_indices(
    n_samples: int,
    test_start: int,
    test_end: int,
    horizon_bars: int = 10,
    embargo_bars: int = 10,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute strictly causal train and test index arrays for a fold.
    Forbidden overlap region: [test_start - horizon_bars, test_end + horizon_bars + embargo_bars]
    """
    test_indices = np.arange(test_start, test_end, dtype=np.int64)
    train_before = [i for i in range(0, test_start) if i + horizon_bars < test_start]
    train_after = [
        i
        for i in range(test_end, n_samples)
        if i > (test_end + horizon_bars + embargo_bars)
    ]
    train_indices = np.array(train_before + train_after, dtype=np.int64)
    return train_indices, test_indices


def compute_purged_walk_forward_folds(
    samples: list[dict[str, Any]],
    n_folds: int = 5,
    holdout_frac: float = 0.20,
    horizon_bars: int = 10,
    embargo_bars: int = 10,
) -> tuple[
    list[tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]],
    list[dict[str, Any]],
]:
    """
    Build purged walk-forward folds from ordered samples.
    """
    ordered = sorted(samples, key=_entry_time_key)
    n_total = len(ordered)
    if n_total < 100:
        raise ValueError(f"Need >= 100 samples for purged walk-forward, got {n_total}")

    split_idx = max(int(n_total * (1.0 - holdout_frac)), 50)
    dev_samples = ordered[:split_idx]
    final_holdout = ordered[split_idx:]

    n_dev = len(dev_samples)
    edges = [int(n_dev * i / (n_folds + 1)) for i in range(n_folds + 2)]
    edges[-1] = n_dev

    folds = []
    for k in range(1, n_folds + 1):
        test_start = edges[k]
        test_end = edges[k + 1]
        train_idx, test_idx = get_purged_train_test_indices(
            n_samples=n_dev,
            test_start=test_start,
            test_end=test_end,
            horizon_bars=horizon_bars,
            embargo_bars=embargo_bars,
        )
        train_part = [dev_samples[i] for i in train_idx]
        test_part = [dev_samples[i] for i in test_idx]

        meta = {
            "fold": k,
            "train_indices": train_idx,
            "test_indices": test_idx,
            "n_train": len(train_part),
            "n_test": len(test_part),
            "test_from": _entry_time_key(test_part[0]).isoformat() if test_part else "",
            "test_to": _entry_time_key(test_part[-1]).isoformat() if test_part else "",
        }
        folds.append((train_part, test_part, meta))

    return folds, final_holdout


def compute_rolling_time_folds(
    samples: list[dict[str, Any]],
    train_months: int = 12,
    test_months: int = 3,
    step_months: int = 3,
    holdout_months: int = 6,
    horizon_bars: int = 10,
    embargo_bars: int = 10,
) -> tuple[
    list[tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]],
    list[dict[str, Any]],
]:
    """
    Time-based rolling walk-forward: 12-month train, 3-month test, 3-month step.
    Locks final 6 months of data as untouched holdout.
    """
    ordered = sorted(samples, key=_entry_time_key)
    if len(ordered) < 10:
        raise ValueError(f"Insufficient samples: {len(ordered)}")

    first_time = _entry_time_key(ordered[0])
    last_time = _exit_time_key(ordered[-1])

    # Holdout cutoff: last_time - holdout_months
    holdout_cutoff = last_time - timedelta(days=holdout_months * 30)
    dev_samples = [s for s in ordered if _entry_time_key(s) < holdout_cutoff]
    holdout_samples = [s for s in ordered if _entry_time_key(s) >= holdout_cutoff]

    if not dev_samples:
        dev_samples = ordered
        holdout_samples = []

    # Build rolling windows across dev_samples
    train_td = timedelta(days=train_months * 30)
    test_td = timedelta(days=test_months * 30)
    step_td = timedelta(days=step_months * 30)
    horizon_td = timedelta(hours=horizon_bars)
    embargo_td = timedelta(hours=embargo_bars)

    start_t = _entry_time_key(dev_samples[0])
    dev_end_t = holdout_cutoff

    folds = []
    fold_idx = 1
    cur_train_start = start_t

    while True:
        cur_train_end = cur_train_start + train_td
        cur_test_start = cur_train_end
        cur_test_end = cur_test_start + test_td

        if cur_test_end > dev_end_t and folds:
            break

        # Purging: train samples must exit before (cur_test_start - horizon_td)
        purge_limit = cur_test_start - horizon_td
        train_part = [
            s for s in dev_samples
            if cur_train_start <= _entry_time_key(s) and _exit_time_key(s) < purge_limit
        ]

        # Test samples
        test_part = [
            s for s in dev_samples
            if cur_test_start <= _entry_time_key(s) < cur_test_end
        ]

        if len(test_part) > 0 and len(train_part) > 0:
            meta = {
                "fold": fold_idx,
                "n_train": len(train_part),
                "n_test": len(test_part),
                "train_from": cur_train_start.isoformat(),
                "train_to": cur_train_end.isoformat(),
                "test_from": cur_test_start.isoformat(),
                "test_to": cur_test_end.isoformat(),
            }
            folds.append((train_part, test_part, meta))
            fold_idx += 1

        cur_train_start += step_td
        if cur_train_start + train_td >= dev_end_t:
            break

    return folds, holdout_samples


def compute_performance_metrics(
    returns: list[float] | np.ndarray,
    annualization_factor: float = 365.0,
    trade_threshold: int = 0,
) -> dict[str, Any]:
    """
    Compute trade count, win rate, average return, total return,
    annualized Sharpe, and max drawdown.
    Folds with fewer than trade_threshold trades report annualized_sharpe as null with INSUFFICIENT_TRADES.
    """
    if len(returns) == 0:
        return {
            "trades_taken": 0.0,
            "win_rate": 0.0,
            "avg_return_pct": 0.0,
            "total_return_pct": 0.0,
            "annualized_sharpe": None,
            "sharpe_reason": "INSUFFICIENT_TRADES",
            "max_drawdown_pct": 0.0,
        }

    arr = np.asarray(returns, dtype=np.float64)
    n = len(arr)
    wins = np.sum(arr > 0)
    win_rate = float(wins / n)
    avg_ret = float(np.mean(arr))
    total_ret = float(np.sum(arr))

    # Fold trade count threshold
    if n < trade_threshold:
        sharpe: float | None = None
        sharpe_reason = "INSUFFICIENT_TRADES"
    else:
        sharpe = compute_daily_sharpe(arr, annualization_factor=annualization_factor)
        sharpe_reason = None

    # Max Drawdown from cumulative equity curve
    equity = np.cumprod(1.0 + np.clip(arr, -0.99, 10.0))
    max_dd = compute_max_drawdown(equity)

    return {
        "trades_taken": float(n),
        "win_rate": win_rate,
        "avg_return_pct": avg_ret * 100.0,
        "total_return_pct": total_ret * 100.0,
        "annualized_sharpe": sharpe,
        "sharpe_reason": sharpe_reason,
        "max_drawdown_pct": max_dd,
    }


def bootstrap_sharpe_difference(
    model_returns: np.ndarray | list[float],
    bnh_returns: np.ndarray | list[float],
    n_bootstraps: int = 1000,
    alpha: float = 0.10,
    annualization_factor: float = 365.0,
    seed: int = 42,
    block_length_days: int = 20,
) -> float:
    """Block bootstrap 90% lower bound for (Model Sharpe - B&H Sharpe) on daily returns."""
    return block_bootstrap_sharpe_difference(
        model_daily_returns=model_returns,
        bnh_daily_returns=bnh_returns,
        block_length_days=block_length_days,
        n_bootstraps=n_bootstraps,
        alpha=alpha,
        annualization_factor=annualization_factor,
        seed=seed,
    )


def train_fold_model(
    train_samples: list[dict[str, Any]],
    scaler: Any,
    input_dim: int = 10,
    epochs: int = 5,
    batch_size: int = 64,
    device: torch.device | None = None,
) -> GlobalBrain:
    dev = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = GlobalBrain(
        input_dim=input_dim,
        d_model=64,
        nhead=2,
        num_layers=2,
        seq_len=60,
        num_classes=2,
    ).to(dev)

    if len(train_samples) == 0:
        return model

    labels = [sample_label(s) for s in train_samples]
    weights_tensor = None
    if len(set(labels)) > 1:
        classes = np.array([0, 1])
        class_weights = compute_class_weight("balanced", classes=classes, y=np.array(labels))
        weights_tensor = torch.FloatTensor(class_weights).to(dev)

    criterion = nn.CrossEntropyLoss(weight=weights_tensor)
    optimizer = optim.AdamW(model.parameters(), lr=2e-4, weight_decay=1e-2)

    dataset = MarketDataset(
        train_samples,
        seq_len=60,
        input_dim=input_dim,
        add_noise=True,
        scaler=scaler,
    )
    loader = DataLoader(
        dataset,
        batch_size=min(batch_size, len(train_samples)),
        shuffle=True,
    )

    model.train()
    for _ in range(epochs):
        for seqs, lbls in loader:
            seqs = seqs.to(dev)
            lbls = lbls.to(dev)
            optimizer.zero_grad()
            logits, _ = model(seqs)
            loss = criterion(logits, lbls)
            loss.backward()
            optimizer.step()

    model.eval()
    return model


def predict_test_fold(
    model: GlobalBrain,
    test_samples: list[dict[str, Any]],
    scaler: Any,
    input_dim: int = 10,
    min_win_prob: float = INFERENCE_MIN_WIN_PROB,
    device: torch.device | None = None,
) -> tuple[list[int], list[float]]:
    dev = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dataset = MarketDataset(
        test_samples,
        seq_len=60,
        input_dim=input_dim,
        add_noise=False,
        scaler=scaler,
    )
    loader = DataLoader(dataset, batch_size=64, shuffle=False)

    preds: list[int] = []
    win_probs: list[float] = []

    model.eval()
    with torch.no_grad():
        for seqs, _ in loader:
            seqs = seqs.to(dev)
            logits, _ = model(seqs)
            probs = torch.softmax(logits, dim=-1)
            p_win = probs[:, 0].cpu().numpy()
            for p in p_win:
                take = 1 if p >= min_win_prob else 0
                preds.append(take)
                win_probs.append(float(p))
    return preds, win_probs


def extract_daily_closes_from_samples(samples: list[dict[str, Any]]) -> dict[str, dict[datetime, float]]:
    """Build daily closes mapping from entry prices and times when raw klines are absent."""
    closes: dict[str, dict[datetime, float]] = {}
    for s in samples:
        sym = s.get("symbol", "BTCUSDT")
        t = _entry_time_key(s)
        dt_midnight = datetime(t.year, t.month, t.day, 0, 0, 0, tzinfo=timezone.utc)
        px = float(s.get("entry_price") or 0.0)
        if px > 0:
            closes.setdefault(sym, {})[dt_midnight] = px
    return closes


def load_samples_from_parquet(
    data_dir: Path | str,
    timeframes: list[str] = ["1h", "4h"],
    smoke: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, dict[datetime, float]]]:
    """
    Generate labelled samples and feature sequences directly from cached Parquet klines.
    Detects gaps and records them in gaps_report.json.
    Splits data into strictly contiguous segments so features/sequences never span gaps.
    Trades open across a gap exit at the first bar after the gap at that bar's open,
    with the stop checked against it.
    Returns: (all_samples, daily_closes_by_symbol)
    """
    p_dir = Path(data_dir)
    files = list(p_dir.glob("*.parquet"))
    if not files:
        return [], {}

    if smoke:
        files = [f for f in files if "BTCUSDT_1H" in f.name.upper()] or files[:1]

    all_samples: list[dict[str, Any]] = []
    daily_closes_by_symbol: dict[str, dict[datetime, float]] = {}
    logger.info(f"Loading and labelling klines from {len(files)} parquet files in {p_dir}...")

    for f in sorted(files):
        try:
            df = pd.read_parquet(f)
            if df.empty or len(df) < 80:
                continue
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
            df = df.sort_values("timestamp").reset_index(drop=True)

            fname = f.stem.upper()
            parts = fname.split("_")
            symbol = parts[0]
            tf = parts[1] if len(parts) > 1 else "1H"
            interval = tf.lower()

            # Record daily closes for buy-and-hold benchmarks and mark-to-market
            try:
                daily_s = df.set_index("timestamp")["close"].resample("1D").last().dropna()
                for dt_val, close_px in daily_s.items():
                    d_utc = datetime(dt_val.year, dt_val.month, dt_val.day, 0, 0, 0, tzinfo=timezone.utc)
                    daily_closes_by_symbol.setdefault(symbol, {})[d_utc] = float(close_px)
            except Exception as d_exc:
                logger.debug(f"Could not resample daily closes for {fname}: {d_exc}")

            # 1. Detect gaps and record to gaps report
            gaps, _ = detect_kline_gaps(df, interval=interval, symbol=symbol, max_gap_pct=0.01)
            if gaps:
                record_gaps_report(p_dir, gaps)

            # 2. Split into contiguous segments: feature windows and sequences never cross gaps
            segments = split_into_contiguous_segments(df, interval=interval, min_length=60)
            if not segments:
                continue

            for strat_id, strat in STRATEGIES.items():
                if strat.get("asset_class") != "CRYPTO":
                    continue

                for seg_idx, seg_df in enumerate(segments):
                    try:
                        entries_raw = strat["entry"](seg_df)
                        exits_raw = strat["exit"](seg_df)
                        entries = pd.Series(np.asarray(entries_raw).astype(bool), index=seg_df.index).fillna(False)
                        exits = pd.Series(np.asarray(exits_raw).astype(bool), index=seg_df.index).fillna(False)

                        sl = strat.get("stop_loss", 0.05)
                        tp = strat.get("take_profit", 0.10)
                        close = seg_df["close"].values
                        high = seg_df["high"].values
                        low = seg_df["low"].values
                        n_bars = len(seg_df)

                        trade_indices = np.where(entries)[0]
                        for entry_idx in trade_indices:
                            if entry_idx < 59 or entry_idx >= n_bars - 1:
                                continue

                            fill_idx = entry_idx + 1
                            fill_open = seg_df.iloc[fill_idx]["open"]
                            entry_price = float(fill_open * 1.0010)

                            exit_price = None
                            exit_time = None
                            hold_bars = 0
                            outcome = "LOSS"

                            # Check exits within current contiguous segment
                            for t in range(fill_idx, min(fill_idx + 60, n_bars)):
                                b_high = float(high[t])
                                b_low = float(low[t])
                                if b_low <= entry_price * (1.0 - sl):
                                    exit_price = entry_price * (1.0 - sl)
                                    exit_time = seg_df.iloc[t]["timestamp"].isoformat()
                                    hold_bars = t - fill_idx
                                    outcome = "LOSS"
                                    break
                                elif b_high >= entry_price * (1.0 + tp):
                                    exit_price = entry_price * (1.0 + tp)
                                    exit_time = seg_df.iloc[t]["timestamp"].isoformat()
                                    hold_bars = t - fill_idx
                                    outcome = "WIN"
                                    break
                                elif bool(exits.iloc[t]):
                                    exit_price = float(close[t])
                                    exit_time = seg_df.iloc[t]["timestamp"].isoformat()
                                    hold_bars = t - fill_idx
                                    outcome = "WIN" if exit_price > entry_price else "LOSS"
                                    break

                            # If trade reached end of segment without exiting:
                            # A trade open across a gap exits at the first bar after the gap at that bar's open,
                            # with the stop checked against it.
                            if exit_price is None:
                                if seg_idx + 1 < len(segments):
                                    next_seg = segments[seg_idx + 1]
                                    first_bar = next_seg.iloc[0]
                                    post_gap_open = float(first_bar["open"])
                                    exit_time = first_bar["timestamp"].isoformat()
                                    stop_price = entry_price * (1.0 - sl)
                                    if post_gap_open <= stop_price:
                                        exit_price = post_gap_open
                                        outcome = "LOSS"
                                    else:
                                        exit_price = post_gap_open
                                        outcome = "WIN" if exit_price > entry_price else "LOSS"
                                    hold_bars = (n_bars - fill_idx) + 1
                                else:
                                    # Open trade at end of all data is dropped
                                    continue

                            pnl_raw = float((exit_price - entry_price) / entry_price)
                            features = extract_indicator_features(seg_df, entry_idx)
                            smc = annotate_smc(seg_df, current_idx=entry_idx)
                            features["smc_structure"] = smc.get("structure")
                            features["smc_fvg_count"] = len(smc.get("fvgs", []))
                            features["smc_ob_count"] = len(smc.get("order_blocks", []))

                            seq_start = entry_idx - 59
                            seq_matrix = []
                            for s_i in range(seq_start, entry_idx + 1):
                                s_feats = extract_indicator_features(seg_df, s_i)
                                vec = [float(s_feats.get(k) or 0.0) for k in FEATURE_KEYS]
                                seq_matrix.append(vec)

                            all_samples.append({
                                "symbol": symbol,
                                "exchange": "binance",
                                "asset_class": "CRYPTO",
                                "timeframe": tf,
                                "strategy_id": strat_id,
                                "entry_time": seg_df.iloc[fill_idx]["timestamp"].isoformat(),
                                "exit_time": exit_time,
                                "entry_price": entry_price,
                                "exit_price": exit_price,
                                "direction": "BUY",
                                "outcome": outcome,
                                "pnl_pct": pnl_raw,
                                "hold_duration": hold_bars,
                                "features": features,
                                "feature_seq": np.array(seq_matrix, dtype=np.float32),
                            })
                    except Exception as exc:
                        logger.debug(f"Error processing segment {seg_idx} in {fname} for {strat_id}: {exc}")
                        continue
        except Exception as exc:
            logger.warning(f"Failed to read parquet {f}: {exc}")
            continue

    logger.success(f"Generated {len(all_samples):,} sequence-ready samples from Parquet files")
    return all_samples, daily_closes_by_symbol


async def run_walk_forward(
    *,
    checkpoint: str | None = None,
    train_epochs: int = 5,
    min_win_prob: float = INFERENCE_MIN_WIN_PROB,
    fee: float = DEFAULT_FEE,
    asset_class: str | None = "CRYPTO",
    strategy_id: str | None = None,
    n_folds: int = 5,
    holdout_frac: float = 0.20,
    horizon_bars: int = 10,
    embargo_bars: int = 10,
    parquet_dir: str | Path | None = None,
    checkpoint_dir: str = "./checkpoints",
    smoke: bool = False,
    allow_holdout: bool = False,
) -> dict[str, Any]:
    """Execute complete purged rolling walk-forward evaluation with fault tolerance."""
    settings = get_settings()
    os.makedirs(checkpoint_dir, exist_ok=True)
    annualization_factor = 365.0 if (asset_class or "").upper() == "CRYPTO" else 252.0

    samples: list[dict[str, Any]] = []
    daily_closes_by_symbol: dict[str, dict[datetime, float]] = {}

    # 1. Load from Parquet if available or requested
    if parquet_dir and Path(parquet_dir).exists():
        samples, daily_closes_by_symbol = load_samples_from_parquet(parquet_dir, smoke=smoke)

    # 2. Fall back to TimescaleDB
    if not samples:
        try:
            reader = TimescaleReader()
            raw_samples = await reader.get_labelled_samples()
            valid = [
                s for s in raw_samples
                if str(s.get("outcome") or "").upper() in ("WIN", "LOSS", "BREAKEVEN")
            ]
            if asset_class:
                ac = asset_class.upper()
                valid = [s for s in valid if str(s.get("asset_class") or "").upper() == ac]
            if strategy_id:
                valid = [s for s in valid if str(s.get("strategy_id") or "") == strategy_id]
            samples = await attach_feature_sequences(reader, valid, seq_len=60)
            samples = filter_sequence_ready(samples, require_seq=True)
        except Exception as exc:
            logger.warning(f"Timescale loading failed: {exc}")

    if not daily_closes_by_symbol and samples:
        daily_closes_by_symbol = extract_daily_closes_from_samples(samples)

    if len(samples) < (20 if smoke else 100):
        raise RuntimeError(f"Insufficient samples for walk-forward: {len(samples)}")

    input_dim = len(FEATURE_KEYS)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Split into folds and locked holdout
    if smoke:
        folds, final_holdout = compute_purged_walk_forward_folds(
            samples,
            n_folds=2,
            holdout_frac=0.20,
            horizon_bars=horizon_bars,
            embargo_bars=embargo_bars,
        )
    else:
        folds, final_holdout = compute_rolling_time_folds(
            samples,
            train_months=settings.rolling_train_months,
            test_months=settings.rolling_test_months,
            step_months=settings.rolling_step_months,
            holdout_months=settings.holdout_months,
            horizon_bars=horizon_bars,
            embargo_bars=embargo_bars,
        )
        if not folds:
            folds, final_holdout = compute_purged_walk_forward_folds(
                samples,
                n_folds=n_folds,
                holdout_frac=holdout_frac,
                horizon_bars=horizon_bars,
                embargo_bars=embargo_bars,
            )

    fold_summaries: list[dict[str, Any]] = []
    all_oos_test_samples: list[dict[str, Any]] = []
    all_oos_model_preds: list[int] = []
    all_oos_win_probs: list[float] = []

    earliest_test_date: datetime | None = None
    latest_test_date: datetime | None = None

    total_folds = len(folds)
    print("=" * 80)
    print(f"Purged Walk-Forward starting: {total_folds} total folds to process (Holdout {len(final_holdout):,} samples locked).")
    print("=" * 80)
    logger.info(f"Purged Walk-Forward starting: {total_folds} total folds to process (Holdout {len(final_holdout):,} samples locked)")
    overall_start_time = time.time()

    for idx, (train_samples, test_samples, meta) in enumerate(folds):
        k = meta["fold"]
        fold_start_time = time.time()
        print(f"\n>>> Starting Fold {k} of {total_folds}...")
        fold_chk = os.path.join(checkpoint_dir, f"fold_{k}_result.json")

        # Resume support: if fold already finished, load from checkpoint
        if os.path.exists(fold_chk):
            try:
                with open(fold_chk, "r", encoding="utf-8") as f:
                    cached_row = json.load(f)
                fold_summaries.append(cached_row)
                logger.info(f"Fold {k}: loaded from existing checkpoint {fold_chk}")
                continue
            except Exception:
                pass

        # Train model and scaler strictly on this fold's train data
        scaler = fit_dataset_scaler(train_samples, input_dim=input_dim)
        model = train_fold_model(
            train_samples,
            scaler=scaler,
            input_dim=input_dim,
            epochs=train_epochs,
            batch_size=64,
            device=device,
        )

        preds, probs = predict_test_fold(
            model,
            test_samples,
            scaler=scaler,
            input_dim=input_dim,
            min_win_prob=min_win_prob,
            device=device,
        )

        all_oos_test_samples.extend(test_samples)
        all_oos_model_preds.extend(preds)
        all_oos_win_probs.extend(probs)

        t_dates = [_entry_time_key(s) for s in test_samples]
        f_start = min(t_dates) if t_dates else datetime.now(timezone.utc)
        f_end = max([_exit_time_key(s) for s in test_samples]) if t_dates else f_start

        if earliest_test_date is None or f_start < earliest_test_date:
            earliest_test_date = f_start
        if latest_test_date is None or f_end > latest_test_date:
            latest_test_date = f_end

        # Model trades in this fold
        fold_model_trades = [s for s, take in zip(test_samples, preds) if take == 1]
        n_model_trades = len(fold_model_trades)

        # Portfolio simulation: 10 concurrent slots, 10% equity sizing, mark-to-market daily
        _, m_daily, m_eq, m_skipped = simulate_portfolio_mark_to_market(
            fold_model_trades,
            daily_closes_by_symbol,
            f_start,
            f_end,
            max_concurrent_positions=10,
            position_size_frac=0.10,
            fee_per_side=fee,
        )
        _, r_daily, r_eq, r_skipped = simulate_portfolio_mark_to_market(
            test_samples,
            daily_closes_by_symbol,
            f_start,
            f_end,
            max_concurrent_positions=10,
            position_size_frac=0.10,
            fee_per_side=fee,
        )
        _, b_daily, b_eq = compute_buy_and_hold_basket(
            daily_closes_by_symbol,
            f_start,
            f_end,
            fee_per_side=fee,
        )
        btc_closes = daily_closes_by_symbol.get("BTCUSDT", {})
        _, btc_daily, btc_eq = compute_btc_only_buy_and_hold(
            btc_closes,
            f_start,
            f_end,
        )

        # If fold has < 30 trades, Sharpe is null with INSUFFICIENT_TRADES
        if n_model_trades < 30:
            m_sharpe = None
            m_sharpe_reason = "INSUFFICIENT_TRADES"
        else:
            m_sharpe = compute_daily_sharpe(m_daily, annualization_factor=annualization_factor)
            m_sharpe_reason = None

        m_tot_ret = ((m_eq[-1] - m_eq[0]) / m_eq[0] * 100.0) if len(m_eq) > 1 else 0.0
        m_win_rate = float(
            sum(1 for s in fold_model_trades if float(s.get("pnl_pct") or 0.0) - (2 * fee) > 0) / n_model_trades
        ) if n_model_trades > 0 else 0.0
        m_max_dd = compute_max_drawdown(m_eq)

        r_sharpe = compute_daily_sharpe(r_daily, annualization_factor=annualization_factor)
        b_sharpe = compute_daily_sharpe(b_daily, annualization_factor=annualization_factor)
        btc_sharpe = compute_daily_sharpe(btc_daily, annualization_factor=annualization_factor)

        fold_row = {
            "fold": k,
            "n_train": meta["n_train"],
            "n_test": meta["n_test"],
            "test_from": meta.get("test_from", ""),
            "test_to": meta.get("test_to", ""),
            "model": {
                "trades_taken": float(n_model_trades),
                "skipped_signals": m_skipped,
                "win_rate": m_win_rate,
                "avg_return_pct": m_tot_ret,
                "annualized_sharpe": m_sharpe,
                "sharpe_reason": m_sharpe_reason,
                "max_drawdown_pct": m_max_dd,
            },
            "rule_only": {
                "trades_taken": float(len(test_samples)),
                "skipped_signals": r_skipped,
                "annualized_sharpe": r_sharpe,
            },
            "buy_and_hold": {
                "trades_taken": float(len(test_samples)),
                "annualized_sharpe": b_sharpe,
                "btc_only_sharpe": btc_sharpe,
            },
            "positive_pnl": m_tot_ret > 0,
        }
        fold_summaries.append(fold_row)

        try:
            with open(fold_chk, "w", encoding="utf-8") as f:
                json.dump(fold_row, f, indent=2)
        except Exception:
            pass

        fold_elapsed = time.time() - fold_start_time
        total_elapsed = time.time() - overall_start_time
        completed_count = idx + 1
        remaining_count = total_folds - completed_count
        avg_per_fold = total_elapsed / completed_count
        eta_seconds = remaining_count * avg_per_fold

        def _fmt_seconds(sec: float) -> str:
            m, s = divmod(int(sec), 60)
            h, m = divmod(m, 60)
            if h > 0:
                return f"{h}h {m:02d}m {s:02d}s"
            return f"{m}m {s:02d}s"

        progress_msg = (
            f"Fold {k}/{total_folds} completed in {_fmt_seconds(fold_elapsed)} | "
            f"Total elapsed: {_fmt_seconds(total_elapsed)} | "
            f"ETA: {_fmt_seconds(eta_seconds)} ({remaining_count} folds remaining) | "
            f"Model trades: {n_model_trades} (skipped: {m_skipped}) | "
            f"Sharpe: {m_sharpe if m_sharpe is not None else 'null (INSUFFICIENT_TRADES)'}"
        )
        print(progress_msg)
        logger.info(progress_msg)

    # Pooled Out-of-Sample Metrics computed from Daily Mark-to-Market Portfolio
    if earliest_test_date is None or latest_test_date is None:
        earliest_test_date = datetime.now(timezone.utc) - timedelta(days=90)
        latest_test_date = datetime.now(timezone.utc)

    all_oos_model_trades = [s for s, take in zip(all_oos_test_samples, all_oos_model_preds) if take == 1]
    _, pool_m_daily, pool_m_eq, pool_m_skipped = simulate_portfolio_mark_to_market(
        all_oos_model_trades,
        daily_closes_by_symbol,
        earliest_test_date,
        latest_test_date,
        max_concurrent_positions=10,
        position_size_frac=0.10,
        fee_per_side=fee,
    )
    _, pool_r_daily, pool_r_eq, pool_r_skipped = simulate_portfolio_mark_to_market(
        all_oos_test_samples,
        daily_closes_by_symbol,
        earliest_test_date,
        latest_test_date,
        max_concurrent_positions=10,
        position_size_frac=0.10,
        fee_per_side=fee,
    )
    _, pool_b_daily, pool_b_eq = compute_buy_and_hold_basket(
        daily_closes_by_symbol,
        earliest_test_date,
        latest_test_date,
        fee_per_side=fee,
    )
    btc_closes = daily_closes_by_symbol.get("BTCUSDT", {})
    _, pool_btc_daily, pool_btc_eq = compute_btc_only_buy_and_hold(
        btc_closes,
        earliest_test_date,
        latest_test_date,
    )

    pooled_trades_taken = len(all_oos_model_trades)
    pooled_m_sharpe = compute_daily_sharpe(pool_m_daily, annualization_factor=annualization_factor)
    pooled_r_sharpe = compute_daily_sharpe(pool_r_daily, annualization_factor=annualization_factor)
    pooled_b_sharpe = compute_daily_sharpe(pool_b_daily, annualization_factor=annualization_factor)
    pooled_btc_sharpe = compute_daily_sharpe(pool_btc_daily, annualization_factor=annualization_factor)
    pooled_m_dd = compute_max_drawdown(pool_m_eq)

    # 20-day block bootstrap on daily returns
    bootstrap_90_lb = block_bootstrap_sharpe_difference(
        model_daily_returns=pool_m_daily,
        bnh_daily_returns=pool_b_daily,
        block_length_days=20,
        n_bootstraps=1000,
        alpha=0.10,
        annualization_factor=annualization_factor,
    )

    positive_folds = sum(1 for r in fold_summaries if r["positive_pnl"])
    n_total_folds = len(fold_summaries)
    pos_folds_pct = (positive_folds / n_total_folds * 100.0) if n_total_folds > 0 else 0.0

    # Evaluate pre-registered success bar on portfolio
    machine_verdict, checks = evaluate_success_bar(
        pooled_trades=pooled_trades_taken,
        model_sharpe=pooled_m_sharpe,
        bnh_sharpe=pooled_b_sharpe,
        rule_sharpe=pooled_r_sharpe,
        bootstrap_90_lb=bootstrap_90_lb,
        positive_folds_pct=pos_folds_pct,
        max_drawdown_pct=pooled_m_dd,
        bar=settings.success_bar,
    )

    # Compute granular diagnostics across the 10 signal streams
    diagnostics = compute_diagnostics(
        test_samples=all_oos_test_samples,
        model_preds=all_oos_model_preds,
        win_probs=all_oos_win_probs,
        fee_round_trip=fee,
    )

    # Final holdout handling: guarded strictly
    holdout_report: dict[str, Any] = {"locked": True, "n_samples": len(final_holdout)}
    if allow_holdout:
        guard_holdout_access(allow_holdout=True, caller="run_walk_forward")
        h_scaler = fit_dataset_scaler(samples[: -len(final_holdout)], input_dim=input_dim)
        h_model = train_fold_model(
            samples[: -len(final_holdout)],
            scaler=h_scaler,
            input_dim=input_dim,
            epochs=train_epochs,
            device=device,
        )
        h_preds, _ = predict_test_fold(
            h_model,
            final_holdout,
            scaler=h_scaler,
            input_dim=input_dim,
            min_win_prob=min_win_prob,
            device=device,
        )
        holdout_report = {
            "locked": False,
            "n_samples": len(final_holdout),
            "trades_taken": sum(h_preds),
        }

    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": machine_verdict,
        "pre_registered_success_bar": checks,
        "n_folds": n_total_folds,
        "positive_folds": f"{positive_folds} of {n_total_folds}",
        "positive_folds_pct": round(pos_folds_pct, 1),
        "portfolio": {
            "max_concurrent_positions": 10,
            "position_size_frac": 0.10,
            "model_trades_taken": pooled_trades_taken,
            "model_skipped_signals": pool_m_skipped,
            "rule_skipped_signals": pool_r_skipped,
        },
        "pooled_oos": {
            "trades_taken": pooled_trades_taken,
            "annualized_sharpe": round(pooled_m_sharpe, 2),
            "bnh_basket_sharpe": round(pooled_b_sharpe, 2),
            "btc_only_sharpe": round(pooled_btc_sharpe, 2),
            "rule_sharpe": round(pooled_r_sharpe, 2),
            "max_drawdown_pct": round(pooled_m_dd, 1),
            "bootstrap_sharpe_diff_90_lower_bound": round(bootstrap_90_lb, 3),
        },
        "folds": fold_summaries,
        "diagnostics": diagnostics,
        "final_holdout": holdout_report,
    }

    # Format Markdown Table
    table_lines = [
        "| Fold | Test Range | Model Trades | Skipped | Win Rate | Return | Sharpe | Max DD | Basket B&H Sharpe | BTC B&H Sharpe | Rule Sharpe |",
        "|------|------------|--------------|---------|----------|--------|--------|--------|-------------------|----------------|-------------|",
    ]
    for r in fold_summaries:
        m = r["model"]
        b = r["buy_and_hold"]
        ro = r["rule_only"]
        sh_str = f"{m['annualized_sharpe']:.2f}" if m["annualized_sharpe"] is not None else "null"
        table_lines.append(
            f"| {r['fold']} | {r['test_from'][:10]} → {r['test_to'][:10]} | "
            f"{int(m['trades_taken'])} | {m.get('skipped_signals', 0)} | {m['win_rate']:.1%} | {m['avg_return_pct']:+.2f}% | "
            f"{sh_str} | {m['max_drawdown_pct']:.1f}% | "
            f"{b['annualized_sharpe']:.2f} | {b.get('btc_only_sharpe', 0.0):.2f} | {ro['annualized_sharpe']:.2f} |"
        )
    table_lines.append(
        f"| **POOLED** | **ALL OOS** | **{pooled_trades_taken}** | **{pool_m_skipped}** | "
        f"— | — | **{pooled_m_sharpe:.2f}** | **{pooled_m_dd:.1f}%** | "
        f"**{pooled_b_sharpe:.2f}** | **{pooled_btc_sharpe:.2f}** | **{pooled_r_sharpe:.2f}** |"
    )
    markdown_table = "\n".join(table_lines)
    report["markdown_table"] = markdown_table

    # Format Markdown Report
    md_content = f"""# QuantroApex Machine Learning Edge Report

**Machine Verdict**: `{machine_verdict}`  
**Generated At**: {report['generated_at']}  
**Positive Folds**: {report['positive_folds']} ({report['positive_folds_pct']}%)  
**Block Bootstrap 90% Lower Bound (Model - B&H Basket)**: {bootstrap_90_lb:+.3f}  

## Portfolio Structure
- 10 signal streams (BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT × 1h, 4h).
- Unified portfolio: 10 concurrent slots, fixed 10% equity per position.
- Daily mark-to-market returns (UTC close) for Strategy, Rule-Only, and Buy-and-Hold alike.
- Skipped signals due to full slots: {pool_m_skipped} (Model), {pool_r_skipped} (Rule-Only).
- Benchmarks: Equal-weight 5-coin basket rebalanced monthly with fees deducted; BTC-only benchmark reported for reference.

## Out-of-Sample Performance Table

{markdown_table}

## Pre-Registered Success Bar Evaluation
- Minimum Trades (>= 300): `{'PASSED' if checks['min_trades_passed'] else 'FAILED'}` ({pooled_trades_taken} trades)
- Sharpe Above Buy-and-Hold Basket: `{'PASSED' if checks['sharpe_above_bnh'] else 'FAILED'}` ({pooled_m_sharpe:.2f} vs {pooled_b_sharpe:.2f})
- Sharpe Above Rule-Only: `{'PASSED' if checks['sharpe_above_rule'] else 'FAILED'}` ({pooled_m_sharpe:.2f} vs {pooled_r_sharpe:.2f})
- Bootstrap 90% Lower Bound > 0: `{'PASSED' if checks['bootstrap_lb_passed'] else 'FAILED'}` ({bootstrap_90_lb:+.3f})
- Positive Folds >= 60%: `{'PASSED' if checks['positive_folds_passed'] else 'FAILED'}` ({pos_folds_pct:.1f}%)
- Max Drawdown > -35%: `{'PASSED' if checks['max_drawdown_passed'] else 'FAILED'}` ({pooled_m_dd:.1f}%)
"""

    out_json = os.path.join(checkpoint_dir, "walk_forward_report.json")
    out_md = os.path.join(checkpoint_dir, "report.md")

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(md_content)

    logger.success(f"Walk-forward report written to {out_json} and {out_md}")
    print("\n" + markdown_table + "\n")
    print(f"Machine Verdict: {machine_verdict}")
    print(f"Positive Folds: {report['positive_folds']}")
    print(f"Bootstrap 90% Lower Bound for (Model Sharpe - B&H Sharpe): {bootstrap_90_lb:+.3f}\n")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Purged Rolling Walk-forward evaluation")
    parser.add_argument("--checkpoint", type=str, default=None)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--min-win-prob", type=float, default=INFERENCE_MIN_WIN_PROB)
    parser.add_argument("--asset-class", type=str, default="CRYPTO")
    parser.add_argument("--strategy-id", type=str, default=None)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--parquet-dir", type=str, default=None)
    parser.add_argument("--checkpoint-dir", type=str, default="./checkpoints")
    parser.add_argument("--smoke", action="store_true", help="Fast CPU smoke test (2 folds)")
    parser.add_argument("--final-holdout", action="store_true", help="Unlock and audit final 6-month holdout")
    args = parser.parse_args()

    async def _run() -> None:
        await apply_schema()
        await run_walk_forward(
            checkpoint=args.checkpoint,
            train_epochs=args.epochs,
            min_win_prob=args.min_win_prob,
            asset_class=args.asset_class or None,
            strategy_id=args.strategy_id,
            n_folds=args.folds,
            parquet_dir=args.parquet_dir,
            checkpoint_dir=args.checkpoint_dir,
            smoke=args.smoke,
            allow_holdout=args.final_holdout,
        )
        await close_pool()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
