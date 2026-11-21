"""Feature engineering — technical indicators + lightweight SMC annotations."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from loguru import logger

TALIB_AVAILABLE = False
_talib: Any = None

try:
    import talib as _talib  # type: ignore

    TALIB_AVAILABLE = True
except ImportError:
    logger.warning("TA-Lib not available — using pandas indicator fallbacks")


FEATURE_KEYS = [
    "rsi",
    "macd",
    "macd_signal",
    "macd_hist",
    "price_vs_ema20",
    "price_vs_ema50",
    "price_vs_ema200",
    "atr_pct",
    "bb_position",
    "volume_ratio",
]


def _ema(series: np.ndarray, period: int) -> np.ndarray:
    if TALIB_AVAILABLE:
        return _talib.EMA(series, period)
    s = pd.Series(series)
    return s.ewm(span=period, adjust=False).mean().to_numpy()


def wilder_rsi(series: np.ndarray, period: int = 14) -> np.ndarray:
    """RSI calculation using Wilder's original exponential smoothing."""
    n = len(series)
    out = np.full(n, np.nan, dtype=np.float64)
    if n <= period:
        return out
    diff = np.diff(series.astype(np.float64))
    gains = np.maximum(diff, 0.0)
    losses = np.maximum(-diff, 0.0)

    avg_gain = float(np.mean(gains[:period]))
    avg_loss = float(np.mean(losses[:period]))
    if avg_loss == 0.0:
        out[period] = 100.0 if avg_gain > 0.0 else 50.0
    else:
        rs = avg_gain / avg_loss
        out[period] = 100.0 - (100.0 / (1.0 + rs))

    for i in range(period, len(diff)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        idx = i + 1
        if avg_loss == 0.0:
            out[idx] = 100.0 if avg_gain > 0.0 else 50.0
        else:
            rs = avg_gain / avg_loss
            out[idx] = 100.0 - (100.0 / (1.0 + rs))
    return out


def _rsi(series: np.ndarray, period: int = 14) -> np.ndarray:
    if TALIB_AVAILABLE:
        return _talib.RSI(series.astype(np.float64), period)
    return wilder_rsi(series, period)


def _macd(series: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if TALIB_AVAILABLE:
        return _talib.MACD(series)
    ema12 = _ema(series, 12)
    ema26 = _ema(series, 26)
    macd = ema12 - ema26
    signal = _ema(macd, 9)
    hist = macd - signal
    return macd, signal, hist


def _atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
    if TALIB_AVAILABLE:
        return _talib.ATR(high, low, close, period)
    prev_close = np.roll(close, 1)
    prev_close[0] = close[0]
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev_close), np.abs(low - prev_close)))
    return pd.Series(tr).rolling(period).mean().to_numpy()


def _bbands(close: np.ndarray, period: int = 20) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if TALIB_AVAILABLE:
        return _talib.BBANDS(close, period)
    s = pd.Series(close)
    mid = s.rolling(period).mean()
    std = s.rolling(period).std()
    return (mid + 2 * std).to_numpy(), mid.to_numpy(), (mid - 2 * std).to_numpy()


def _safe(arr: np.ndarray, i: int) -> float | None:
    if i < 0 or i >= len(arr):
        return None
    val = arr[i]
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return float(val)


def extract_indicator_features(df: pd.DataFrame, idx: int) -> dict[str, Any]:
    """Extract the 14 core indicator features at bar index `idx`."""
    close = df["close"].to_numpy(dtype=np.float64)
    high = df["high"].to_numpy(dtype=np.float64)
    low = df["low"].to_numpy(dtype=np.float64)
    volume = df["volume"].to_numpy(dtype=np.float64)

    rsi = _rsi(close, 14)
    macd, macd_signal, macd_hist = _macd(close)
    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    ema200 = _ema(close, 200)
    atr = _atr(high, low, close, 14)
    bb_upper, _bb_mid, bb_lower = _bbands(close, 20)

    vol_window = volume[max(0, idx - 20) : idx]
    volume_ratio = float(volume[idx] / np.mean(vol_window)) if len(vol_window) > 0 and np.mean(vol_window) else 1.0

    bb_pos = None
    if _safe(bb_upper, idx) is not None and _safe(bb_lower, idx) is not None:
        width = bb_upper[idx] - bb_lower[idx]
        if width and not np.isnan(width) and width != 0:
            bb_pos = float((close[idx] - bb_lower[idx]) / width)

    def vs_ema(ema: np.ndarray) -> float | None:
        e = _safe(ema, idx)
        if e is None or e == 0:
            return None
        return float(close[idx] / e - 1)

    return {
        "rsi": _safe(rsi, idx),
        "macd": _safe(macd, idx),
        "macd_signal": _safe(macd_signal, idx),
        "macd_hist": _safe(macd_hist, idx),
        "price_vs_ema20": vs_ema(ema20),
        "price_vs_ema50": vs_ema(ema50),
        "price_vs_ema200": vs_ema(ema200),
        "atr_pct": float(atr[idx] / close[idx]) if _safe(atr, idx) and close[idx] else 0.0,
        "bb_position": bb_pos if bb_pos is not None else 0.0,
        "volume_ratio": volume_ratio,
    }


