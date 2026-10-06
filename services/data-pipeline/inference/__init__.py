"""Scoped Global Brain inference — paper-only until decision gate is green."""

from inference.policy import (
    DECISION_GATE,
    INFERENCE_MIN_WIN_PROB,
    PAPER_ALLOWED_ASSET_CLASSES,
    PAPER_PRIMARY_SYMBOLS,
    PAPER_SECONDARY_SYMBOLS,
    PAPER_UNIVERSE,
    is_inference_allowed,
)

__all__ = [
    "DECISION_GATE",
    "INFERENCE_MIN_WIN_PROB",
    "PAPER_ALLOWED_ASSET_CLASSES",
    "PAPER_PRIMARY_SYMBOLS",
    "PAPER_SECONDARY_SYMBOLS",
    "PAPER_UNIVERSE",
    "is_inference_allowed",
]
