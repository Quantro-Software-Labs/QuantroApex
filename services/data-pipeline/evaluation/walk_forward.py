"""
Walk-forward validation — rolling calendar windows.

Default window: 6 weeks total (train weeks 1–4, test weeks 5–6), slide
forward by 2 weeks. Reports whether gated Global Brain paper PnL is
positive more often than not — required by the live-inference decision gate.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from loguru import logger

from config import get_settings
from inference.policy import DECISION_GATE, INFERENCE_MIN_WIN_PROB
from storage.timescale import TimescaleReader, apply_schema, close_pool
from training.evaluate import (
    DEFAULT_FEE,
    GlobalBrainEvaluator,
    _entry_time_key,
    baseline_ema_trend,
)
from training.sequences import attach_feature_sequences, filter_sequence_ready


def _as_utc(t: datetime) -> datetime:
    if t.tzinfo is None:
        return t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc)


def calendar_windows(
    samples: list[dict[str, Any]],
    *,
    train_weeks: int = 4,
    test_weeks: int = 2,
    step_weeks: int = 2,
) -> list[dict[str, Any]]:
    """
    Build sliding calendar windows over sample entry_time span.

    Each window: train = [start, start+train_weeks), test = [train_end, train_end+test_weeks).
    """
    ordered = sorted(samples, key=_entry_time_key)
    if len(ordered) < 100:
        raise ValueError(f"Need >= 100 samples, got {len(ordered)}")

    t_min = _as_utc(_entry_time_key(ordered[0]))
    t_max = _as_utc(_entry_time_key(ordered[-1]))
    train_delta = timedelta(weeks=train_weeks)
    test_delta = timedelta(weeks=test_weeks)
    step_delta = timedelta(weeks=step_weeks)
    window_span = train_delta + test_delta

    windows: list[dict[str, Any]] = []
    start = t_min
    idx = 0
    while start + window_span <= t_max + timedelta(days=1):
        train_end = start + train_delta
        test_end = train_end + test_delta
        train = [
            s
            for s in ordered
            if start <= _as_utc(_entry_time_key(s)) < train_end
        ]
        test = [
            s
            for s in ordered
            if train_end <= _as_utc(_entry_time_key(s)) < test_end
        ]
        if len(train) >= 40 and len(test) >= 15:
            idx += 1
            windows.append(
                {
                    "fold": idx,
                    "train_from": start.isoformat(),
                    "train_to": train_end.isoformat(),
                    "test_from": train_end.isoformat(),
                    "test_to": test_end.isoformat(),
                    "n_train": len(train),
                    "n_test": len(test),
                    "train": train,
                    "test": test,
                }
            )
        start += step_delta

    return windows


async def run_walk_forward(
    *,
    checkpoint: str | None = None,
    train_weeks: int = 4,
    test_weeks: int = 2,
    step_weeks: int = 2,
    min_win_prob: float = INFERENCE_MIN_WIN_PROB,
    fee: float = DEFAULT_FEE,
    asset_class: str | None = "STOCKS",
    strategy_id: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    reader = TimescaleReader()
    samples = await reader.get_labelled_samples()
    samples = [
        s
        for s in samples
        if str(s.get("outcome") or "").upper() in ("WIN", "LOSS", "BREAKEVEN")
    ]
    if asset_class:
        ac = asset_class.upper()
        samples = [
            s for s in samples if str(s.get("asset_class") or "").upper() == ac
        ]
    if strategy_id:
        samples = [
            s for s in samples if str(s.get("strategy_id") or "") == strategy_id
        ]

    logger.info(f"Loading sequences for {len(samples):,} samples…")
    samples = await attach_feature_sequences(reader, samples, seq_len=60)
    samples = filter_sequence_ready(samples, require_seq=True)
    logger.info(f"Sequence-ready: {len(samples):,}")

    windows = calendar_windows(
        samples,
        train_weeks=train_weeks,
        test_weeks=test_weeks,
        step_weeks=step_weeks,
    )
    if not windows:
        raise RuntimeError(
            "No valid calendar windows — need longer labelled history"
        )

    evaluator = GlobalBrainEvaluator(checkpoint_path=checkpoint)
    model = evaluator.load_model()

    fold_rows: list[dict[str, Any]] = []
    positive = 0
    for w in windows:
        test = w["test"]
        gated = evaluator.predict(model, test, min_win_prob=min_win_prob)
        brain = evaluator.score_predictor(
            f"global_brain_p>={min_win_prob:.2f}", test, gated, fee
        )
        ema_pred = [baseline_ema_trend(s) for s in test]
        import numpy as np

        ema = evaluator.score_predictor(
            "ema_trend", test, np.array(ema_pred, dtype=np.int64), fee
        )
        pnl = float(brain["avg_pnl_pct"])
        is_pos = pnl > 0
        if is_pos:
            positive += 1
        row = {
            "fold": w["fold"],
            "train_from": w["train_from"],
            "train_to": w["train_to"],
            "test_from": w["test_from"],
            "test_to": w["test_to"],
            "n_train": w["n_train"],
            "n_test": w["n_test"],
            "gated": brain,
            "ema_trend": ema,
            "positive_gated_pnl": is_pos,
        }
        fold_rows.append(row)
        logger.info(
            f"Fold {w['fold']}: test n={w['n_test']} "
            f"gated_avgPnL={pnl:.3f}% trades={int(brain['trades_taken'])} "
            f"{'POS' if is_pos else 'NEG'}"
        )

    n_folds = len(fold_rows)
    gate_need = int(DECISION_GATE["min_walk_forward_windows_positive"])
    gate_total = int(DECISION_GATE["min_walk_forward_windows_total"])
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checkpoint": evaluator.checkpoint_path,
        "train_weeks": train_weeks,
        "test_weeks": test_weeks,
        "step_weeks": step_weeks,
        "min_win_prob": min_win_prob,
        "fee_round_trip": fee,
        "asset_class": asset_class,
        "strategy_id": strategy_id,
        "n_windows": n_folds,
        "windows_positive": positive,
        "decision_gate": {
            "need_positive": gate_need,
            "of_windows": gate_total,
            "observed_positive": positive,
            "observed_windows": n_folds,
            "passed": positive >= gate_need and n_folds >= gate_total,
        },
        "folds": [
            {k: v for k, v in r.items() if k not in ("gated", "ema_trend")}
            | {"gated": r["gated"], "ema_trend": r["ema_trend"]}
            for r in fold_rows
        ],
    }

    out_path = os.path.join(settings.checkpoint_dir, "walk_forward_report.json")
    os.makedirs(settings.checkpoint_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    logger.success(
        f"Walk-forward: {positive}/{n_folds} positive windows → {out_path}"
    )
    logger.info(
        f"Decision gate walk-forward: "
        f"{'PASS' if report['decision_gate']['passed'] else 'FAIL'} "
        f"(need ≥{gate_need} of {gate_total})"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Calendar walk-forward eval")
    parser.add_argument("--checkpoint", type=str, default=None)
    parser.add_argument("--train-weeks", type=int, default=4)
    parser.add_argument("--test-weeks", type=int, default=2)
    parser.add_argument("--step-weeks", type=int, default=2)
    parser.add_argument("--min-win-prob", type=float, default=INFERENCE_MIN_WIN_PROB)
    parser.add_argument("--asset-class", type=str, default="STOCKS")
    parser.add_argument("--strategy-id", type=str, default=None)
    args = parser.parse_args()

    async def _run() -> None:
        await apply_schema()
        await run_walk_forward(
            checkpoint=args.checkpoint,
            train_weeks=args.train_weeks,
            test_weeks=args.test_weeks,
            step_weeks=args.step_weeks,
            min_win_prob=args.min_win_prob,
            asset_class=args.asset_class or None,
            strategy_id=args.strategy_id,
        )
        await close_pool()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