def annotate_smc(df: pd.DataFrame, lookback: int = 2, current_idx: int | None = None) -> dict[str, Any]:
    """
    Lightweight Smart Money Concepts annotations on an OHLCV frame.
    Strictly causal: if current_idx is provided, evaluates features only up to current_idx.
    Swings confirmed by `lookback` subsequent bars only become visible at bar i + lookback <= current_idx.
    """
    if current_idx is None:
        current_idx = len(df) - 1
    if current_idx < 0:
        return {"structure": "UNKNOWN", "order_blocks": [], "fvgs": [], "liquidity": {"eq_highs": [], "eq_lows": []}}

    sub_df = df.iloc[: current_idx + 1]
    n = len(sub_df)
    if n < lookback * 2 + 5:
        return {"structure": "UNKNOWN", "order_blocks": [], "fvgs": [], "liquidity": {"eq_highs": [], "eq_lows": []}}

    high = sub_df["high"].to_numpy(dtype=np.float64)
    low = sub_df["low"].to_numpy(dtype=np.float64)
    close = sub_df["close"].to_numpy(dtype=np.float64)

    swings_h: list[dict[str, Any]] = []
    swings_l: list[dict[str, Any]] = []
    for i in range(lookback, n - lookback):
        wh = high[i - lookback : i + lookback + 1]
        wl = low[i - lookback : i + lookback + 1]
        if high[i] >= wh.max():
            swings_h.append({"index": i, "price": float(high[i])})
        if low[i] <= wl.min():
            swings_l.append({"index": i, "price": float(low[i])})

    structure = "RANGING"
    if len(swings_h) >= 2 and swings_h[-1]["price"] > swings_h[-2]["price"]:
        if len(swings_l) >= 2 and swings_l[-1]["price"] > swings_l[-2]["price"]:
            structure = "BULLISH"
    if len(swings_h) >= 2 and swings_h[-1]["price"] < swings_h[-2]["price"]:
        if len(swings_l) >= 2 and swings_l[-1]["price"] < swings_l[-2]["price"]:
            structure = "BEARISH"

    # Fair value gaps: 3-candle imbalance
    fvgs: list[dict[str, Any]] = []
    for i in range(2, n):
        if low[i] > high[i - 2]:
            fvgs.append(
                {
                    "index": i,
                    "type": "BULLISH_FVG",
                    "top": float(low[i]),
                    "bottom": float(high[i - 2]),
                }
            )
        elif high[i] < low[i - 2]:
            fvgs.append(
                {
                    "index": i,
                    "type": "BEARISH_FVG",
                    "top": float(low[i - 2]),
                    "bottom": float(high[i]),
                }
            )

    # Order block proxy: last opposing candle before impulsive move
    order_blocks: list[dict[str, Any]] = []
    if n >= 5:
        impulse = close[-1] - close[-5]
        if impulse > 0:
            order_blocks.append(
                {
                    "type": "BULLISH_OB",
                    "high": float(high[-5]),
                    "low": float(low[-5]),
                    "index": n - 5,
                }
            )
        elif impulse < 0:
            order_blocks.append(
                {
                    "type": "BEARISH_OB",
                    "high": float(high[-5]),
                    "low": float(low[-5]),
                    "index": n - 5,
                }
            )

    liquidity = {
        "eq_highs": swings_h[-3:] if swings_h else [],
        "eq_lows": swings_l[-3:] if swings_l else [],
    }

    return {
        "structure": structure,
        "order_blocks": order_blocks[-5:],
        "fvgs": fvgs[-10:],
        "liquidity": liquidity,
    }


