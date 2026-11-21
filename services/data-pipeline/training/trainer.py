"""Global Brain training loop with class weighting + checkpoint archival."""

from __future__ import annotations

import json
import os
import shutil
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from loguru import logger
from sklearn.utils.class_weight import compute_class_weight
from torch.utils.data import DataLoader

from config import get_settings
from processing.features import FEATURE_KEYS
from storage.timescale import TimescaleReader, TimescaleWriter
from training.dataset import OUTCOME_MAP, MarketDataset, fit_dataset_scaler, sample_label
from training.model import GlobalBrain
from training.sequences import attach_feature_sequences, filter_sequence_ready


def _entry_sort_key(sample: dict) -> tuple:
    t = sample.get("entry_time")
    if t is None:
        return (0, 0)
    try:
        return (1, t.timestamp() if hasattr(t, "timestamp") else 0)
    except Exception:
        return (1, 0)


def rebalance_by_strategy(
    samples: list[dict],
    max_frac: float = 0.35,
    rng: np.random.Generator | None = None,
) -> list[dict]:
    """
    Cap any single strategy_id at max_frac of the dataset.
    Prevents forex-session-breakout (~60k rows) from drowning other signals.
    """
    if not samples:
        return samples
    rng = rng or np.random.default_rng(42)
    from collections import defaultdict

    by_strat: dict[str, list[dict]] = defaultdict(list)
    for s in samples:
        by_strat[str(s.get("strategy_id") or "unknown")].append(s)

    n = len(samples)
    cap = max(100, int(n * max_frac))
    out: list[dict] = []
    for sid, rows in by_strat.items():
        if len(rows) <= cap:
            out.extend(rows)
            continue
        # Prefer more recent rows within the capped strategy (time-sorted later)
        rows_sorted = sorted(rows, key=_entry_sort_key)
        # Keep a spread: half from older half, half from newer half
        mid = len(rows_sorted) // 2
        older, newer = rows_sorted[:mid], rows_sorted[mid:]
        keep_old = cap // 2
        keep_new = cap - keep_old
        chosen = []
        if older:
            idx = rng.choice(len(older), size=min(keep_old, len(older)), replace=False)
            chosen.extend(older[i] for i in idx)
        if newer:
            idx = rng.choice(len(newer), size=min(keep_new, len(newer)), replace=False)
            chosen.extend(newer[i] for i in idx)
        logger.info(
            f"Strategy cap {sid}: {len(rows):,} → {len(chosen):,} (max_frac={max_frac})"
        )
        out.extend(chosen)
    rng.shuffle(out)
    logger.info(f"Rebalanced dataset: {n:,} → {len(out):,}")
    return out


