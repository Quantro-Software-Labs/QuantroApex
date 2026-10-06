"""OHLCV market data helpers for analysis endpoints.

Prefers Alpaca when ``ALPACA_API_KEY`` + ``ALPACA_SECRET_KEY`` are set;
otherwise synthesizes deterministic candles so local SMC / indicator demos
still work. Optionally tries the API gateway as a secondary live source.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_TIMEFRAME_DELTA: dict[str, timedelta] = {
    "1m": timedelta(minutes=1),
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "30m": timedelta(minutes=30),
    "1h": timedelta(hours=1),
    "4h": timedelta(hours=4),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
}

_ALPACA_TF: dict[str, str] = {
    "1m": "1Min",
    "5m": "5Min",
    "15m": "15Min",
    "30m": "30Min",
    "1h": "1Hour",
    "4h": "4Hour",
    "1d": "1Day",
    "1w": "1Week",
}

_SEED_PRICES: dict[str, float] = {
    "crypto": 50_000.0,
    "forex": 1.10,
    "stocks": 180.0,
    "indices": 4_500.0,
    "commodities": 2_000.0,
}


def _seed_for(symbol: str) -> int:
    digest = hashlib.sha256(symbol.upper().encode()).hexdigest()
    return int(digest[:8], 16)


def _base_price(asset_class: str, symbol: str) -> float:
    base = _SEED_PRICES.get(asset_class.lower(), 100.0)
    offset = (_seed_for(symbol) % 1000) / 1000.0
    return base * (0.85 + 0.3 * offset)


def alpaca_configured() -> bool:
    key = os.getenv("ALPACA_API_KEY", "").strip()
    secret = (
        os.getenv("ALPACA_SECRET_KEY", "").strip()
        or os.getenv("ALPACA_API_SECRET", "").strip()
    )
    return bool(key and secret)


def _alpaca_headers() -> dict[str, str]:
    return {
        "APCA-API-KEY-ID": os.getenv("ALPACA_API_KEY", "").strip(),
        "APCA-API-SECRET-KEY": (
            os.getenv("ALPACA_SECRET_KEY", "").strip()
            or os.getenv("ALPACA_API_SECRET", "").strip()
        ),
    }


def _normalize_crypto_symbol(symbol: str) -> str:
    s = symbol.upper().replace("-", "/")
    if "/" not in s:
        for quote in ("USDT", "USD", "USDC"):
            if s.endswith(quote) and len(s) > len(quote):
                return f"{s[: -len(quote)]}/{quote if quote != 'USDT' else 'USD'}"
        return f"{s}/USD"
    if s.endswith("/USDT"):
        return s.replace("/USDT", "/USD")
    return s


def synthesize_ohlcv(
    asset_class: str,
    symbol: str,
    timeframe: str = "1h",
    bars: int = 200,
) -> list[dict[str, Any]]:
    """Generate deterministic synthetic OHLCV for local analysis."""
    rng = np.random.default_rng(_seed_for(f"{asset_class}:{symbol}:{timeframe}"))
    delta = _TIMEFRAME_DELTA.get(timeframe.lower(), timedelta(hours=1))
    end = datetime.now(timezone.utc).replace(microsecond=0)
    start = end - delta * (bars - 1)

    price = _base_price(asset_class, symbol)
    vol = 0.002 if asset_class.lower() == "forex" else 0.012
    candles: list[dict[str, Any]] = []
    ts = start

    for _ in range(bars):
        ret = float(rng.normal(0.00015, vol))
        open_ = price
        close = max(price * (1.0 + ret), 1e-8)
        wick_up = abs(float(rng.normal(0, vol * 0.5)))
        wick_dn = abs(float(rng.normal(0, vol * 0.5)))
        high = max(open_, close) * (1.0 + wick_up)
        low = min(open_, close) * (1.0 - wick_dn)
        volume = float(rng.uniform(100, 10_000))
        candles.append(
            {
                "timestamp": ts.isoformat().replace("+00:00", "Z"),
                "open": round(float(open_), 8),
                "high": round(float(high), 8),
                "low": round(float(low), 8),
                "close": round(float(close), 8),
                "volume": round(volume, 4),
            }
        )
        price = close
        ts += delta

    return candles


def _bars_to_candles(raw_bars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candles: list[dict[str, Any]] = []
    for bar in raw_bars:
        try:
            ts = bar.get("t") or bar.get("timestamp") or bar.get("time")
            candles.append(
                {
                    "timestamp": ts,
                    "open": float(bar["o"] if "o" in bar else bar["open"]),
                    "high": float(bar["h"] if "h" in bar else bar["high"]),
                    "low": float(bar["l"] if "l" in bar else bar["low"]),
                    "close": float(bar["c"] if "c" in bar else bar["close"]),
                    "volume": float(bar.get("v") or bar.get("volume") or 0),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return candles


async def fetch_from_alpaca(
    asset_class: str,
    symbol: str,
    timeframe: str,
    bars: int = 200,
) -> list[dict[str, Any]] | None:
    """Fetch OHLCV from Alpaca market data API. Returns None on failure."""
    if not alpaca_configured():
        return None

    tf = _ALPACA_TF.get(timeframe.lower(), "1Hour")
    data_url = os.getenv("ALPACA_DATA_URL", "https://data.alpaca.markets/v2").rstrip("/")
    # data_url may already end with /v2 — crypto uses v1beta3
    root = data_url.rsplit("/v2", 1)[0] if data_url.endswith("/v2") else data_url.rsplit("/", 1)[0]
    if not root.startswith("http"):
        root = "https://data.alpaca.markets"

    ac = asset_class.lower()
    headers = _alpaca_headers()

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if ac in ("crypto", "cryptocurrency"):
                crypto_sym = _normalize_crypto_symbol(symbol)
                url = f"{root}/v1beta3/crypto/us/bars"
                params: dict[str, Any] = {
                    "symbols": crypto_sym,
                    "timeframe": tf,
                    "limit": bars,
                }
                res = await client.get(url, params=params, headers=headers)
                if res.status_code != 200:
                    logger.debug("Alpaca crypto bars %s → %s", url, res.status_code)
                    return None
                payload = res.json()
                # { "bars": { "BTC/USD": [ ... ] } } or list under symbol
                bars_map = payload.get("bars") or {}
                raw = bars_map.get(crypto_sym) or bars_map.get(symbol.upper()) or []
                if isinstance(raw, dict):
                    raw = raw.get("bars") or []
                candles = _bars_to_candles(raw if isinstance(raw, list) else [])
                return candles or None

            # Stocks / default
            stock_sym = symbol.upper().replace("/", "")
            url = f"{data_url}/stocks/{stock_sym}/bars"
            params = {
                "timeframe": tf,
                "limit": bars,
                "adjustment": "raw",
                "feed": os.getenv("ALPACA_DATA_FEED", "iex"),
            }
            res = await client.get(url, params=params, headers=headers)
            if res.status_code != 200:
                logger.debug("Alpaca stock bars %s → %s", url, res.status_code)
                return None
            payload = res.json()
            raw = payload.get("bars") or []
            candles = _bars_to_candles(raw if isinstance(raw, list) else [])
            return candles or None
    except Exception as exc:  # noqa: BLE001 — network optional
        logger.debug("Alpaca OHLCV unavailable: %s", exc)
        return None


async def fetch_from_gateway(
    asset_class: str,
    symbol: str,
    timeframe: str,
    bars: int = 200,
) -> list[dict[str, Any]] | None:
    """
    Optionally pull candles from the API gateway market facade.

    Set GATEWAY_URL (default http://127.0.0.1:3000). Returns None on failure
    so callers can fall back to synthetic data.
    """
    base = os.getenv("GATEWAY_URL", "http://127.0.0.1:3000").rstrip("/")
    url = f"{base}/market/ohlcv"
    params = {
        "assetClass": asset_class,
        "symbol": symbol,
        "timeframe": timeframe,
        "limit": bars,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(url, params=params)
            if res.status_code != 200:
                logger.debug("Gateway OHLCV %s → %s", url, res.status_code)
                return None
            payload = res.json()
            candles = payload.get("candles") or payload.get("data") or payload
            if not isinstance(candles, list) or not candles:
                return None
            normalized: list[dict[str, Any]] = []
            for c in candles:
                if not isinstance(c, dict):
                    continue
                try:
                    normalized.append(
                        {
                            "timestamp": c.get("timestamp") or c.get("t") or c.get("time"),
                            "open": float(c["open"]),
                            "high": float(c["high"]),
                            "low": float(c["low"]),
                            "close": float(c["close"]),
                            "volume": float(c.get("volume") or 0),
                        }
                    )
                except (KeyError, TypeError, ValueError):
                    continue
            return normalized or None
    except Exception as exc:  # noqa: BLE001 — network optional
        logger.debug("Gateway OHLCV unavailable: %s", exc)
        return None


async def load_ohlcv(
    asset_class: str,
    symbol: str,
    timeframe: str,
    bars: int = 200,
) -> tuple[list[dict[str, Any]], str]:
    """
    Load OHLCV candles.

    Priority: Alpaca (if keys) → gateway → synthetic.
    Returns (candles, source).
    """
    live = await fetch_from_alpaca(asset_class, symbol, timeframe, bars)
    if live:
        return live, "alpaca"

    gateway = await fetch_from_gateway(asset_class, symbol, timeframe, bars)
    if gateway:
        return gateway, "gateway"

    return synthesize_ohlcv(asset_class, symbol, timeframe, bars), "synthetic"


def candles_to_dataframe(candles: list[dict[str, Any]]) -> pd.DataFrame:
    """Convert candle dicts to a typed OHLCV DataFrame."""
    df = pd.DataFrame(candles)
    for col in ("open", "high", "low", "close"):
        if col not in df.columns:
            raise ValueError(f"Missing required candle field: {col}")
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if "volume" in df.columns:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    else:
        df["volume"] = 0.0
    if df[["open", "high", "low", "close"]].isna().any().any():
        raise ValueError("OHLC values must be numeric")
    if "timestamp" in df.columns and df["timestamp"].notna().any():
        idx = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
        if idx.notna().all():
            df.index = idx
    return df


class MarketDataFetcher:
    """Facade matching the product-brief market data surface."""

    async def fetch_ohlcv(
        self,
        asset_class: str,
        symbol: str,
        timeframe: str,
        period_days: int | None = None,
        bars: int | None = None,
    ) -> pd.DataFrame:
        if bars is None:
            if period_days is not None:
                # Rough bar count from period + timeframe
                delta = _TIMEFRAME_DELTA.get(timeframe.lower(), timedelta(hours=1))
                bars = max(30, int((timedelta(days=period_days).total_seconds() / delta.total_seconds()) + 1))
            else:
                bars = 200
        candles, _source = await load_ohlcv(asset_class, symbol, timeframe, bars=bars)
        return candles_to_dataframe(candles)
