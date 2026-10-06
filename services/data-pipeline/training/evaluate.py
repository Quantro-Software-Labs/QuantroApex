"""Walk-forward / holdout evaluation vs EMA & RSI baselines."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Callable

import numpy as np
import torch
from loguru import logger
from torch.utils.data import DataLoader

from config import get_settings
from storage.timescale import TimescaleReader
from training.dataset import MarketDataset, sample_label
from training.model import GlobalBrain
from training.sequences import attach_feature_sequences, filter_sequence_ready

# Round-trip fee assumption (0.1% each side) — matches labeller fees=0.001
DEFAULT_FEE = 0.002


def _as_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def _entry_time_key(sample: dict[str, Any]) -> datetime:
    t = sample.get("entry_time")
    if isinstance(t, datetime):
        if t.tzinfo is None:
            return t.replace(tzinfo=timezone.utc)
        return t
    return datetime.min.replace(tzinfo=timezone.utc)


BaselineFn = Callable[[dict[str, Any]], int]


def baseline_always_win(_s: dict[str, Any]) -> int:
    return 0


def baseline_always_loss(_s: dict[str, Any]) -> int:
    return 1


def baseline_rsi_momentum(sample: dict[str, Any]) -> int:
    """WIN if RSI >= 50 (momentum), else LOSS."""
    feats = sample.get("features") or {}
    rsi = _as_float(feats.get("rsi"), 50.0)
    return 0 if rsi >= 50.0 else 1


def baseline_ema_trend(sample: dict[str, Any]) -> int:
    """WIN if price above EMA20, else LOSS."""
    feats = sample.get("features") or {}
    vs20 = _as_float(feats.get("price_vs_ema20"), 0.0)
    return 0 if vs20 > 0 else 1


def baseline_ema_rsi(sample: dict[str, Any]) -> int:
    """WIN only if above EMA20 and RSI >= 50."""
    if baseline_ema_trend(sample) == 0 and baseline_rsi_momentum(sample) == 0:
        return 0
    return 1


BASELINES: dict[str, BaselineFn] = {
    "always_take": baseline_always_win,
    "never_take": baseline_always_loss,
    "rsi_momentum": baseline_rsi_momentum,
    "ema_trend": baseline_ema_trend,
    "ema_and_rsi": baseline_ema_rsi,
}


def classification_metrics(
    y_true: np.ndarray, y_pred: np.ndarray
) -> dict[str, float]:
    """Binary metrics with WIN=0 as the positive class for trading."""
    n = len(y_true)
    if n == 0:
        return {
            "n": 0,
            "accuracy": 0.0,
            "precision_win": 0.0,
            "recall_win": 0.0,
            "f1_win": 0.0,
            "actual_win_rate": 0.0,
        }

    correct = int(np.sum(y_true == y_pred))
    tp = int(np.sum((y_pred == 0) & (y_true == 0)))
    fp = int(np.sum((y_pred == 0) & (y_true == 1)))
    fn = int(np.sum((y_pred == 1) & (y_true == 0)))
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall)
        else 0.0
    )
    return {
        "n": float(n),
        "accuracy": correct / n,
        "precision_win": precision,
        "recall_win": recall,
        "f1_win": f1,
        "actual_win_rate": float(np.mean(y_true == 0)),
        "pred_win_rate": float(np.mean(y_pred == 0)),
        "tp": float(tp),
        "fp": float(fp),
        "fn": float(fn),
        "tn": float(int(np.sum((y_pred == 1) & (y_true == 1)))),
    }


def paper_pnl(
    samples: list[dict[str, Any]],
    y_pred: np.ndarray,
    fee: float = DEFAULT_FEE,
) -> dict[str, float]:
    """Equal-weight paper book: take trade only when model predicts WIN."""
    taken_pnls: list[float] = []
    for sample, pred in zip(samples, y_pred):
        if int(pred) != 0:
            continue
        raw = _as_float(sample.get("pnl_pct"), 0.0)
        taken_pnls.append(raw - fee)

    if not taken_pnls:
        return {
            "trades_taken": 0.0,
            "hit_rate": 0.0,
            "total_pnl_pct": 0.0,
            "avg_pnl_pct": 0.0,
            "median_pnl_pct": 0.0,
        }

    arr = np.array(taken_pnls, dtype=np.float64)
    return {
        "trades_taken": float(len(arr)),
        "hit_rate": float(np.mean(arr > 0)),
        "total_pnl_pct": float(np.sum(arr) * 100),
        "avg_pnl_pct": float(np.mean(arr) * 100),
        "median_pnl_pct": float(np.median(arr) * 100),
    }


def time_holdout_split(
    samples: list[dict[str, Any]], holdout_frac: float = 0.2
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ordered = sorted(samples, key=_entry_time_key)
    if len(ordered) < 50:
        raise ValueError(f"Need >= 50 samples for eval, got {len(ordered)}")
    cut = max(1, int(len(ordered) * (1.0 - holdout_frac)))
    if cut >= len(ordered):
        cut = len(ordered) - 1
    return ordered[:cut], ordered[cut:]


def walk_forward_folds(
    samples: list[dict[str, Any]], n_folds: int = 3
) -> list[tuple[list[dict[str, Any]], list[dict[str, Any]]]]:
    """Expanding-window folds by entry_time."""
    ordered = sorted(samples, key=_entry_time_key)
    n = len(ordered)
    if n < 100:
        raise ValueError(f"Need >= 100 samples for walk-forward, got {n}")

    folds: list[tuple[list[dict[str, Any]], list[dict[str, Any]]]] = []
    edges = [int(n * i / (n_folds + 1)) for i in range(n_folds + 2)]
    edges[-1] = n
    for k in range(n_folds):
        train = ordered[: edges[k + 1]]
        test = ordered[edges[k + 1] : edges[k + 2]]
        if len(train) < 50 or len(test) < 20:
            continue
        folds.append((train, test))
    return folds


class GlobalBrainEvaluator:
    def __init__(self, checkpoint_path: str | None = None) -> None:
        self.settings = get_settings()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.reader = TimescaleReader()
        self.checkpoint_path = checkpoint_path or os.path.join(
            self.settings.checkpoint_dir, "global_brain_latest.pt"
        )

    def load_model(self) -> GlobalBrain:
        path = self.checkpoint_path
        if not os.path.isfile(path):
            raise FileNotFoundError(
                f"Checkpoint not found: {path}. "
                "Place global_brain_latest.pt in checkpoints/"
            )
        payload = torch.load(path, map_location=self.device, weights_only=False)
        cfg = payload.get("model_config") or {}
        model = GlobalBrain(
            input_dim=int(cfg.get("input_dim", 14)),
            d_model=int(cfg.get("d_model", 128)),
            nhead=int(cfg.get("nhead", 4)),
            num_layers=int(cfg.get("num_layers", 3)),
            seq_len=int(cfg.get("seq_len", 60)),
            num_classes=int(cfg.get("num_classes", 2)),
        ).to(self.device)
        model.load_state_dict(payload["model_state_dict"])
        model.eval()
        logger.info(
            f"Loaded checkpoint {path} "
            f"(val_loss={payload.get('val_loss', '?')}, device={self.device})"
        )
        return model

    def predict(
        self,
        model: GlobalBrain,
        samples: list[dict[str, Any]],
        batch_size: int = 512,
        min_win_prob: float = 0.0,
    ) -> np.ndarray:
        if not samples:
            return np.array([], dtype=np.int64)

        loader = DataLoader(
            MarketDataset(samples, add_noise=False),
            batch_size=min(batch_size, len(samples)),
            shuffle=False,
        )
        preds: list[int] = []
        with torch.no_grad():
            for features, _labels in loader:
                features = features.to(self.device)
                logits, _conf = model(features)
                probs = torch.softmax(logits, dim=-1)
                win_prob = probs[:, 0]
                pred = torch.argmax(logits, dim=-1)
                if min_win_prob > 0:
                    pred = torch.where(
                        win_prob >= min_win_prob,
                        torch.zeros_like(pred),
                        torch.ones_like(pred),
                    )
                preds.extend(int(x) for x in pred.cpu().numpy())
        return np.array(preds, dtype=np.int64)

    def score_predictor(
        self,
        name: str,
        samples: list[dict[str, Any]],
        y_pred: np.ndarray,
        fee: float,
    ) -> dict[str, Any]:
        y_true = np.array([sample_label(s) for s in samples], dtype=np.int64)
        clf = classification_metrics(y_true, y_pred)
        pnl = paper_pnl(samples, y_pred, fee=fee)
        return {"name": name, **clf, **pnl}

    def score_baselines(
        self, samples: list[dict[str, Any]], fee: float
    ) -> list[dict[str, Any]]:
        rows = []
        for name, fn in BASELINES.items():
            y_pred = np.array([fn(s) for s in samples], dtype=np.int64)
            rows.append(self.score_predictor(name, samples, y_pred, fee))
        return rows

    def score_segments(
        self,
        samples: list[dict[str, Any]],
        model: GlobalBrain,
        fee: float,
        min_win_prob: float,
    ) -> dict[str, list[dict[str, Any]]]:
        """Break holdout down by asset_class and strategy_id."""
        from collections import defaultdict

        by_asset: dict[str, list[dict[str, Any]]] = defaultdict(list)
        by_strategy: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for s in samples:
            by_asset[str(s.get("asset_class") or "UNKNOWN")].append(s)
            by_strategy[str(s.get("strategy_id") or "UNKNOWN")].append(s)

        out: dict[str, list[dict[str, Any]]] = {"asset_class": [], "strategy_id": []}

        for label, groups in (
            ("asset_class", by_asset),
            ("strategy_id", by_strategy),
        ):
            for key, subset in sorted(groups.items(), key=lambda kv: -len(kv[1])):
                if len(subset) < 80:
                    continue
                always = np.zeros(len(subset), dtype=np.int64)
                ema = np.array(
                    [baseline_ema_trend(s) for s in subset], dtype=np.int64
                )
                brain = self.predict(model, subset, min_win_prob=0.0)
                gated = self.predict(model, subset, min_win_prob=min_win_prob)
                rows = [
                    self.score_predictor("always_take", subset, always, fee),
                    self.score_predictor("ema_trend", subset, ema, fee),
                    self.score_predictor("global_brain", subset, brain, fee),
                    self.score_predictor(
                        f"global_brain_p>={min_win_prob:.2f}",
                        subset,
                        gated,
                        fee,
                    ),
                ]
                brain_row = rows[2]
                always_row = rows[0]
                ema_row = rows[1]
                gated_row = rows[3]
                beats = (
                    brain_row["avg_pnl_pct"] > always_row["avg_pnl_pct"]
                    and brain_row["avg_pnl_pct"] > ema_row["avg_pnl_pct"]
                )
                gated_beats = (
                    gated_row["avg_pnl_pct"] > always_row["avg_pnl_pct"]
                    and gated_row["avg_pnl_pct"] > ema_row["avg_pnl_pct"]
                    and gated_row["avg_pnl_pct"] > 0
                )
                summary = {
                    "segment": key,
                    "n": len(subset),
                    "beats_baselines": beats,
                    "gated_positive_edge": gated_beats,
                    "results": rows,
                }
                out[label].append(summary)
                logger.info(
                    f"SEGMENT {label}={key} n={len(subset)} "
                    f"brain_avg={brain_row['avg_pnl_pct']:.3f}% "
                    f"gated_avg={gated_row['avg_pnl_pct']:.3f}% "
                    f"always={always_row['avg_pnl_pct']:.3f}% "
                    f"ema={ema_row['avg_pnl_pct']:.3f}% "
                    f"{'EDGE' if beats or gated_beats else 'no-edge'}"
                )
        return out

    async def run(
        self,
        holdout_frac: float = 0.2,
        n_folds: int = 3,
        fee: float = DEFAULT_FEE,
        min_win_prob: float = 0.55,
        walk_forward: bool = True,
        asset_class: str | None = None,
    ) -> dict[str, Any]:
        from inference.policy import INFERENCE_MIN_WIN_PROB

        if min_win_prob is None:
            min_win_prob = INFERENCE_MIN_WIN_PROB
        # Always enforce at least the SCOPED_EDGE gate unless explicitly lower for research
        if min_win_prob < INFERENCE_MIN_WIN_PROB:
            logger.warning(
                f"min_win_prob={min_win_prob} below policy gate "
                f"{INFERENCE_MIN_WIN_PROB} — using policy gate"
            )
            min_win_prob = INFERENCE_MIN_WIN_PROB

        logger.info("Loading labelled samples for evaluation")
        samples = await self.reader.get_labelled_samples()
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
            logger.info(f"Filtered to asset_class={ac}: {len(samples):,}")
        logger.info(f"Usable samples: {len(samples):,}")

        logger.info("Building real OHLCV feature sequences for eval…")
        samples = await attach_feature_sequences(self.reader, samples, seq_len=60)
        samples = filter_sequence_ready(samples, require_seq=True)
        logger.info(f"Sequence-ready samples: {len(samples):,}")
        if len(samples) < 100:
            raise RuntimeError("Too few sequence-ready samples to evaluate")

        model = self.load_model()
        train_part, holdout = time_holdout_split(samples, holdout_frac)
        t0 = _entry_time_key(holdout[0]).isoformat()
        t1 = _entry_time_key(holdout[-1]).isoformat()
        logger.info(
            f"Time holdout: {len(holdout):,} samples "
            f"({holdout_frac:.0%}) from {t0} → {t1} "
            f"(train-era size {len(train_part):,})"
        )
        logger.warning(
            "Frozen-checkpoint holdout may overlap Colab random train split — "
            "treat as indicative; walk-forward folds are more honest if enabled."
        )

        report: dict[str, Any] = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "checkpoint": self.checkpoint_path,
            "fee_round_trip": fee,
            "min_win_prob": min_win_prob,
            "total_samples": len(samples),
            "holdout": {
                "n": len(holdout),
                "frac": holdout_frac,
                "from": t0,
                "to": t1,
            },
            "holdout_results": [],
            "walk_forward": [],
            "verdict": "",
        }

        holdout_rows = self.score_baselines(holdout, fee)
        raw_pred = self.predict(model, holdout, min_win_prob=0.0)
        holdout_rows.append(
            self.score_predictor("global_brain", holdout, raw_pred, fee)
        )
        gated_pred = self.predict(model, holdout, min_win_prob=min_win_prob)
        holdout_rows.append(
            self.score_predictor(
                f"global_brain_p>={min_win_prob:.2f}",
                holdout,
                gated_pred,
                fee,
            )
        )
        report["holdout_results"] = holdout_rows
        self._log_table(f"TIME HOLDOUT (last {holdout_frac:.0%})", holdout_rows)

        # Segment breakdown — find where (if anywhere) edge lives
        segments = self.score_segments(
            holdout, model, fee=fee, min_win_prob=min_win_prob
        )
        report["holdout_segments"] = segments

        if walk_forward:
            folds = walk_forward_folds(samples, n_folds=n_folds)
            logger.info(f"Walk-forward: {len(folds)} folds (frozen checkpoint)")
            fold_summaries = []
            for i, (_train, test) in enumerate(folds, start=1):
                rows = self.score_baselines(test, fee)
                pred = self.predict(model, test, min_win_prob=0.0)
                rows.append(
                    self.score_predictor("global_brain", test, pred, fee)
                )
                pred_g = self.predict(model, test, min_win_prob=min_win_prob)
                rows.append(
                    self.score_predictor(
                        f"global_brain_p>={min_win_prob:.2f}",
                        test,
                        pred_g,
                        fee,
                    )
                )
                fold_summaries.append(
                    {
                        "fold": i,
                        "n_test": len(test),
                        "from": _entry_time_key(test[0]).isoformat(),
                        "to": _entry_time_key(test[-1]).isoformat(),
                        "results": rows,
                    }
                )
                self._log_table(f"WALK-FORWARD FOLD {i}/{len(folds)}", rows)
            report["walk_forward"] = fold_summaries

        report["verdict"] = self._verdict(holdout_rows, segments)
        logger.info(f"Verdict: {report['verdict']}")

        out_path = os.path.join(
            self.settings.checkpoint_dir, "eval_report.json"
        )
        os.makedirs(self.settings.checkpoint_dir, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, default=str)
        logger.success(f"Eval report written → {out_path}")
        return report

    def _log_table(self, title: str, rows: list[dict[str, Any]]) -> None:
        logger.info("─" * 72)
        logger.info(title)
        logger.info(
            f"{'strategy':<28} {'acc':>6} {'pWIN':>6} {'rWIN':>6} "
            f"{'trades':>7} {'hit%':>6} {'avgPnL%':>8} {'sumPnL%':>9}"
        )
        for r in rows:
            logger.info(
                f"{r['name']:<28} "
                f"{r['accuracy']*100:5.1f}% "
                f"{r['precision_win']*100:5.1f}% "
                f"{r['recall_win']*100:5.1f}% "
                f"{int(r['trades_taken']):7d} "
                f"{r['hit_rate']*100:5.1f}% "
                f"{r['avg_pnl_pct']:7.3f}% "
                f"{r['total_pnl_pct']:8.2f}%"
            )
        logger.info("─" * 72)

    def _verdict(
        self,
        holdout_rows: list[dict[str, Any]],
        segments: dict[str, list[dict[str, Any]]] | None = None,
    ) -> str:
        by_name = {r["name"]: r for r in holdout_rows}
        brain = by_name.get("global_brain")
        ema = by_name.get("ema_trend")
        rsi = by_name.get("rsi_momentum")
        always = by_name.get("always_take")
        if not brain or not ema or not rsi or not always:
            return "incomplete_results"

        beats_ema_pnl = brain["avg_pnl_pct"] > ema["avg_pnl_pct"]
        beats_rsi_pnl = brain["avg_pnl_pct"] > rsi["avg_pnl_pct"]
        beats_always = brain["avg_pnl_pct"] > always["avg_pnl_pct"]
        better_precision = brain["precision_win"] > max(
            ema["precision_win"], rsi["precision_win"], 0.5
        )

        scoped: list[str] = []
        if segments:
            for kind, rows in segments.items():
                for row in rows:
                    if row.get("gated_positive_edge") or row.get("beats_baselines"):
                        scoped.append(f"{kind}:{row['segment']}")

        if beats_ema_pnl and beats_rsi_pnl and beats_always and better_precision:
            return (
                "EDGE_LIKELY — Global Brain beat EMA/RSI and always-take on "
                "holdout avg PnL with better WIN precision. Proceed to inference."
            )
        if scoped:
            return (
                "SCOPED_EDGE — overall holdout is weak, but positive gated edge in: "
                + ", ".join(scoped[:8])
                + ". Paper-trade only those segments; do not go live broadly."
            )
        if beats_always and (beats_ema_pnl or beats_rsi_pnl):
            return (
                "WEAK_EDGE — beats always-take and one baseline. "
                "Paper trade carefully; improve features before live."
            )
        return (
            "NO_CLEAR_EDGE — does not beat EMA/RSI baselines on holdout paper PnL. "
            "Stay on Beginner: improve labels/features before wiring live signals."
        )
