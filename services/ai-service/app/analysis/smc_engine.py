"""Smart Money Concepts (SMC) engine + TA-Lib / pandas indicators.

Methods (product brief):
  detect_structure, detect_order_blocks, detect_fvg, detect_liquidity,
  detect_pd_zones, compute_indicators (RSI, MACD, EMA20/50/200).

Gracefully degrades when the TA-Lib C library is missing.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

TALIB_AVAILABLE = False
_talib: Any = None

try:
    import talib as _talib  # type: ignore[no-redef]

    TALIB_AVAILABLE = True
except ImportError:
    logger.warning(
        "TA-Lib C library / Python package not available. "
        "Indicators will use pandas fallbacks (degraded mode). "
        "Install system ta-lib then `pip install TA-Lib`."
    )


def _swing_points(
    high: np.ndarray,
    low: np.ndarray,
    left: int = 2,
    right: int = 2,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Detect swing highs / lows with a simple fractal window."""
    swings_high: list[dict[str, Any]] = []
    swings_low: list[dict[str, Any]] = []
    n = len(high)
    for i in range(left, n - right):
        window_h = high[i - left : i + right + 1]
        window_l = low[i - left : i + right + 1]
        if high[i] >= window_h.max() and np.sum(window_h == high[i]) == 1:
            swings_high.append({"index": i, "price": float(high[i]), "type": "SH"})
        if low[i] <= window_l.min() and np.sum(window_l == low[i]) == 1:
            swings_low.append({"index": i, "price": float(low[i]), "type": "SL"})
    return swings_high, swings_low


def detect_structure(df: pd.DataFrame, lookback: int = 2) -> dict[str, Any]:
    """
    Market structure: swing highs/lows and BOS / CHoCH labels.

    Uses consecutive swing comparisons for a lightweight SMC structure map.
    """
    high = df["high"].to_numpy(dtype=np.float64)
    low = df["low"].to_numpy(dtype=np.float64)
    close = df["close"].to_numpy(dtype=np.float64)
    sh, sl = _swing_points(high, low, left=lookback, right=lookback)

    # Label HH/HL/LH/LL relative to prior same-side swing
    for i, swing in enumerate(sh):
        if i == 0:
            swing["type"] = "SH"
            continue
        swing["type"] = "HH" if swing["price"] > sh[i - 1]["price"] else "LH"
    for i, swing in enumerate(sl):
        if i == 0:
            swing["type"] = "SL"
            continue
        swing["type"] = "HL" if swing["price"] > sl[i - 1]["price"] else "LL"

    events: list[dict[str, Any]] = []
    # Break of structure / change of character vs last opposing swing
    last_sh = sh[-1] if sh else None
    last_sl = sl[-1] if sl else None
    bias = "neutral"
    if last_sh and last_sl:
        if close[-1] > last_sh["price"]:
            events.append(
                {
                    "index": int(len(close) - 1),
                    "type": "BOS",
                    "direction": "bullish",
                    "level": last_sh["price"],
                }
            )
            bias = "bullish"
        elif close[-1] < last_sl["price"]:
            events.append(
                {
                    "index": int(len(close) - 1),
                    "type": "BOS",
                    "direction": "bearish",
                    "level": last_sl["price"],
                }
            )
            bias = "bearish"
        elif len(sh) >= 2 and sh[-1]["type"] == "LH" and last_sl and close[-1] < last_sl["price"]:
            events.append(
                {
                    "index": int(len(close) - 1),
                    "type": "CHoCH",
                    "direction": "bearish",
                    "level": last_sl["price"],
                }
            )
            bias = "bearish"
        elif len(sl) >= 2 and sl[-1]["type"] == "HL" and last_sh and close[-1] > last_sh["price"]:
            events.append(
                {
                    "index": int(len(close) - 1),
                    "type": "CHoCH",
                    "direction": "bullish",
                    "level": last_sh["price"],
                }
            )
            bias = "bullish"

    return {
        "bias": bias,
        "swing_highs": sh[-20:],
        "swing_lows": sl[-20:],
        "events": events,
    }


