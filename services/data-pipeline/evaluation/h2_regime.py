"""
H2: Daily Regime Allocation Model Evaluation.

Hypothesis: A daily model deciding, per coin, "hold" or "cash" beats holding
the coins (equal-weight basket) and beats a simple 100-day SMA trend filter,
after realistic execution costs.

Universe: BTC, ETH, SOL, BNB, XRP (USDT). Daily bars at 00:00 UTC close, built
from existing 1h parquet. SOL from its listing date (2020-08-11).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
from loguru import logger
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# Reuse metrics and logging from evaluation modules
from evaluation.metrics import (
    compute_daily_sharpe,
    compute_max_drawdown,
    block_bootstrap_sharpe_difference,
    log_holdout_access,
)

PRE_REGISTERED_DOC_SHA = "a639adc0f5d5d779f70ae7b6038ab75208ee7754"
PRE_REGISTERED_DOC_PATH = "docs/ml_h2_success_bar.md"

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
ANNUALIZATION_FACTOR = 365.0
FEE_PER_SIDE = 0.0040  # 40 bps per side = 80 bps round-trip
SLEEVE_WEIGHT = 0.20   # 20% fixed sleeve per coin
MIN_HOLD_DAYS = 7      # Minimum days before switching state

FEATURE_COLUMNS = [
    "ret_1d",
    "ret_7d",
    "ret_30d",
    "ret_90d",
    "vol_30d",
    "dist_high_90d",
    "sma_ratio_50",
    "sma_ratio_200",
    "btc_ret_30d",
    "btc_ret_90d",
    "excess_ret_30d",
]

LIGHTGBM_PARAMS = {
    "num_leaves": 15,
    "learning_rate": 0.05,
    "n_estimators": 300,
    "min_child_samples": 50,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "random_state": 42,
    "n_jobs": 1,
    "verbose": -1,
}


def load_and_build_daily_bars(parquet_dir: Path | str) -> dict[str, pd.DataFrame]:
    """
    Build daily bars (00:00 to 23:00 UTC) from 1h spot Parquet history.
    Daily open = first bar open, high = max high, low = min low,
    close = last bar close, volume = sum volume.
    SOL starts from listing date (2020-08-11).
    """
    p_dir = Path(parquet_dir)
    daily_dfs: dict[str, pd.DataFrame] = {}

    for sym in SYMBOLS:
        p_candidates = list(p_dir.glob(f"{sym}_1h.parquet")) or list(p_dir.glob(f"{sym}_1H.parquet"))
        if not p_candidates:
            # Fallback search
            p_candidates = [f for f in p_dir.glob("*.parquet") if sym.upper() in f.name.upper() and "1H" in f.name.upper()]
        if not p_candidates:
            raise FileNotFoundError(f"Missing 1h parquet for {sym} in {p_dir}")

        df = pd.read_parquet(p_candidates[0])
        if df.empty:
            raise ValueError(f"Empty dataframe for {sym}")

        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
        df = df.sort_values("timestamp").reset_index(drop=True)

        # Resample strictly 1D at 00:00 UTC
        d = df.set_index("timestamp").resample("1D").agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }).dropna().reset_index()

        daily_dfs[sym] = d

    return daily_dfs


def compute_h2_features_and_labels(
    daily_dfs: dict[str, pd.DataFrame],
) -> dict[str, pd.DataFrame]:
    """
    Compute causal daily features and 7-day open-to-open forward labels.
    Features (all computed at day t close):
      1. ret_1d: (close_t - close_{t-1}) / close_{t-1}
      2. ret_7d: (close_t - close_{t-7}) / close_{t-7}
      3. ret_30d: (close_t - close_{t-30}) / close_{t-30}
      4. ret_90d: (close_t - close_{t-90}) / close_{t-90}
      5. vol_30d: 30-day realized volatility of daily close returns * sqrt(365)
      6. dist_high_90d: (close_t - max(high_{t-89:t})) / max(high_{t-89:t})
      7. sma_ratio_50: (close_t - SMA50(close)_t) / SMA50(close)_t
      8. sma_ratio_200: (close_t - SMA200(close)_t) / SMA200(close)_t
      9. btc_ret_30d: BTC's 30-day return at day t
      10. btc_ret_90d: BTC's 90-day return at day t
      11. excess_ret_30d: coin ret_30d minus mean ret_30d of active basket at day t
    Label (computed at day t close):
      1 if (open_{t+8} - open_{t+1}) / open_{t+1} > 0.0080 (80 bps) else 0.
    """
    # 1. BTC return maps
    btc_df = daily_dfs["BTCUSDT"].copy()
    btc_df["btc_ret_30d"] = btc_df["close"].pct_change(30)
    btc_df["btc_ret_90d"] = btc_df["close"].pct_change(90)
    btc_map_30 = dict(zip(btc_df["timestamp"], btc_df["btc_ret_30d"]))
    btc_map_90 = dict(zip(btc_df["timestamp"], btc_df["btc_ret_90d"]))

    # 2. Daily 30d return per coin to build basket mean
    all_ret_30: dict[str, dict[datetime, float]] = {}
    for sym, d in daily_dfs.items():
        ret30_s = d["close"].pct_change(30)
        all_ret_30[sym] = dict(zip(d["timestamp"], ret30_s))

    dates_all = sorted(list(set().union(*[d["timestamp"] for d in daily_dfs.values()])))
    basket_mean_30: dict[datetime, float] = {}
    for dt in dates_all:
        vals = [all_ret_30[s][dt] for s in SYMBOLS if dt in all_ret_30[s] and pd.notna(all_ret_30[s][dt])]
        basket_mean_30[dt] = float(np.mean(vals)) if vals else np.nan

    # 3. Features & forward label per coin
    featured_dfs: dict[str, pd.DataFrame] = {}
    for sym, d in daily_dfs.items():
        df = d.copy()
        df["symbol"] = sym

        # Returns
        df["ret_1d"] = df["close"].pct_change(1)
        df["ret_7d"] = df["close"].pct_change(7)
        df["ret_30d"] = df["close"].pct_change(30)
        df["ret_90d"] = df["close"].pct_change(90)

        # Realized volatility (std of daily close returns over last 30 bars * sqrt(365))
        df["vol_30d"] = df["ret_1d"].rolling(30).std(ddof=1) * np.sqrt(ANNUALIZATION_FACTOR)

        # Distance from 90-day high (always <= 0.0)
        high_90 = df["high"].rolling(90).max()
        df["dist_high_90d"] = (df["close"] - high_90) / high_90

        # Moving average ratios
        sma50 = df["close"].rolling(50).mean()
        df["sma_ratio_50"] = (df["close"] - sma50) / sma50

        sma100 = df["close"].rolling(100).mean()
        df["sma100"] = sma100

        sma200 = df["close"].rolling(200).mean()
        df["sma_ratio_200"] = (df["close"] - sma200) / sma200

        # Market & basket relative features
        df["btc_ret_30d"] = df["timestamp"].map(btc_map_30)
        df["btc_ret_90d"] = df["timestamp"].map(btc_map_90)
        df["excess_ret_30d"] = df["ret_30d"] - df["timestamp"].map(basket_mean_30)

        # Forward 7-day open-to-open return: entry at t+1 open, exit at t+8 open
        df["fwd_open_entry"] = df["open"].shift(-1)
        df["fwd_open_exit"] = df["open"].shift(-8)
        df["fwd_7d_ret"] = (df["fwd_open_exit"] - df["fwd_open_entry"]) / df["fwd_open_entry"]

        # Label: 1 if fwd return > 0.0080, else 0 (NaN if exit beyond dataset)
        df["label"] = np.where(
            df["fwd_7d_ret"].isna(),
            np.nan,
            (df["fwd_7d_ret"] > 0.0080).astype(float),
        )

        featured_dfs[sym] = df

    return featured_dfs


def build_h2_fold_schedule(
    daily_dfs: dict[str, pd.DataFrame],
    train_days: int = 365,
    test_days: int = 90,
    step_days: int = 90,
    holdout_days: int = 180,
    purge_days: int = 7,
    embargo_days: int = 1,
) -> tuple[list[dict[str, Any]], datetime]:
    """
    Build 12-month rolling train, 3-month test, 3-month step schedule.
    Holdout is strictly the final 180 days (same holdout cutoff as H1).
    Purge: labels whose 7-day window reaches test start (plus 1-day embargo)
    are purged -> effective train end is at least 8 days prior to test start.
    """
    btc = daily_dfs["BTCUSDT"]
    all_dates = sorted(btc["timestamp"].tolist())

    # Require 200 days warmup for 200-day SMA
    first_valid_date = all_dates[200]
    last_date = all_dates[-1]

    holdout_cutoff = last_date - timedelta(days=holdout_days)

    folds: list[dict[str, Any]] = []
    cur_train_start = first_valid_date

    while True:
        cur_train_end = cur_train_start + timedelta(days=train_days)
        cur_test_start = cur_train_end
        cur_test_end = cur_test_start + timedelta(days=test_days)

        if cur_test_end > holdout_cutoff:
            break

        eff_train_end = cur_test_start - timedelta(days=purge_days + embargo_days)

        folds.append({
            "fold": len(folds) + 1,
            "train_start": cur_train_start,
            "train_end": cur_train_end,
            "eff_train_end": eff_train_end,
            "test_start": cur_test_start,
            "test_end": cur_test_end,
        })

        cur_train_start += timedelta(days=step_days)

    return folds, holdout_cutoff


def simulate_daily_portfolio(
    featured_dfs: dict[str, pd.DataFrame],
    decisions_df: pd.DataFrame,
    start_date: datetime,
    end_date: datetime,
    fee_per_side: float = FEE_PER_SIDE,
    sleeve_weight: float = SLEEVE_WEIGHT,
    min_hold_days: int = MIN_HOLD_DAYS,
    initial_equity: float = 100000.0,
) -> dict[str, Any]:
    """
    Daily mark-to-market portfolio simulation.
    Positions: each coin is a fixed 20% sleeve, either held or in cash (0% yield).
    Decide at daily close (day t-1), execute at next day's open (day t).
    State switch constraint: a coin must stay in a state for >= 7 days before switching.
    Costs:
      - 0.40% per side (80 bps round-trip) on every state switch.
      - 0.40% per side on monthly sleeve rebalancing on the 1st of each month.
    """
    # Create indexed lookup for rapid row retrieval
    sym_rows: dict[str, dict[datetime, dict[str, float]]] = {}
    for sym, df in featured_dfs.items():
        sym_rows[sym] = {}
        for _, r in df.iterrows():
            sym_rows[sym][r["timestamp"]] = {
                "open": float(r["open"]),
                "close": float(r["close"]),
            }

    # Unique sorted dates in [start_date, end_date)
    all_dates = sorted([
        d for d in featured_dfs["BTCUSDT"]["timestamp"].tolist()
        if start_date <= d < end_date
    ])
    if not all_dates:
        return {
            "dates": [],
            "daily_returns": np.array([], dtype=np.float64),
            "equity_curve": np.array([], dtype=np.float64),
            "switches": 0,
            "switches_by_symbol": {s: 0 for s in SYMBOLS},
            "sharpe": 0.0,
            "max_drawdown": 0.0,
            "cagr": 0.0,
        }

    # Initial state
    current_equity = initial_equity
    sleeve_values: dict[str, float] = {s: current_equity * sleeve_weight for s in SYMBOLS}
    current_states: dict[str, str] = {s: "CASH" for s in SYMBOLS}
    days_in_state: dict[str, int] = {s: min_hold_days for s in SYMBOLS}  # eligible to enter immediately
    switches_by_symbol: dict[str, int] = {s: 0 for s in SYMBOLS}

    daily_returns: list[float] = []
    equity_curve: list[float] = []
    sim_dates: list[datetime] = []

    prev_month = -1
    prev_close_px: dict[str, float | None] = {s: None for s in SYMBOLS}

    # Decision map: decisions_df has columns [timestamp, symbol, target_state]
    # Decision made at close of day t-1 is keyed by (t-1, symbol)
    decision_map: dict[tuple[datetime, str], str] = {}
    if not decisions_df.empty:
        for _, r in decisions_df.iterrows():
            decision_map[(r["timestamp"], r["symbol"])] = r["target_state"]

    for d_idx, cur_date in enumerate(all_dates):
        prev_equity = current_equity
        sim_dates.append(cur_date)

        # 1. Monthly Sleeve Rebalance (1st calendar day of each month)
        if cur_date.month != prev_month:
            prev_month = cur_date.month
            tot_val = sum(sleeve_values.values())
            target_per_sleeve = tot_val * sleeve_weight

            for sym in SYMBOLS:
                cur_val = sleeve_values[sym]
                delta = abs(cur_val - target_per_sleeve)
                if current_states[sym] == "HOLD" and delta > 0:
                    fee = delta * fee_per_side
                    sleeve_values[sym] = target_per_sleeve - fee
                else:
                    sleeve_values[sym] = target_per_sleeve

        # 2. State switches at open of day cur_date (based on decision at previous day's close)
        prev_date = all_dates[d_idx - 1] if d_idx > 0 else (cur_date - timedelta(days=1))
        for sym in SYMBOLS:
            # Coin active check (e.g. SOL before listing)
            if cur_date not in sym_rows[sym]:
                # Coin unlisted: sleeve forced in cash
                current_states[sym] = "CASH"
                continue

            target_state = decision_map.get((prev_date, sym), current_states[sym])
            if target_state != current_states[sym]:
                if days_in_state[sym] >= min_hold_days:
                    # Switch executed at cur_date open
                    fee = sleeve_values[sym] * fee_per_side
                    sleeve_values[sym] -= fee
                    current_states[sym] = target_state
                    days_in_state[sym] = 1
                    switches_by_symbol[sym] += 1
                else:
                    days_in_state[sym] += 1
            else:
                days_in_state[sym] += 1

        # 3. Mark to market across day cur_date
        for sym in SYMBOLS:
            if cur_date not in sym_rows[sym]:
                # Inactive coin earns 0%
                continue

            o_px = sym_rows[sym][cur_date]["open"]
            c_px = sym_rows[sym][cur_date]["close"]
            p_close = prev_close_px[sym]

            state = current_states[sym]
            if state == "CASH":
                # Stays in cash, 0% return
                pass
            elif state == "HOLD":
                if p_close is None or days_in_state[sym] == 1:
                    # Entered today at open -> marked from open to close
                    ret = (c_px - o_px) / o_px if o_px > 0 else 0.0
                else:
                    # Held continuously -> marked from previous close to today's close
                    ret = (c_px - p_close) / p_close if p_close > 0 else 0.0
                sleeve_values[sym] *= (1.0 + ret)

            prev_close_px[sym] = c_px

        current_equity = sum(sleeve_values.values())
        day_ret = (current_equity - prev_equity) / prev_equity if prev_equity > 0 else 0.0
        daily_returns.append(day_ret)
        equity_curve.append(current_equity)

    arr_ret = np.array(daily_returns, dtype=np.float64)
    arr_eq = np.array(equity_curve, dtype=np.float64)

    sharpe = compute_daily_sharpe(arr_ret, annualization_factor=ANNUALIZATION_FACTOR) or 0.0
    max_dd = compute_max_drawdown(arr_eq)
    n_days = len(arr_ret)
    total_ret = (arr_eq[-1] / initial_equity) - 1.0 if len(arr_eq) > 0 else 0.0
    cagr = ((arr_eq[-1] / initial_equity) ** (365.0 / max(n_days, 1))) - 1.0 if (len(arr_eq) > 0 and arr_eq[-1] > 0) else 0.0

    return {
        "dates": sim_dates,
        "daily_returns": arr_ret,
        "equity_curve": arr_eq,
        "total_return": total_ret,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
        "cagr": cagr,
        "switches": sum(switches_by_symbol.values()),
        "switches_by_symbol": switches_by_symbol,
    }


def run_h2_walk_forward(
    parquet_dir: str | Path = "./data",
    output_dir: str | Path = "./reports",
    allow_holdout: bool = False,
    plan_only: bool = False,
) -> dict[str, Any]:
    """Execute complete H2 Daily Regime Allocation Walk-Forward."""
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Build daily bars from 1h parquets
    daily_dfs = load_and_build_daily_bars(parquet_dir)

    # 2. Extract features and labels
    featured_dfs = compute_h2_features_and_labels(daily_dfs)

    # 3. Build fold schedule
    folds, holdout_cutoff = build_h2_fold_schedule(daily_dfs)

    # Fold plan display
    print("=" * 80)
    print(f"H2 PLANNED FOLD SCHEDULE: {len(folds)} Total Rolling Folds")
    print(f"Pre-Registered Spec SHA: {PRE_REGISTERED_DOC_SHA}")
    print(f"Holdout Cutoff: {holdout_cutoff.date()} (Final 180 days locked behind --final-holdout)")
    print("=" * 80)
    print("| Fold | Train Window | Eff Train End | Test Window | Purged Window |")
    print("|------|--------------|---------------|-------------|---------------|")
    for f in folds:
        print(f"| {f['fold']} | {f['train_start'].date()} → {f['train_end'].date()} | {f['eff_train_end'].date()} | {f['test_start'].date()} → {f['test_end'].date()} | 8 days ({f['eff_train_end'].date()} to {f['test_start'].date()}) |")
    print("=" * 80)

    if plan_only:
        return {
            "mode": "PLAN_ONLY",
            "folds_count": len(folds),
            "holdout_cutoff": holdout_cutoff.isoformat(),
            "pre_registered_sha": PRE_REGISTERED_DOC_SHA,
        }

    # Combined dataframe for fast train slicing
    all_rows = pd.concat([featured_dfs[s] for s in SYMBOLS], ignore_index=True)

    # Storage for per-fold results
    fold_results: list[dict[str, Any]] = []

    # Daily returns collector across all out-of-sample days
    model_oos_rets: list[float] = []
    sma_oos_rets: list[float] = []
    basket_oos_rets: list[float] = []
    btc_oos_rets: list[float] = []
    sanity_lr_oos_rets: list[float] = []

    total_model_switches = 0
    total_sma_switches = 0

    feature_importances: dict[str, list[float]] = {f: [] for f in FEATURE_COLUMNS}
    calibration_records: list[dict[str, float]] = []

    # Execute each fold
    for f in folds:
        fold_num = f["fold"]
        tr_start = f["train_start"]
        eff_tr_end = f["eff_train_end"]
        te_start = f["test_start"]
        te_end = f["test_end"]

        # Training data: [tr_start, eff_tr_end] (strictly purged)
        tr_mask = (all_rows["timestamp"] >= tr_start) & (all_rows["timestamp"] <= eff_tr_end)
        tr_df = all_rows[tr_mask].dropna(subset=FEATURE_COLUMNS + ["label"]).reset_index(drop=True)

        X_train = tr_df[FEATURE_COLUMNS].values
        y_train = tr_df["label"].values.astype(int)

        # 1. Fit LightGBM
        clf = lgb.LGBMClassifier(**LIGHTGBM_PARAMS)
        clf.fit(X_train, y_train)

        # Record feature importance (gain)
        imp = clf.feature_importances_
        for f_name, f_val in zip(FEATURE_COLUMNS, imp):
            feature_importances[f_name].append(float(f_val))

        # 2. Fit Sanity Logistic Regression
        lr = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000, random_state=42))
        lr.fit(X_train, y_train)

        # 3. Out-of-sample decisions: [te_start - 1 day, te_end]
        # Decisions needed at close of day t-1 for day t
        eval_start = te_start - timedelta(days=1)
        te_mask = (all_rows["timestamp"] >= eval_start) & (all_rows["timestamp"] < te_end)
        te_df = all_rows[te_mask].dropna(subset=FEATURE_COLUMNS).copy()

        # Model decision: p >= 0.5 -> HOLD else CASH
        preds_prob = clf.predict_proba(te_df[FEATURE_COLUMNS].values)[:, 1]
        te_df["model_prob"] = preds_prob
        te_df["model_target"] = np.where(preds_prob >= 0.5, "HOLD", "CASH")

        # Record calibration data if ground-truth label is available
        for _, r in te_df.iterrows():
            if pd.notna(r.get("label")):
                calibration_records.append({
                    "prob": float(r["model_prob"]),
                    "label": float(r["label"]),
                })

        # Sanity LR decision
        lr_prob = lr.predict_proba(te_df[FEATURE_COLUMNS].values)[:, 1]
        te_df["lr_target"] = np.where(lr_prob >= 0.5, "HOLD", "CASH")

        # SMA filter decision: close > sma100 -> HOLD else CASH
        te_df["sma_target"] = np.where(te_df["close"] > te_df["sma100"], "HOLD", "CASH")

        # Basket decision: always HOLD
        te_df["basket_target"] = "HOLD"

        # Separate decision dataframes
        decisions_model = te_df[["timestamp", "symbol", "model_target"]].rename(columns={"model_target": "target_state"})
        decisions_sma = te_df[["timestamp", "symbol", "sma_target"]].rename(columns={"sma_target": "target_state"})
        decisions_basket = te_df[["timestamp", "symbol", "basket_target"]].rename(columns={"basket_target": "target_state"})
        decisions_lr = te_df[["timestamp", "symbol", "lr_target"]].rename(columns={"lr_target": "target_state"})

        # Simulate Fold Out-of-Sample Portfolios
        sim_model = simulate_daily_portfolio(featured_dfs, decisions_model, te_start, te_end)
        sim_sma = simulate_daily_portfolio(featured_dfs, decisions_sma, te_start, te_end)
        sim_basket = simulate_daily_portfolio(featured_dfs, decisions_basket, te_start, te_end)
        sim_lr = simulate_daily_portfolio(featured_dfs, decisions_lr, te_start, te_end)

        # BTC Buy and Hold benchmark
        btc_dates = sorted([d for d in daily_dfs["BTCUSDT"]["timestamp"] if te_start <= d < te_end])
        btc_rows = daily_dfs["BTCUSDT"].set_index("timestamp").loc[btc_dates]
        btc_rets = btc_rows["close"].pct_change().fillna(0.0).values
        btc_sharpe = compute_daily_sharpe(btc_rets, annualization_factor=ANNUALIZATION_FACTOR) or 0.0
        btc_tot_ret = (btc_rows["close"].iloc[-1] / btc_rows["close"].iloc[0]) - 1.0 if len(btc_rows) > 0 else 0.0
        btc_max_dd = compute_max_drawdown(np.cumprod(1.0 + btc_rets))

        # Accumulate pooled daily returns
        model_oos_rets.extend(sim_model["daily_returns"].tolist())
        sma_oos_rets.extend(sim_sma["daily_returns"].tolist())
        basket_oos_rets.extend(sim_basket["daily_returns"].tolist())
        btc_oos_rets.extend(btc_rets.tolist())
        sanity_lr_oos_rets.extend(sim_lr["daily_returns"].tolist())

        total_model_switches += sim_model["switches"]
        total_sma_switches += sim_sma["switches"]

        fold_results.append({
            "fold": fold_num,
            "test_range": f"{te_start.date()} → {te_end.date()}",
            "model_sharpe": round(float(sim_model["sharpe"]), 2),
            "model_return_pct": round(float(sim_model["total_return"] * 100.0), 2),
            "model_max_dd_pct": round(float(sim_model["max_drawdown"]), 2),
            "model_switches": sim_model["switches"],
            "sma_sharpe": round(float(sim_sma["sharpe"]), 2),
            "sma_return_pct": round(float(sim_sma["total_return"] * 100.0), 2),
            "sma_max_dd_pct": round(float(sim_sma["max_drawdown"]), 2),
            "sma_switches": sim_sma["switches"],
            "basket_sharpe": round(float(sim_basket["sharpe"]), 2),
            "basket_return_pct": round(float(sim_basket["total_return"] * 100.0), 2),
            "basket_max_dd_pct": round(float(sim_basket["max_drawdown"]), 2),
            "btc_sharpe": round(float(btc_sharpe), 2),
            "btc_return_pct": round(float(btc_tot_ret * 100.0), 2),
            "btc_max_dd_pct": round(float(btc_max_dd), 2),
            "sanity_lr_sharpe": round(float(sim_lr["sharpe"]), 2),
        })

    # Pooled Out-of-Sample Metrics
    arr_m = np.array(model_oos_rets, dtype=np.float64)
    arr_s = np.array(sma_oos_rets, dtype=np.float64)
    arr_b = np.array(basket_oos_rets, dtype=np.float64)
    arr_btc = np.array(btc_oos_rets, dtype=np.float64)
    arr_lr = np.array(sanity_lr_oos_rets, dtype=np.float64)

    pooled_model_sharpe = compute_daily_sharpe(arr_m, annualization_factor=ANNUALIZATION_FACTOR) or 0.0
    pooled_sma_sharpe = compute_daily_sharpe(arr_s, annualization_factor=ANNUALIZATION_FACTOR) or 0.0
    pooled_basket_sharpe = compute_daily_sharpe(arr_b, annualization_factor=ANNUALIZATION_FACTOR) or 0.0
    pooled_btc_sharpe = compute_daily_sharpe(arr_btc, annualization_factor=ANNUALIZATION_FACTOR) or 0.0
    pooled_lr_sharpe = compute_daily_sharpe(arr_lr, annualization_factor=ANNUALIZATION_FACTOR) or 0.0

    eq_m = np.cumprod(1.0 + arr_m)
    eq_s = np.cumprod(1.0 + arr_s)
    eq_b = np.cumprod(1.0 + arr_b)
    eq_btc = np.cumprod(1.0 + arr_btc)
    eq_lr = np.cumprod(1.0 + arr_lr)

    pooled_model_dd = compute_max_drawdown(eq_m)
    pooled_sma_dd = compute_max_drawdown(eq_s)
    pooled_basket_dd = compute_max_drawdown(eq_b)
    pooled_btc_dd = compute_max_drawdown(eq_btc)

    total_days = len(arr_m)
    total_months = max(total_days / 30.0, 1.0)
    switches_per_coin_per_month = total_model_switches / (total_months * len(SYMBOLS))

    # 20-Day Block Bootstrap: Model vs Basket
    bootstrap_lb_model = block_bootstrap_sharpe_difference(
        model_daily_returns=arr_m,
        bnh_daily_returns=arr_b,
        block_length_days=20,
        n_bootstraps=1000,
        alpha=0.10,
        annualization_factor=ANNUALIZATION_FACTOR,
        seed=42,
    )

    # Bootstrap: SMA vs Basket (diagnostic)
    bootstrap_lb_sma = block_bootstrap_sharpe_difference(
        model_daily_returns=arr_s,
        bnh_daily_returns=arr_b,
        block_length_days=20,
        n_bootstraps=1000,
        alpha=0.10,
        annualization_factor=ANNUALIZATION_FACTOR,
        seed=42,
    )

    # Positive relative folds count (Model Sharpe > Basket Sharpe)
    positive_folds_count = sum(1 for f in fold_results if f["model_sharpe"] > f["basket_sharpe"])
    positive_folds_pct = (positive_folds_count / len(fold_results)) * 100.0 if fold_results else 0.0

    # Drawdown difference (model shallower than basket by at least 15 percentage points)
    # e.g. model -51.7% vs basket -79.4% -> diff = (-51.7) - (-79.4) = +27.7 pp >= 15.0 pp
    dd_diff = pooled_model_dd - pooled_basket_dd
    dd_shallower_passed = bool(dd_diff >= 15.0)

    # Success bar evaluation
    pass_sharpe_basket = bool(pooled_model_sharpe > pooled_basket_sharpe)
    pass_sharpe_sma = bool(pooled_model_sharpe > pooled_sma_sharpe)
    pass_bootstrap_lb = bool(bootstrap_lb_model > 0.0)
    pass_positive_folds = bool(positive_folds_pct >= 50.0)
    pass_turnover = bool(switches_per_coin_per_month <= 4.0)

    # Machine Verdict
    if total_model_switches < 100:
        verdict = "INSUFFICIENT_DATA"
    elif (
        pass_sharpe_basket
        and pass_sharpe_sma
        and pass_bootstrap_lb
        and dd_shallower_passed
        and pass_positive_folds
        and pass_turnover
    ):
        verdict = "EDGE_SUPPORTED"
    else:
        verdict = "NO_EVIDENCE_OF_EDGE"

    # SMA alone diagnostic
    sma_pass_basket = bool(pooled_sma_sharpe > pooled_basket_sharpe)
    sma_pass_bootstrap = bool(bootstrap_lb_sma > 0.0)
    sma_dd_diff = pooled_sma_dd - pooled_basket_dd
    sma_dd_pass = bool(sma_dd_diff >= 15.0)
    trend_filter_supported = bool(sma_pass_basket and sma_pass_bootstrap and sma_dd_pass)

    # Feature Importance aggregation
    mean_importance = {
        k: float(np.mean(vals)) if vals else 0.0
        for k, vals in feature_importances.items()
    }
    sorted_importance = sorted(mean_importance.items(), key=lambda x: x[1], reverse=True)

    # Model Calibration Buckets
    calib_df = pd.DataFrame(calibration_records)
    calibration_buckets = []
    if not calib_df.empty:
        bins = [0.0, 0.40, 0.48, 0.52, 0.60, 1.0]
        calib_df["bucket"] = pd.cut(calib_df["prob"], bins=bins)
        for b_name, grp in calib_df.groupby("bucket", observed=False):
            if len(grp) > 0:
                calibration_buckets.append({
                    "bucket": str(b_name),
                    "count": len(grp),
                    "mean_prob": round(float(grp["prob"].mean()), 3),
                    "realized_win_rate": round(float(grp["label"].mean()), 3),
                })

    # Markdown Table Construction
    md_lines = [
        "| Fold | Test Range | Model Sharpe | Model Ret | Model MaxDD | Switches | SMA Sharpe | SMA Ret | SMA MaxDD | Switches | Basket Sharpe | Basket Ret | Basket MaxDD | BTC Sharpe | BTC Ret | BTC MaxDD |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in fold_results:
        md_lines.append(
            f"| {r['fold']} | {r['test_range']} | {r['model_sharpe']:.2f} | {r['model_return_pct']:+.2f}% | {r['model_max_dd_pct']:.1f}% | {r['model_switches']} "
            f"| {r['sma_sharpe']:.2f} | {r['sma_return_pct']:+.2f}% | {r['sma_max_dd_pct']:.1f}% | {r['sma_switches']} "
            f"| {r['basket_sharpe']:.2f} | {r['basket_return_pct']:+.2f}% | {r['basket_max_dd_pct']:.1f}% "
            f"| {r['btc_sharpe']:.2f} | {r['btc_return_pct']:+.2f}% | {r['btc_max_dd_pct']:.1f}% |"
        )
    md_lines.append(
        f"| **POOLED** | **ALL OOS** | **{pooled_model_sharpe:.2f}** | **{((eq_m[-1]-1)*100):+.2f}%** | **{pooled_model_dd:.1f}%** | **{total_model_switches}** "
        f"| **{pooled_sma_sharpe:.2f}** | **{((eq_s[-1]-1)*100):+.2f}%** | **{pooled_sma_dd:.1f}%** | **{total_sma_switches}** "
        f"| **{pooled_basket_sharpe:.2f}** | **{((eq_b[-1]-1)*100):+.2f}%** | **{pooled_basket_dd:.1f}%** "
        f"| **{pooled_btc_sharpe:.2f}** | **{((eq_btc[-1]-1)*100):+.2f}%** | **{pooled_btc_dd:.1f}%** |"
    )
    table_md = "\n".join(md_lines)

    report = {
        "hypothesis": "H2: Daily Regime Allocation Model",
        "pre_registered_doc_sha": PRE_REGISTERED_DOC_SHA,
        "pre_registered_doc_path": PRE_REGISTERED_DOC_PATH,
        "verdict": verdict,
        "trend_filter_supported": trend_filter_supported,
        "total_folds": len(fold_results),
        "positive_folds": f"{positive_folds_count} of {len(fold_results)}",
        "positive_folds_pct": round(positive_folds_pct, 1),
        "pooled_metrics": {
            "model_sharpe": round(float(pooled_model_sharpe), 3),
            "model_max_drawdown": round(float(pooled_model_dd), 3),
            "model_total_return": round(float(eq_m[-1] - 1.0), 3),
            "model_cagr": round(float(((eq_m[-1]) ** (365.0 / total_days)) - 1.0), 3),
            "sma_sharpe": round(float(pooled_sma_sharpe), 3),
            "sma_max_drawdown": round(float(pooled_sma_dd), 3),
            "basket_sharpe": round(float(pooled_basket_sharpe), 3),
            "basket_max_drawdown": round(float(pooled_basket_dd), 3),
            "btc_sharpe": round(float(pooled_btc_sharpe), 3),
            "sanity_lr_sharpe": round(float(pooled_lr_sharpe), 3),
            "total_switches": total_model_switches,
            "switches_per_coin_per_month": round(float(switches_per_coin_per_month), 2),
            "bootstrap_90_lower_bound": round(float(bootstrap_lb_model), 3),
        },
        "success_bar_checks": {
            "sharpe_above_basket": pass_sharpe_basket,
            "sharpe_above_sma": pass_sharpe_sma,
            "bootstrap_lower_bound_gt_zero": pass_bootstrap_lb,
            "max_dd_15pp_shallower": dd_shallower_passed,
            "positive_folds_ge_50pct": pass_positive_folds,
            "switches_le_4_per_month": pass_turnover,
            "total_switches_ge_100": bool(total_model_switches >= 100),
        },
        "feature_importance_gain": sorted_importance,
        "calibration": calibration_buckets,
        "fold_results": fold_results,
        "markdown_table": table_md,
    }

    # Write report files
    json_path = out_dir / "h2_report.json"
    md_path = out_dir / "h2_report.md"

    with open(json_path, "w") as f:
        json.dump(report, f, indent=2)

    with open(md_path, "w") as f:
        f.write(f"# H2 Daily Regime Allocation Walk-Forward Report\n\n")
        f.write(f"- **Pre-Registered Success Bar SHA**: `{PRE_REGISTERED_DOC_SHA}`\n")
        f.write(f"- **Machine Verdict**: **`{verdict}`**\n")
        f.write(f"- **Trend Filter Supported (SMA Baseline Alone)**: **`{trend_filter_supported}`**\n")
        f.write(f"- **Folds with Model Sharpe > Basket Sharpe**: {positive_folds_count} of {len(fold_results)} ({positive_folds_pct:.1f}%)\n")
        f.write(f"- **Total Switches Across All Coins**: {total_model_switches} ({switches_per_coin_per_month:.2f} switches/coin/month)\n\n")
        f.write("## Walk-Forward Out-of-Sample Performance Table\n\n")
        f.write(table_md + "\n\n")
        f.write("## Pre-Registered Success Bar Evaluation\n\n")
        f.write(f"| Criterion | Required Bar | Realised Value | Result |\n")
        f.write(f"|---|---|---|---|\n")
        f.write(f"| Model Sharpe > Basket Sharpe | > {pooled_basket_sharpe:.2f} | {pooled_model_sharpe:.2f} | {'PASSED' if pass_sharpe_basket else 'FAILED'} |\n")
        f.write(f"| Model Sharpe > SMA-Filter Sharpe | > {pooled_sma_sharpe:.2f} | {pooled_model_sharpe:.2f} | {'PASSED' if pass_sharpe_sma else 'FAILED'} |\n")
        f.write(f"| 20-Day Block Bootstrap 90% LB | > 0.0 | {bootstrap_lb_model:+.3f} | {'PASSED' if pass_bootstrap_lb else 'FAILED'} |\n")
        f.write(f"| MaxDD >= 15pp Shallower than Basket | >= +15.0pp | {dd_diff:+.1f}pp ({pooled_model_dd:.1f}% vs {pooled_basket_dd:.1f}%) | {'PASSED' if dd_shallower_passed else 'FAILED'} |\n")
        f.write(f"| Positive Folds vs Basket | >= 50.0% | {positive_folds_pct:.1f}% ({positive_folds_count}/{len(fold_results)}) | {'PASSED' if pass_positive_folds else 'FAILED'} |\n")
        f.write(f"| Average Switches per Coin/Month | <= 4.0 | {switches_per_coin_per_month:.2f} | {'PASSED' if pass_turnover else 'FAILED'} |\n\n")
        f.write("## Feature Importance (LightGBM)\n\n")
        f.write("| Feature | Importance (Gain) |\n")
        f.write("|---|---|\n")
        for f_name, imp_val in sorted_importance:
            f.write(f"| `{f_name}` | {imp_val:.1f} |\n")
        f.write("\n## Model Calibration (Predicted Probability vs Realised 7d Win Rate)\n\n")
        f.write("| Bucket | Samples | Mean Pred Prob | Realised Win Rate |\n")
        f.write("|---|---|---|---|\n")
        for cb in calibration_buckets:
            f.write(f"| {cb['bucket']} | {cb['count']} | {cb['mean_prob']:.3f} | {cb['realized_win_rate']*100:.1f}% |\n")
        f.write("\n## Sanity Check: LightGBM vs Logistic Regression\n\n")
        f.write(f"- LightGBM Pooled Sharpe: **{pooled_model_sharpe:.2f}**\n")
        f.write(f"- Logistic Regression Pooled Sharpe: **{pooled_lr_sharpe:.2f}**\n")

    logger.success(f"H2 Report written to {json_path} and {md_path}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="H2 Daily Regime Allocation Walk-Forward")
    parser.add_argument("--parquet-dir", type=str, default="./services/data-pipeline/data")
    parser.add_argument("--output-dir", type=str, default="./checkpoints")
    parser.add_argument("--plan-only", action="store_true", help="Stop after building fold schedule and exit")
    parser.add_argument("--final-holdout", action="store_true", help="Unlock final 180-day holdout")
    args = parser.parse_args()

    if args.final_holdout:
        log_holdout_access("H2 final 180-day holdout accessed via CLI --final-holdout flag")

    report = run_h2_walk_forward(
        parquet_dir=args.parquet_dir,
        output_dir=args.output_dir,
        allow_holdout=args.final_holdout,
        plan_only=args.plan_only,
    )

    if not args.plan_only:
        print("\n" + "=" * 80)
        print(f"H2 MACHINE VERDICT: {report['verdict']}")
        print(f"Trend Filter Supported: {report['trend_filter_supported']}")
        print("=" * 80 + "\n")
        print(report["markdown_table"])


if __name__ == "__main__":
    main()
