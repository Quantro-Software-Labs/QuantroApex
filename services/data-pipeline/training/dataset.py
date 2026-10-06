"""PyTorch Dataset for labelled market samples."""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import torch
from torch.utils.data import Dataset

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
        input_dim: int = 14,
        add_noise: bool = True,
    ) -> None:
        self.seq_len = seq_len
        self.input_dim = input_dim
        self.samples = samples
        self.add_noise = add_noise

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
        # Per-sequence standardize — keeps transformer inputs ~O(1) across assets
        std = float(seq.std())
        if std > 1e-6:
            seq = (seq - float(seq.mean())) / std

        if self.add_noise:
            noise = np.random.normal(0, 0.01, size=seq.shape).astype(np.float32)
            seq = seq + noise

        label = sample_label(sample)
        return torch.from_numpy(seq), torch.tensor(label, dtype=torch.long)


def feature_keys() -> list[str]:
    return list(FEATURE_KEYS)
