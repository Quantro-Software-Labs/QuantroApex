"""PyTorch Dataset for labelled market samples."""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import torch
from torch.utils.data import Dataset

from sklearn.preprocessing import StandardScaler

from processing.features import FEATURE_KEYS, features_to_vector

# Two-class outcomes only — BREAKEVEN is collapsed to LOSS at labelling time
OUTCOME_MAP = {"WIN": 0, "LOSS": 1}


def sample_label(sample: dict[str, Any]) -> int:
    outcome = str(sample.get("outcome") or "LOSS").upper()
    if outcome == "BREAKEVEN":
        outcome = "LOSS"
    return OUTCOME_MAP.get(outcome, 1)


class MarketDataset(Dataset):
    """
    Converts labelled_samples rows into (seq, label) tensors.

    Prefers real OHLCV feature sequences on sample['feature_seq'].
    Falls back to tiling the static feature vector (legacy).
    Labels: WIN=0, LOSS=1.
    """

    def __init__(
        self,
        samples: list[dict[str, Any]],
        seq_len: int = 60,
        input_dim: int = len(FEATURE_KEYS),
        add_noise: bool = True,
        scaler: Any | None = None,
    ) -> None:
        self.seq_len = seq_len
        self.input_dim = input_dim
        self.samples = samples
        self.add_noise = add_noise
        self.scaler = scaler

    def __len__(self) -> int:
        return len(self.samples)

    def _legacy_tiled_seq(self, sample: dict[str, Any]) -> np.ndarray:
        features = sample.get("features") or {}
        if isinstance(features, str):
            try:
                features = json.loads(features)
            except json.JSONDecodeError:
                features = {}

        vec = features_to_vector(features)
        if vec.shape[0] != self.input_dim:
            padded = np.zeros(self.input_dim, dtype=np.float32)
            n = min(self.input_dim, vec.shape[0])
            padded[:n] = vec[:n]
            vec = padded
        return np.tile(vec, (self.seq_len, 1)).astype(np.float32)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        sample = self.samples[idx]
        seq = sample.get("feature_seq")
        if isinstance(seq, np.ndarray) and seq.ndim == 2:
            seq = seq.astype(np.float32)
            if seq.shape[0] != self.seq_len or seq.shape[1] != self.input_dim:
                fixed = np.zeros((self.seq_len, self.input_dim), dtype=np.float32)
                r = min(self.seq_len, seq.shape[0])
                c = min(self.input_dim, seq.shape[1])
                fixed[-r:, :c] = seq[-r:, :c]
                seq = fixed
        else:
            seq = self._legacy_tiled_seq(sample)

        seq = np.nan_to_num(seq, nan=0.0, posinf=0.0, neginf=0.0)
        seq = np.clip(seq, -50.0, 50.0).astype(np.float32)

        if self.scaler is not None:
            seq = self.scaler.transform(seq).astype(np.float32)
        else:
            # Per-sequence standardize fallback
            std = float(seq.std())
            if std > 1e-6:
                seq = (seq - float(seq.mean())) / std

        if self.add_noise:
            noise = np.random.normal(0, 0.01, size=seq.shape).astype(np.float32)
            seq = seq + noise

        label = sample_label(sample)
        return torch.from_numpy(seq), torch.tensor(label, dtype=torch.long)


def fit_dataset_scaler(
    samples: list[dict[str, Any]],
    input_dim: int = len(FEATURE_KEYS),
    seq_len: int = 60,
) -> StandardScaler:
    """Fit a StandardScaler strictly on the provided training samples' feature vectors."""
    scaler = StandardScaler()
    all_rows = []
    for s in samples:
        seq = s.get("feature_seq")
        if isinstance(seq, np.ndarray) and seq.ndim == 2:
            if seq.shape[1] == input_dim:
                all_rows.append(seq)
            else:
                fixed = np.zeros((seq.shape[0], input_dim), dtype=np.float32)
                c = min(input_dim, seq.shape[1])
                fixed[:, :c] = seq[:, :c]
                all_rows.append(fixed)
        else:
            features = s.get("features") or {}
            vec = features_to_vector(features)
            all_rows.append(np.tile(vec, (seq_len, 1)))

    if all_rows:
        stacked = np.vstack(all_rows)
        scaler.fit(stacked)
    else:
        # Default fallback
        scaler.fit(np.zeros((1, input_dim), dtype=np.float32))
    return scaler


def feature_keys() -> list[str]:
    return list(FEATURE_KEYS)