class GlobalBrainTrainer:
    """
    Trains the Global Brain on labelled trade samples.
    Preserves prior checkpoints; applies balanced class weights.
    Uses real OHLCV feature sequences + chronological train/val split.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Training on: {self.device}")
        self.reader = TimescaleReader()
        self.writer = TimescaleWriter()
        self.input_dim = len(FEATURE_KEYS)
        self.model = GlobalBrain(input_dim=self.input_dim).to(self.device)
        self.scaler = None
        self.last_checkpoint: str | None = None
        self._archived_latest = False

    async def train(self, epochs: int = 50, batch_size: int = 256) -> dict:
        logger.info("Loading labelled samples from database")
        samples = await self.reader.get_labelled_samples()
        logger.info(f"Loaded {len(samples):,} labelled samples")

        samples = [
            s
            for s in samples
            if str(s.get("outcome") or "").upper() in ("WIN", "LOSS", "BREAKEVEN")
        ]
        # Drop UNKNOWN regime noise when possible
        with_regime = [
            s
            for s in samples
            if str(s.get("market_regime") or "").upper() not in ("", "UNKNOWN")
        ]
        if len(with_regime) >= max(500, int(len(samples) * 0.4)):
            logger.info(
                f"Filtering UNKNOWN regimes: {len(samples):,} → {len(with_regime):,}"
            )
            samples = with_regime

        samples = rebalance_by_strategy(samples, max_frac=0.35)

        if len(samples) < 100:
            logger.warning(
                "Insufficient samples for meaningful training "
                f"({len(samples)} < 100). Run labelling first."
            )
            return {"status": "skipped", "reason": "insufficient_samples"}

        logger.info("Building real OHLCV feature sequences…")
        samples = await attach_feature_sequences(self.reader, samples, seq_len=60)
        samples = filter_sequence_ready(samples, require_seq=True)
        logger.info(f"Sequence-ready samples: {len(samples):,}")
        if len(samples) < 100:
            return {"status": "skipped", "reason": "insufficient_sequence_samples"}

        raw_labels = [sample_label(s) for s in samples]
        weights_tensor: torch.Tensor | None = None
        if len(set(raw_labels)) > 1:
            class_weights = compute_class_weight(
                class_weight="balanced",
                classes=np.array([0, 1]),
                y=np.array(raw_labels),
            )
            weights_tensor = torch.FloatTensor(class_weights).to(self.device)
            logger.info(
                f"Class weights — WIN: {class_weights[0]:.3f}, "
                f"LOSS: {class_weights[1]:.3f}"
            )
        else:
            logger.warning(
                "Only one outcome class found in samples — class weighting skipped"
            )

        criterion = (
            nn.CrossEntropyLoss(weight=weights_tensor)
            if weights_tensor is not None
            else nn.CrossEntropyLoss()
        )

        self._archive_latest_once()

        # Chronological split — matches evaluate holdout semantics
        samples = sorted(samples, key=_entry_sort_key)
        split = int(len(samples) * 0.8)
        train_samples = samples[:split]
        val_samples = samples[split:] or samples[-max(1, len(samples) // 5) :]
        logger.info(
            f"Time split — train={len(train_samples):,} val={len(val_samples):,}"
        )

        # Fit feature scaler ONLY on the training split — zero leakage into validation
        self.scaler = fit_dataset_scaler(train_samples, input_dim=self.input_dim)

        train_loader = DataLoader(
            MarketDataset(
                train_samples,
                seq_len=60,
                input_dim=self.input_dim,
                add_noise=True,
                scaler=self.scaler,
            ),
            batch_size=min(batch_size, len(train_samples)),
            shuffle=True,
        )
        val_loader = DataLoader(
            MarketDataset(
                val_samples,
                seq_len=60,
                input_dim=self.input_dim,
                add_noise=False,
                scaler=self.scaler,
            ),
            batch_size=min(batch_size, len(val_samples)),
        )

        version = f"gb-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        run_id = await self.writer.start_training_run(version)

        optimizer = optim.AdamW(self.model.parameters(), lr=1e-4, weight_decay=0.01)
        scheduler = optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=max(epochs, 1)
        )

        best_val_loss = float("inf")
        best_train_loss = float("inf")

        for epoch in range(epochs):
            self.model.train()
            train_losses: list[float] = []
            for features, labels in train_loader:
                features = features.to(self.device)
                labels = labels.to(self.device)
                optimizer.zero_grad()
                action_logits, _confidence = self.model(features)
                loss = criterion(action_logits, labels)
                if not torch.isfinite(loss):
                    logger.error(
                        f"Non-finite loss at epoch {epoch + 1} — aborting train "
                        "(check feature sanitization)"
                    )
                    return {
                        "status": "failed",
                        "reason": "nan_loss",
                        "epoch": epoch + 1,
                    }
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                optimizer.step()
                train_losses.append(loss.item())

            self.model.eval()
            val_losses: list[float] = []
            with torch.no_grad():
                for features, labels in val_loader:
                    features = features.to(self.device)
                    labels = labels.to(self.device)
                    action_logits, _ = self.model(features)
                    loss = criterion(action_logits, labels)
                    val_losses.append(loss.item())

            train_loss = float(np.mean(train_losses)) if train_losses else 0.0
            val_loss = float(np.mean(val_losses)) if val_losses else train_loss
            scheduler.step()

            logger.info(
                f"Epoch {epoch + 1}/{epochs} — "
                f"Train Loss: {train_loss:.4f} — "
                f"Val Loss: {val_loss:.4f}"
            )

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_train_loss = train_loss
                self.save_checkpoint(epoch, train_loss, val_loss, version, train_samples=train_samples)

        checkpoint = self.last_checkpoint or ""
        await self.writer.complete_training_run(
            run_id,
            samples_used=len(samples),
            train_loss=best_train_loss,
            val_loss=best_val_loss,
            checkpoint_path=checkpoint,
            status="SUCCESS",
        )
        logger.success(
            f"Training complete. Best validation loss: {best_val_loss:.4f}"
        )
        return {
            "status": "success",
            "samples": len(samples),
            "train_loss": best_train_loss,
            "val_loss": best_val_loss,
            "checkpoint": checkpoint,
            "run_id": run_id,
            "outcome_map": OUTCOME_MAP,
        }

    def _archive_latest_once(self) -> None:
        if self._archived_latest:
            return
        checkpoint_dir = self.settings.checkpoint_dir
        latest_path = os.path.join(checkpoint_dir, "global_brain_latest.pt")
        if os.path.exists(latest_path):
            archive_path = os.path.join(
                checkpoint_dir,
                f"global_brain_prev_{int(time.time())}.pt",
            )
            shutil.copy2(latest_path, archive_path)
            logger.info(f"Previous checkpoint archived: {archive_path}")
        self._archived_latest = True

    def save_checkpoint(
        self,
        epoch: int,
        train_loss: float,
        val_loss: float,
        version: str,
        train_samples: list[dict] | None = None,
    ) -> None:
        checkpoint_dir = self.settings.checkpoint_dir
        os.makedirs(checkpoint_dir, exist_ok=True)

        git_commit = "unknown"
        try:
            import subprocess
            git_commit = (
                subprocess.check_output(
                    ["git", "rev-parse", "HEAD"], timeout=2
                )
                .decode()
                .strip()
            )
        except Exception:
            pass

        date_range = {}
        if train_samples:
            raw_dates = [s["entry_time"] for s in train_samples if s.get("entry_time")]
            if raw_dates:
                t_min = min(raw_dates)
                t_max = max(raw_dates)
                date_range = {
                    "start": t_min.isoformat() if hasattr(t_min, "isoformat") else str(t_min),
                    "end": t_max.isoformat() if hasattr(t_max, "isoformat") else str(t_max),
                }

        model_config = {
            "input_dim": len(FEATURE_KEYS),
            "d_model": 128,
            "nhead": 4,
            "num_layers": 3,
            "seq_len": 60,
            "num_classes": 2,
            "label_map": OUTCOME_MAP,
            "features": list(FEATURE_KEYS),
        }

        payload = {
            "epoch": epoch,
            "model_state_dict": self.model.state_dict(),
            "train_loss": train_loss,
            "val_loss": val_loss,
            "model_config": model_config,
            "feature_list": list(FEATURE_KEYS),
            "git_commit": git_commit,
            "data_date_range": date_range,
        }

        # Create versioned directory checkpoint
        ts = int(time.time())
        versioned_dir = os.path.join(checkpoint_dir, f"v_{version}_{ts}")
        os.makedirs(versioned_dir, exist_ok=True)

        # 1. Weights
        torch.save(payload, os.path.join(versioned_dir, "model.pt"))
        # 2. Fitted scaler
        if self.scaler is not None:
            joblib.dump(self.scaler, os.path.join(versioned_dir, "scaler.joblib"))
        # 3. Feature list with order
        with open(os.path.join(versioned_dir, "feature_list.json"), "w", encoding="utf-8") as f:
            json.dump({"features": list(FEATURE_KEYS)}, f, indent=2)
        # 4. Config
        with open(os.path.join(versioned_dir, "config.json"), "w", encoding="utf-8") as f:
            json.dump(model_config, f, indent=2)
        # 5. Manifest
        manifest = {
            "version": version,
            "epoch": epoch,
            "train_loss": train_loss,
            "val_loss": val_loss,
            "input_dim": len(FEATURE_KEYS),
            "features": list(FEATURE_KEYS),
            "git_commit": git_commit,
            "data_date_range": date_range,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(os.path.join(versioned_dir, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        # Legacy file paths for backward compatibility
        path = os.path.join(
            checkpoint_dir,
            f"global_brain_{version}_e{epoch}_valloss{val_loss:.4f}.pt",
        )
        torch.save(payload, path)
        latest = os.path.join(checkpoint_dir, "global_brain_latest.pt")
        torch.save(payload, latest)
        self.last_checkpoint = versioned_dir
        logger.info(f"Checkpoint saved in versioned directory: {versioned_dir}")
