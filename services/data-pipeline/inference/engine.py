"""Global Brain live/paper inference with hard confidence gate."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import numpy as np
import torch
from loguru import logger

from config import get_settings
from inference.policy import (
    INFERENCE_MIN_WIN_PROB,
    is_inference_allowed,
    passes_confidence_gate,
)
from processing.features import (
    FEATURE_KEYS,
    precompute_feature_matrix,
    sequence_from_matrix,
)
from storage.timescale import TimescaleReader
from training.model import GlobalBrain


@dataclass
class InferenceResult:
    symbol: str
    timeframe: str
    asset_class: str
    allowed: bool
    deny_reason: str
    win_prob: float
    loss_prob: float
    head_confidence: float
    predicted_class: str  # WIN | LOSS
    take_trade: bool
    gate: float
    mode: str  # paper | blocked

    def as_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "asset_class": self.asset_class,
            "allowed": self.allowed,
            "deny_reason": self.deny_reason,
            "win_prob": round(self.win_prob, 6),
            "loss_prob": round(self.loss_prob, 6),
            "head_confidence": round(self.head_confidence, 6),
            "predicted_class": self.predicted_class,
            "take_trade": self.take_trade,
            "gate": self.gate,
            "mode": self.mode,
        }


class GlobalBrainInference:
    """
    Load checkpoint once; score OHLCV sequences.

    Action rule (hard):
      take_trade = universe_ok AND softmax(P_WIN) >= min_win_prob
    Crypto/forex always return take_trade=False.
    """

    def __init__(
        self,
        checkpoint_path: str | None = None,
        min_win_prob: float = INFERENCE_MIN_WIN_PROB,
    ) -> None:
        self.settings = get_settings()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.min_win_prob = float(min_win_prob)
        self.reader = TimescaleReader()
        self.checkpoint_path = checkpoint_path or os.path.join(
            self.settings.checkpoint_dir, "global_brain_latest.pt"
        )
        self._model: GlobalBrain | None = None
        self._seq_len = 60
        self._input_dim = len(FEATURE_KEYS)

    def load(self) -> GlobalBrain:
        if self._model is not None:
            return self._model
        path = self.checkpoint_path
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Checkpoint not found: {path}. "
                "Place global_brain_latest.pt in checkpoints/"
            )

        # Check if path is a directory checkpoint
        manifest_path = (
            os.path.join(path, "manifest.json")
            if os.path.isdir(path)
            else os.path.join(os.path.dirname(path), "manifest.json")
        )
        weights_path = (
            os.path.join(path, "model.pt")
            if os.path.isdir(path)
            else path
        )

        if os.path.isfile(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                manifest_features = manifest.get("features")
                if manifest_features and manifest_features != list(FEATURE_KEYS):
                    raise ValueError(
                        f"Checkpoint feature mismatch: checkpoint features {manifest_features} != expected {FEATURE_KEYS}"
                    )
            except Exception as e:
                if isinstance(e, ValueError):
                    raise
                logger.warning(f"Could not parse manifest at {manifest_path}: {e}")

        payload = torch.load(weights_path, map_location=self.device, weights_only=False)
        cfg = payload.get("model_config") or {}
        self._seq_len = int(cfg.get("seq_len", 60))
        self._input_dim = int(cfg.get("input_dim", len(FEATURE_KEYS)))

        # Verify feature list / input_dim inside checkpoint payload
        payload_features = payload.get("feature_list")
        if payload_features and payload_features != list(FEATURE_KEYS):
            raise ValueError(
                f"Checkpoint payload feature mismatch: {payload_features} != {FEATURE_KEYS}"
            )
        if self._input_dim != len(FEATURE_KEYS):
            raise ValueError(
                f"Feature dimension mismatch: checkpoint has input_dim={self._input_dim}, expected {len(FEATURE_KEYS)}"
            )

        model = GlobalBrain(
            input_dim=self._input_dim,
            d_model=int(cfg.get("d_model", 128)),
            nhead=int(cfg.get("nhead", 4)),
            num_layers=int(cfg.get("num_layers", 3)),
            seq_len=self._seq_len,
            num_classes=int(cfg.get("num_classes", 2)),
        ).to(self.device)
        model.load_state_dict(payload["model_state_dict"])
        model.eval()
        self._model = model
        logger.info(
            f"Inference loaded {path} "
            f"(val_loss={payload.get('val_loss', '?')}, "
            f"gate={self.min_win_prob:.2f}, device={self.device})"
        )
        return model

    def _score_sequence(self, seq: np.ndarray) -> tuple[float, float, float, str]:
        model = self.load()
        x = torch.from_numpy(seq.astype(np.float32)).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits, conf = model(x)
            probs = torch.softmax(logits, dim=-1)[0]
            win_prob = float(probs[0].item())
            loss_prob = float(probs[1].item()) if probs.numel() > 1 else 1.0 - win_prob
            head_conf = float(conf[0, 0].item())
        predicted = "WIN" if win_prob >= loss_prob else "LOSS"
        return win_prob, loss_prob, head_conf, predicted

    async def infer_symbol(
        self,
        symbol: str,
        timeframe: str = "1D",
        asset_class: str = "STOCKS",
        limit: int = 280,
    ) -> InferenceResult:
        allowed, reason = is_inference_allowed(symbol, asset_class)
        if not allowed:
            return InferenceResult(
                symbol=symbol,
                timeframe=timeframe,
                asset_class=asset_class,
                allowed=False,
                deny_reason=reason,
                win_prob=0.0,
                loss_prob=1.0,
                head_confidence=0.0,
                predicted_class="LOSS",
                take_trade=False,
                gate=self.min_win_prob,
                mode="blocked",
            )

        df = await self.reader.get_recent_ohlcv(symbol, timeframe, limit=limit)
        if df is None or len(df) < 60:
            return InferenceResult(
                symbol=symbol,
                timeframe=timeframe,
                asset_class=asset_class,
                allowed=True,
                deny_reason=f"insufficient OHLCV ({0 if df is None else len(df)} bars)",
                win_prob=0.0,
                loss_prob=1.0,
                head_confidence=0.0,
                predicted_class="LOSS",
                take_trade=False,
                gate=self.min_win_prob,
                mode="paper",
            )

        # Train/inference match: gate inference to the exact same strategy rule signal bars as training
        if self.settings.inference_signal_gating:
            from processing.labeller import check_rule_signal
            if not check_rule_signal(df, asset_class=asset_class, idx=-1):
                return InferenceResult(
                    symbol=symbol,
                    timeframe=timeframe,
                    asset_class=asset_class,
                    allowed=True,
                    deny_reason="no strategy rule signal fired on current bar",
                    win_prob=0.0,
                    loss_prob=1.0,
                    head_confidence=0.0,
                    predicted_class="NO_SIGNAL",
                    take_trade=False,
                    gate=self.min_win_prob,
                    mode="paper",
                )

        matrix = precompute_feature_matrix(df)
        seq = sequence_from_matrix(matrix, len(matrix) - 1, seq_len=self._seq_len)
        win_prob, loss_prob, head_conf, predicted = self._score_sequence(seq)
        gated = passes_confidence_gate(win_prob, self.min_win_prob)
        take = predicted == "WIN" and gated

        return InferenceResult(
            symbol=symbol,
            timeframe=timeframe,
            asset_class=asset_class,
            allowed=True,
            deny_reason="" if take or not gated else f"win_prob {win_prob:.3f} < gate {self.min_win_prob:.2f}",
            win_prob=win_prob,
            loss_prob=loss_prob,
            head_confidence=head_conf,
            predicted_class=predicted,
            take_trade=take,
            gate=self.min_win_prob,
            mode="paper",
        )