def features_to_vector(features: dict[str, Any]) -> np.ndarray:
    """Convert feature dict to fixed-length float32 vector (len=10)."""
    vec = []
    for key in FEATURE_KEYS:
        val = features.get(key)
        if val is None or (isinstance(val, float) and (np.isnan(val) or np.isinf(val))):
            vec.append(0.0)
        else:
            vec.append(float(val))
    arr = np.asarray(vec, dtype=np.float32)
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    return np.clip(arr, -50.0, 50.0)


def precompute_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    """
    Compute (n_bars, 10) feature matrix once for an OHLCV frame.
    Much faster than calling extract_indicator_features per bar.
    """
    n = len(df)
    if n == 0:
        return np.zeros((0, len(FEATURE_KEYS)), dtype=np.float32)

    close = df["close"].to_numpy(dtype=np.float64)
    high = df["high"].to_numpy(dtype=np.float64)
    low = df["low"].to_numpy(dtype=np.float64)
    volume = df["volume"].to_numpy(dtype=np.float64)

    rsi = _rsi(close, 14)
    macd, macd_signal, macd_hist = _macd(close)
    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    ema200 = _ema(close, 200)
    atr = _atr(high, low, close, 14)
    bb_upper, _bb_mid, bb_lower = _bbands(close, 20)

    mat = np.zeros((n, len(FEATURE_KEYS)), dtype=np.float32)
    for i in range(n):
        def safe(arr: np.ndarray) -> float:
            v = arr[i]
            if v is None or (isinstance(v, float) and np.isnan(v)):
                return 0.0
            return float(v)

        vol_window = volume[max(0, i - 20) : i]
        vol_mean = float(np.mean(vol_window)) if len(vol_window) else 0.0
        volume_ratio = float(volume[i] / vol_mean) if vol_mean else 1.0

        bb_pos = 0.0
        bu, bl = bb_upper[i], bb_lower[i]
        if not (np.isnan(bu) or np.isnan(bl)):
            width = bu - bl
            if width:
                bb_pos = float((close[i] - bl) / width)

        def vs_ema(ema: np.ndarray) -> float:
            e = ema[i]
            if e is None or np.isnan(e) or e == 0:
                return 0.0
            return float(close[i] / e - 1)

        atr_i = atr[i]
        atr_pct = (
            float(atr_i / close[i])
            if not np.isnan(atr_i) and close[i]
            else 0.0
        )

        mat[i] = np.asarray(
            [
                safe(rsi),
                safe(macd),
                safe(macd_signal),
                safe(macd_hist),
                vs_ema(ema20),
                vs_ema(ema50),
                vs_ema(ema200),
                atr_pct,
                bb_pos,
                volume_ratio,
            ],
            dtype=np.float32,
        )
    # Harden against Inf/NaN and extreme magnitudes (causes CUDA NaN loss)
    mat = np.nan_to_num(mat, nan=0.0, posinf=0.0, neginf=0.0)
    return np.clip(mat, -50.0, 50.0).astype(np.float32)


def sequence_from_matrix(
    matrix: np.ndarray, end_idx: int, seq_len: int = 60
) -> np.ndarray:
    """Slice/pad a (seq_len, 10) window ending at end_idx from a precomputed matrix."""
    dim = matrix.shape[1] if matrix.ndim == 2 and matrix.shape[1] > 0 else len(FEATURE_KEYS)
    if matrix.size == 0 or end_idx < 0:
        return np.zeros((seq_len, dim), dtype=np.float32)
    start = max(0, end_idx - seq_len + 1)
    seq = matrix[start : end_idx + 1]
    if len(seq) < seq_len:
        pad = np.zeros((seq_len - len(seq), seq.shape[1]), dtype=np.float32)
        seq = np.concatenate([pad, seq], axis=0)
    return seq[-seq_len:].astype(np.float32)


def build_feature_sequence(df: pd.DataFrame, end_idx: int, seq_len: int = 60) -> np.ndarray:
    """Build (seq_len, 14) feature matrix ending at end_idx."""
    matrix = precompute_feature_matrix(df)
    return sequence_from_matrix(matrix, end_idx, seq_len)
