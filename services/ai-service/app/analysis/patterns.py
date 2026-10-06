"""TA-Lib candlestick pattern detection with degraded-mode fallback."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

from app.analysis.smc_engine import TALIB_AVAILABLE

logger = logging.getLogger(__name__)

_talib: Any = None
if TALIB_AVAILABLE:
    try:
        import talib as _talib  # type: ignore[no-redef]
    except ImportError:
        pass

_FALLBACK_PATTERN_NAMES: list[str] = [
    "CDLDOJI",
    "CDLHAMMER",
    "CDLENGULFING",
    "CDLSHOOTINGSTAR",
    "CDLMORNINGSTAR",
    "CDLEVENINGSTAR",
]


def list_pattern_names() -> list[str]:
    """Return available candlestick pattern function names."""
    if TALIB_AVAILABLE and _talib is not None:
        return sorted(
            name
            for name in dir(_talib)
            if name.startswith("CDL") and callable(getattr(_talib, name))
        )
    return list(_FALLBACK_PATTERN_NAMES)


def _ohlc_arrays(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    return (
        df["open"].to_numpy(dtype=np.float64),
        df["high"].to_numpy(dtype=np.float64),
        df["low"].to_numpy(dtype=np.float64),
        df["close"].to_numpy(dtype=np.float64),
    )


def _fallback_detect(df: pd.DataFrame, patterns: list[str] | None) -> list[dict[str, Any]]:
    """Simple pandas stubs — clearly degraded, not TA-Lib equivalents."""
    names = patterns or _FALLBACK_PATTERN_NAMES
    names = [n.upper() for n in names if n.upper() in _FALLBACK_PATTERN_NAMES]
    if not names:
        names = list(_FALLBACK_PATTERN_NAMES)

    open_, high, low, close = _ohlc_arrays(df)
    body = np.abs(close - open_)
    range_ = np.maximum(high - low, 1e-12)
    upper_wick = high - np.maximum(open_, close)
    lower_wick = np.minimum(open_, close) - low
    results: list[dict[str, Any]] = []

    for i in range(len(df)):
        for name in names:
            signal = 0
            if name == "CDLDOJI" and body[i] / range_[i] < 0.1:
                signal = 100
            elif name == "CDLHAMMER" and lower_wick[i] >= 2 * body[i] and upper_wick[i] <= body[i]:
                signal = 100
            elif name == "CDLSHOOTINGSTAR" and upper_wick[i] >= 2 * body[i] and lower_wick[i] <= body[i]:
                signal = -100
            elif name == "CDLENGULFING" and i > 0:
                prev_bear = close[i - 1] < open_[i - 1]
                prev_bull = close[i - 1] > open_[i - 1]
                bull_engulf = (
                    prev_bear
                    and close[i] > open_[i]
                    and open_[i] <= close[i - 1]
                    and close[i] >= open_[i - 1]
                )
                bear_engulf = (
                    prev_bull
                    and close[i] < open_[i]
                    and open_[i] >= close[i - 1]
                    and close[i] <= open_[i - 1]
                )
                if bull_engulf:
                    signal = 100
                elif bear_engulf:
                    signal = -100
            elif name == "CDLMORNINGSTAR" and i >= 2:
                if (
                    close[i - 2] < open_[i - 2]
                    and body[i - 1] / range_[i - 1] < 0.3
                    and close[i] > open_[i]
                    and close[i] > (open_[i - 2] + close[i - 2]) / 2
                ):
                    signal = 100
            elif name == "CDLEVENINGSTAR" and i >= 2:
                if (
                    close[i - 2] > open_[i - 2]
                    and body[i - 1] / range_[i - 1] < 0.3
                    and close[i] < open_[i]
                    and close[i] < (open_[i - 2] + close[i - 2]) / 2
                ):
                    signal = -100

            if signal != 0:
                results.append(
                    {
                        "index": i,
                        "name": name,
                        "signal": int(signal),
                        "degraded": True,
                    }
                )
    return results


def detect_patterns(
    candles: list[dict[str, Any]],
    patterns: list[str] | None = None,
) -> dict[str, Any]:
    """Detect candlestick patterns on OHLCV data."""
    if len(candles) < 1:
        return {
            "mode": "talib" if TALIB_AVAILABLE else "degraded",
            "detections": [],
            "count": 0,
        }

    df = pd.DataFrame(candles)
    for col in ("open", "high", "low", "close"):
        if col not in df.columns:
            raise ValueError(f"Missing required candle field: {col}")
        df[col] = pd.to_numeric(df[col], errors="coerce")

    if df[["open", "high", "low", "close"]].isna().any().any():
        raise ValueError("OHLC values must be numeric")

    if not TALIB_AVAILABLE or _talib is None:
        detections = _fallback_detect(df, patterns)
        return {
            "mode": "degraded",
            "warning": (
                "TA-Lib not installed — using simple pandas stubs. "
                "Install the ta-lib system library and the TA-Lib Python package."
            ),
            "detections": detections,
            "count": len(detections),
        }

    open_, high, low, close = _ohlc_arrays(df)
    available = {n.upper(): n for n in list_pattern_names()}
    if patterns:
        selected = []
        for p in patterns:
            key = p.upper()
            if key in available:
                selected.append(available[key])
            elif hasattr(_talib, p):
                selected.append(p)
        if not selected:
            selected = list(available.values())
    else:
        selected = list(available.values())

    detections: list[dict[str, Any]] = []
    for name in selected:
        fn = getattr(_talib, name, None)
        if fn is None or not callable(fn):
            continue
        try:
            out = fn(open_, high, low, close)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Pattern %s failed: %s", name, exc)
            continue
        arr = np.asarray(out, dtype=np.int32)
        nonzero = np.nonzero(arr)[0]
        for idx in nonzero:
            detections.append(
                {
                    "index": int(idx),
                    "name": name,
                    "signal": int(arr[idx]),
                }
            )

    detections.sort(key=lambda d: (d["index"], d["name"]))
    return {
        "mode": "talib",
        "detections": detections,
        "count": len(detections),
    }