def detect_order_blocks(df: pd.DataFrame, lookback: int = 3) -> list[dict[str, Any]]:
    """
    Order blocks: last opposing candle before a strong impulsive move.

    Bullish OB = last down-close before a run that breaks recent high.
    Bearish OB = last up-close before a run that breaks recent low.
    """
    open_ = df["open"].to_numpy(dtype=np.float64)
    high = df["high"].to_numpy(dtype=np.float64)
    low = df["low"].to_numpy(dtype=np.float64)
    close = df["close"].to_numpy(dtype=np.float64)
    n = len(df)
    blocks: list[dict[str, Any]] = []

    for i in range(lookback, n - 1):
        body = abs(close[i] - open_[i])
        rng = max(high[i] - low[i], 1e-12)
        # Impulse: next bar closes beyond prior lookback extreme
        prior_high = high[i - lookback : i].max()
        prior_low = low[i - lookback : i].min()
        next_close = close[i + 1]

        if close[i] < open_[i] and next_close > prior_high and body / rng > 0.4:
            blocks.append(
                {
                    "index": i,
                    "type": "bullish",
                    "top": float(max(open_[i], close[i])),
                    "bottom": float(min(open_[i], close[i])),
                    "high": float(high[i]),
                    "low": float(low[i]),
                }
            )
        elif close[i] > open_[i] and next_close < prior_low and body / rng > 0.4:
            blocks.append(
                {
                    "index": i,
                    "type": "bearish",
                    "top": float(max(open_[i], close[i])),
                    "bottom": float(min(open_[i], close[i])),
                    "high": float(high[i]),
                    "low": float(low[i]),
                }
            )

    return blocks[-30:]


