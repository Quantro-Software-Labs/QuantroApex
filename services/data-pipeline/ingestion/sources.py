"""Asset universe — crypto (CCXT), stocks (yfinance), forex (Twelve Data)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AssetConfig:
    symbol: str
    exchange: str
    asset_class: str
    timeframes: list[str]
    history_years: int
    priority: int  # 1 = highest, fetched first


# ── CRYPTO — already ingested; ingestion_log skips bulk re-fetch ──
CRYPTO_ASSETS = [
    AssetConfig("BTC/USDT", "binance", "CRYPTO", ["1m", "5m", "15m", "1H", "4H", "1D"], 7, 1),
    AssetConfig("ETH/USDT", "binance", "CRYPTO", ["1m", "5m", "15m", "1H", "4H", "1D"], 7, 1),
    AssetConfig("BNB/USDT", "binance", "CRYPTO", ["5m", "15m", "1H", "4H", "1D"], 5, 1),
    AssetConfig("SOL/USDT", "binance", "CRYPTO", ["5m", "15m", "1H", "4H", "1D"], 4, 1),
    AssetConfig("XRP/USDT", "binance", "CRYPTO", ["5m", "15m", "1H", "4H", "1D"], 5, 1),
    AssetConfig("ADA/USDT", "binance", "CRYPTO", ["15m", "1H", "4H", "1D"], 4, 2),
    AssetConfig("AVAX/USDT", "binance", "CRYPTO", ["15m", "1H", "4H", "1D"], 3, 2),
    AssetConfig("DOGE/USDT", "binance", "CRYPTO", ["15m", "1H", "4H", "1D"], 4, 2),
    AssetConfig("BTC/USDT", "bybit", "CRYPTO", ["1H", "4H", "1D"], 3, 3),
    AssetConfig("ETH/USDT", "bybit", "CRYPTO", ["1H", "4H", "1D"], 3, 3),
]

# ── STOCKS — yfinance (no API key; works from Nigeria) ────────
STOCK_ASSETS = [
    AssetConfig("AAPL", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("MSFT", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("AMZN", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("GOOGL", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("TSLA", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("NVDA", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("META", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("SPY", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("QQQ", "yfinance", "STOCKS", ["15m", "1H", "1D"], 5, 1),
    AssetConfig("JPM", "yfinance", "STOCKS", ["1H", "1D"], 5, 2),
    AssetConfig("GLD", "yfinance", "STOCKS", ["1H", "1D"], 5, 2),
    # NGX majors — Yahoo .LG often 404; still attempt 1D × 10y for SCOPED_EDGE.
    AssetConfig("DANGCEM.LG", "yfinance", "STOCKS", ["1D"], 10, 1),
    AssetConfig("MTNN.LG", "yfinance", "STOCKS", ["1D"], 10, 1),
    AssetConfig("GTCO.LG", "yfinance", "STOCKS", ["1D"], 10, 1),
    AssetConfig("ZENITHBANK.LG", "yfinance", "STOCKS", ["1D"], 10, 1),
    AssetConfig("AIRTELAFRI.LG", "yfinance", "STOCKS", ["1D"], 10, 1),
    # African-linked LSE/JSE proxies (Yahoo-reachable; ngx-trend-follower)
    AssetConfig("AAF.L", "yfinance", "STOCKS", ["1D"], 10, 1),
    AssetConfig("SHEL.L", "yfinance", "STOCKS", ["1H", "1D"], 10, 2),
    AssetConfig("HSBA.L", "yfinance", "STOCKS", ["1H", "1D"], 5, 2),
    AssetConfig("BP.L", "yfinance", "STOCKS", ["1H", "1D"], 10, 2),
    AssetConfig("NPN.JO", "yfinance", "STOCKS", ["1H", "1D"], 10, 1),
    AssetConfig("MTN.JO", "yfinance", "STOCKS", ["1H", "1D"], 10, 1),
]

# ── FOREX — Twelve Data (Nigeria-accessible) ──────────────────
FOREX_ASSETS = [
    AssetConfig("EUR/USD", "twelvedata", "FOREX", ["15m", "1H", "4H", "1D"], 5, 1),
    AssetConfig("GBP/USD", "twelvedata", "FOREX", ["15m", "1H", "4H", "1D"], 5, 1),
    AssetConfig("USD/JPY", "twelvedata", "FOREX", ["15m", "1H", "4H", "1D"], 5, 1),
    AssetConfig("USD/CHF", "twelvedata", "FOREX", ["1H", "4H", "1D"], 5, 2),
    AssetConfig("AUD/USD", "twelvedata", "FOREX", ["1H", "4H", "1D"], 5, 2),
    AssetConfig("USD/CAD", "twelvedata", "FOREX", ["1H", "4H", "1D"], 5, 2),
    AssetConfig("GBP/JPY", "twelvedata", "FOREX", ["1H", "4H", "1D"], 5, 2),
    AssetConfig("EUR/GBP", "twelvedata", "FOREX", ["1H", "4H", "1D"], 5, 2),
    AssetConfig("EUR/JPY", "twelvedata", "FOREX", ["1H", "4H", "1D"], 5, 2),
    AssetConfig("GBP/CHF", "twelvedata", "FOREX", ["1H", "4H", "1D"], 4, 3),
    AssetConfig("USD/NGN", "twelvedata", "FOREX", ["1H", "1D"], 3, 2),
    AssetConfig("USD/ZAR", "twelvedata", "FOREX", ["1H", "1D"], 4, 2),
    AssetConfig("USD/KES", "twelvedata", "FOREX", ["1H", "1D"], 3, 3),
    AssetConfig("USD/GHS", "twelvedata", "FOREX", ["1H", "1D"], 3, 3),
]

ALL_ASSETS = CRYPTO_ASSETS + STOCK_ASSETS + FOREX_ASSETS

STREAM_CRYPTO_SYMBOLS = [
    "BTC/USDT",
    "ETH/USDT",
    "BNB/USDT",
    "SOL/USDT",
    "XRP/USDT",
    "ADA/USDT",
    "AVAX/USDT",
    "DOGE/USDT",
]

STREAM_STOCK_SYMBOLS = [
    # Paper SCOPED_EDGE universe (primary + secondary)
    "AAPL",
    "MSFT",
    "SPY",
    "QQQ",
    "AAF.L",
    "MTN.JO",
    "NPN.JO",
    "SHEL.L",
    "BP.L",
    "DANGCEM.LG",
    "MTNN.LG",
    "GTCO.LG",
    "ZENITHBANK.LG",
    "AIRTELAFRI.LG",
    # Extra US coverage for labelling / product charts
    "AMZN",
    "GOOGL",
    "TSLA",
    "NVDA",
    "META",
]

STREAM_FOREX_SYMBOLS = [
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "USD/CHF",
    "AUD/USD",
    "USD/CAD",
    "GBP/JPY",
    "USD/NGN",
]

CCXT_TIMEFRAME_MAP = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1H": "1h",
    "4H": "4h",
    "1D": "1d",
    "1W": "1w",
}