def detect_fvg(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Fair Value Gaps (3-candle imbalance)."""
    high = df["high"].to_numpy(dtype=np.float64)
    low = df["low"].to_numpy(dtype=np.float64)
    gaps: list[dict[str, Any]] = []
    for i in range(2, len(df)):
        # Bullish FVG: candle[i-2].high < candle[i].low
        if low[i] > high[i - 2]:
            gaps.append(
                {
                    "index": i - 1,
                    "type": "bullish",
                    "top": float(low[i]),
                    "bottom": float(high[i - 2]),
                }
            )
        # Bearish FVG: candle[i-2].low > candle[i].high
        elif high[i] < low[i - 2]:
            gaps.append(
                {
                    "index": i - 1,
                    "type": "bearish",
                    "top": float(low[i - 2]),
                    "bottom": float(high[i]),
                }
            )
    return gaps[-40:]


def detect_liquidity(df: pd.DataFrame, lookback: int = 2) -> list[dict[str, Any]]:
    """
    Liquidity pools at equal highs / equal lows (resting stop clusters).

    Also flags recent swing extremes as buy-side / sell-side liquidity.
    """
    high = df["high"].to_numpy(dtype=np.float64)
    low = df["low"].to_numpy(dtype=np.float64)
    sh, sl = _swing_points(high, low, left=lookback, right=lookback)
    pools: list[dict[str, Any]] = []
    tol = float(np.nanmedian(high - low) or 1e-8) * 0.15

    for i in range(1, len(sh)):
        if abs(sh[i]["price"] - sh[i - 1]["price"]) <= tol:
            pools.append(
                {
                    "index": sh[i]["index"],
                    "side": "buy_side",
                    "price": float((sh[i]["price"] + sh[i - 1]["price"]) / 2),
                    "kind": "equal_highs",
                }
            )
    for i in range(1, len(sl)):
        if abs(sl[i]["price"] - sl[i - 1]["price"]) <= tol:
            pools.append(
                {
                    "index": sl[i]["index"],
                    "side": "sell_side",
                    "price": float((sl[i]["price"] + sl[i - 1]["price"]) / 2),
                    "kind": "equal_lows",
                }
            )

    if sh:
        pools.append(
            {
                "index": sh[-1]["index"],
                "side": "buy_side",
                "price": sh[-1]["price"],
                "kind": "swing_high",
            }
        )
    if sl:
        pools.append(
            {
                "index": sl[-1]["index"],
                "side": "sell_side",
                "price": sl[-1]["price"],
                "kind": "swing_low",
            }
        )

    return pools[-25:]


def detect_pd_zones(df: pd.DataFrame, lookback: int = 50) -> dict[str, Any]:
    """
    Premium / Discount zones from the recent dealing range.

    Equilibrium = midpoint; premium above, discount below.
    """
    window = df.tail(max(lookback, 10))
    range_high = float(window["high"].max())
    range_low = float(window["low"].min())
    eq = (range_high + range_low) / 2.0
    last = float(df["close"].iloc[-1])
    if last > eq:
        location = "premium"
    elif last < eq:
        location = "discount"
    else:
        location = "equilibrium"

    return {
        "range_high": range_high,
        "range_low": range_low,
        "equilibrium": eq,
        "premium": {"top": range_high, "bottom": eq},
        "discount": {"top": eq, "bottom": range_low},
        "price_location": location,
        "last_close": last,
    }


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi_pandas(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd_pandas(close: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal
    return macd, signal, hist


def _sample_series(series: pd.Series, max_points: int = 120) -> list[dict[str, Any]]:
    vals = series.to_numpy(dtype=np.float64)
    n = len(vals)
    if n == 0:
        return []
    step = max(1, n // max_points)
    out: list[dict[str, Any]] = []
    for i in range(0, n, step):
        v = vals[i]
        if np.isnan(v):
            continue
        out.append({"index": int(i), "value": float(v)})
    if n - 1 >= 0 and (n - 1) % step != 0 and not np.isnan(vals[-1]):
        out.append({"index": int(n - 1), "value": float(vals[-1])})
    return out


def compute_indicators(df: pd.DataFrame) -> dict[str, Any]:
    """
    RSI, MACD, EMA20/50/200 via TA-Lib when available, else pandas.

    Returns latest values plus lightly sampled series for charting.
    """
    close = df["close"].astype(np.float64)
    mode = "talib" if TALIB_AVAILABLE else "degraded"
    warning: str | None = None

    if TALIB_AVAILABLE and _talib is not None:
        c = close.to_numpy(dtype=np.float64)
        rsi = pd.Series(_talib.RSI(c, timeperiod=14), index=close.index)
        macd, signal, hist = _talib.MACD(c, fastperiod=12, slowperiod=26, signalperiod=9)
        macd_s = pd.Series(macd, index=close.index)
        signal_s = pd.Series(signal, index=close.index)
        hist_s = pd.Series(hist, index=close.index)
        ema20 = pd.Series(_talib.EMA(c, timeperiod=20), index=close.index)
        ema50 = pd.Series(_talib.EMA(c, timeperiod=50), index=close.index)
        ema200 = pd.Series(_talib.EMA(c, timeperiod=200), index=close.index)
    else:
        warning = (
            "TA-Lib not installed — using pandas RSI/MACD/EMA. "
            "Install the ta-lib system library and the TA-Lib Python package."
        )
        rsi = _rsi_pandas(close)
        macd_s, signal_s, hist_s = _macd_pandas(close)
        ema20 = _ema(close, 20)
        ema50 = _ema(close, 50)
        ema200 = _ema(close, 200)

    def _last(s: pd.Series) -> float | None:
        v = s.dropna()
        return float(v.iloc[-1]) if len(v) else None

    return {
        "mode": mode,
        "warning": warning,
        "latest": {
            "rsi": _last(rsi),
            "macd": _last(macd_s),
            "macd_signal": _last(signal_s),
            "macd_hist": _last(hist_s),
            "ema20": _last(ema20),
            "ema50": _last(ema50),
            "ema200": _last(ema200),
        },
        "series": {
            "rsi": _sample_series(rsi),
            "macd": _sample_series(macd_s),
            "macd_signal": _sample_series(signal_s),
            "macd_hist": _sample_series(hist_s),
            "ema20": _sample_series(ema20),
            "ema50": _sample_series(ema50),
            "ema200": _sample_series(ema200),
        },
    }


class SMCEngine:
    """Facade matching the product-brief method surface."""

    def detect_structure(self, df: pd.DataFrame, lookback: int = 2) -> dict[str, Any]:
        return detect_structure(df, lookback=lookback)

    def detect_order_blocks(self, df: pd.DataFrame, lookback: int = 3) -> list[dict[str, Any]]:
        return detect_order_blocks(df, lookback=lookback)

    def detect_fvg(self, df: pd.DataFrame) -> list[dict[str, Any]]:
        return detect_fvg(df)

    def detect_liquidity(self, df: pd.DataFrame, lookback: int = 2) -> list[dict[str, Any]]:
        return detect_liquidity(df, lookback=lookback)

    def detect_pd_zones(self, df: pd.DataFrame, lookback: int = 50) -> dict[str, Any]:
        return detect_pd_zones(df, lookback=lookback)

    def compute_indicators(self, df: pd.DataFrame) -> dict[str, Any]:
        return compute_indicators(df)

    def analyze(self, df: pd.DataFrame) -> dict[str, Any]:
        """Run full SMC overlay + indicator suite."""
        indicators = self.compute_indicators(df)
        return {
            "structure": self.detect_structure(df),
            "order_blocks": self.detect_order_blocks(df),
            "fvg": self.detect_fvg(df),
            "fair_value_gaps": self.detect_fvg(df),
            "liquidity": self.detect_liquidity(df),
            "liquidity_levels": self.detect_liquidity(df),
            "pd_zones": self.detect_pd_zones(df),
            "premium_discount": self.detect_pd_zones(df),
            "indicators": indicators,
            "talib": TALIB_AVAILABLE,
            "indicators_mode": indicators.get("mode"),
        }

    # British spelling alias used in the product brief
    def analyse(self, df: pd.DataFrame) -> dict[str, Any]:
        return self.analyze(df)


default_engine = SMCEngine()
