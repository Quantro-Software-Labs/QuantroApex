"""VectorBT / pandas strategy labelling — produces training samples."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from loguru import logger

from processing.features import annotate_smc, extract_indicator_features
from storage.timescale import TimescaleReader, TimescaleWriter

VBT_AVAILABLE = False
try:
    import vectorbt as vbt  # type: ignore

    VBT_AVAILABLE = True
except ImportError:
    logger.warning("vectorbt not installed — using pandas trade extraction fallback")

from processing import features as feat_mod

TALIB_AVAILABLE = feat_mod.TALIB_AVAILABLE
_talib = feat_mod._talib


def _ema(close: np.ndarray, period: int) -> np.ndarray:
    return feat_mod._ema(close, period)


def _rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    return feat_mod._rsi(close, period)


def _macd(close: np.ndarray):
    return feat_mod._macd(close)


# Seeded strategies — crypto + stocks + forex (with per-strategy symbol lists)
STRATEGIES: dict[str, dict[str, Any]] = {
    "strat-crypto-bluechip": {
        "name": "Crypto Bluechip Momentum",
        "asset_class": "CRYPTO",
        "symbols": ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT"],
        "timeframe": "1D",
        "entry": lambda df: (
            (df["close"].values > _ema(df["close"].values, 50))
            & (_macd(df["close"].values)[0] > _macd(df["close"].values)[1])
        ),
        "exit": lambda df: (
            (df["close"].values < _ema(df["close"].values, 50))
            | (_macd(df["close"].values)[0] < _macd(df["close"].values)[1])
        ),
        "stop_loss": 0.05,
        "take_profit": 0.12,
    },
    "volatility-breakout": {
        "name": "Volatility Breakout",
        "asset_class": "CRYPTO",
        "symbols": ["BTC/USDT", "ETH/USDT", "SOL/USDT", "DOGE/USDT", "AVAX/USDT"],
        "timeframe": "1D",
        "entry": lambda df: (
            df["close"] > df["high"].rolling(20).max().shift(1)
        ).fillna(False).to_numpy(),
        "exit": lambda df: (df["close"].values < _ema(df["close"].values, 10)),
        "stop_loss": 0.04,
        "take_profit": 0.10,
    },
    "strat-crypto-vol-arb": {
        "name": "Crypto Volatility Arbitrage",
        "asset_class": "CRYPTO",
        "symbols": ["BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT"],
        "timeframe": "1D",
        "entry": lambda df: (
            (
                feat_mod._atr(
                    df["high"].values, df["low"].values, df["close"].values, 14
                )
                / df["close"].values
                > 0.03
            )
            & (_rsi(df["close"].values, 14) < 40)
        ),
        "exit": lambda df: (_rsi(df["close"].values, 14) > 55),
        "stop_loss": 0.05,
        "take_profit": 0.08,
    },
    "apex-momentum-alpha": {
        "name": "Apex Momentum Alpha",
        "asset_class": "STOCKS",
        "symbols": [
            "AAPL",
            "MSFT",
            "AMZN",
            "GOOGL",
            "TSLA",
            "NVDA",
            "META",
            "SPY",
            "QQQ",
        ],
        "timeframe": "1D",
        "entry": lambda df: (
            (_ema(df["close"].values, 20) > _ema(df["close"].values, 50))
            & (_rsi(df["close"].values, 14) > 50)
            & (_rsi(df["close"].values, 14) < 70)
        ),
        "exit": lambda df: (
            (_ema(df["close"].values, 20) < _ema(df["close"].values, 50))
            | (_rsi(df["close"].values, 14) > 75)
        ),
        "stop_loss": 0.03,
        "take_profit": 0.06,
    },
    "mean-reversion-conservative": {
        "name": "Mean Reversion Conservative",
        "asset_class": "STOCKS",
        "symbols": ["AAPL", "MSFT", "SPY", "QQQ", "JPM", "GLD"],
        "timeframe": "1D",
        "entry": lambda df: (
            (_rsi(df["close"].values, 14) < 35)
            & (df["close"].values > _ema(df["close"].values, 200))
        ),
        "exit": lambda df: (_rsi(df["close"].values, 14) > 55),
        "stop_loss": 0.025,
        "take_profit": 0.05,
    },
    "ngx-trend-follower": {
        "name": "NGX Trend Follower",
        "asset_class": "STOCKS",
        # Prefer NGX .LG when Yahoo has data; keep LSE/JSE African proxies.
        "symbols": [
            "DANGCEM.LG",
            "MTNN.LG",
            "GTCO.LG",
            "ZENITHBANK.LG",
            "AIRTELAFRI.LG",
            "AAF.L",
            "MTN.JO",
            "NPN.JO",
            "SHEL.L",
            "BP.L",
        ],
        "timeframe": "1D",
        "entry": lambda df: (
            (_ema(df["close"].values, 20) > _ema(df["close"].values, 50))
            & (df["close"].values > _ema(df["close"].values, 200))
        ),
        "exit": lambda df: (
            _ema(df["close"].values, 20) < _ema(df["close"].values, 50)
        ),
        "stop_loss": 0.04,
        "take_profit": 0.08,
    },
    "strat-breakout-engine": {
        "name": "Breakout Engine Pro",
        "asset_class": "STOCKS",
        "symbols": ["AAPL", "TSLA", "NVDA", "META", "SPY"],
        "timeframe": "1D",
        "entry": lambda df: (
            df["close"] > df["high"].rolling(20).max().shift(1)
        ).fillna(False).to_numpy(),
        "exit": lambda df: (df["close"].values < _ema(df["close"].values, 10)),
        "stop_loss": 0.04,
        "take_profit": 0.10,
    },
    "forex-trend-follower": {
        "name": "Macro Trend Follower",
        "asset_class": "FOREX",
        "symbols": ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD"],
        "timeframe": "1D",
        "entry": lambda df: (
            (_ema(df["close"].values, 20) > _ema(df["close"].values, 50))
            & (_ema(df["close"].values, 50) > _ema(df["close"].values, 200))
        ),
        "exit": lambda df: (
            _ema(df["close"].values, 20) < _ema(df["close"].values, 50)
        ),
        "stop_loss": 0.02,
        "take_profit": 0.04,
    },
    "forex-session-breakout": {
        "name": "Session Breakout",
        "asset_class": "FOREX",
        "symbols": ["GBP/USD", "EUR/USD", "GBP/JPY", "USD/CHF"],
        "timeframe": "1H",
        "entry": lambda df: (
            (df["close"].values > df["high"].shift(4).fillna(0).values)
            & (_rsi(df["close"].values, 14) > 50)
        ),
        "exit": lambda df: (
            (_rsi(df["close"].values, 14) > 70)
            | (df["close"].values < _ema(df["close"].values, 20))
        ),
        "stop_loss": 0.015,
        "take_profit": 0.03,
    },
    "naira-pair-momentum": {
        "name": "Naira Pair Momentum",
        "asset_class": "FOREX",
        "symbols": ["USD/NGN", "USD/ZAR", "USD/GHS", "USD/KES"],
        "timeframe": "1D",
        "entry": lambda df: (
            (df["close"].values > _ema(df["close"].values, 20))
            & (_macd(df["close"].values)[0] > _macd(df["close"].values)[1])
        ),
        "exit": lambda df: (df["close"].values < _ema(df["close"].values, 20)),
        "stop_loss": 0.025,
        "take_profit": 0.05,
    },
}


# How many candles to load per symbol when labelling.
# Must be high enough that deep forex 1H history (30k+) is actually used.
_LABEL_OHLCV_LIMITS: dict[str, int] = {
    "1m": 100_000,
    "5m": 100_000,
    "15m": 100_000,
    "1H": 50_000,
    "4H": 20_000,
    "1D": 8_000,
}


def _label_ohlcv_limit(timeframe: str) -> int:
    return _LABEL_OHLCV_LIMITS.get(timeframe, 20_000)


class StrategyLabeller:
    """
    Runs seeded strategies against historical OHLCV.
    Produces labelled trade samples for Global Brain pre-training.
    """

    def __init__(self) -> None:
        self.reader = TimescaleReader()
        self.writer = TimescaleWriter()

    async def run_all(self, strategy_ids: list[str] | None = None) -> int:
        logger.info("Starting strategy labelling pipeline")
        total_samples = 0
        items = STRATEGIES.items()
        if strategy_ids:
            wanted = set(strategy_ids)
            items = [(k, v) for k, v in STRATEGIES.items() if k in wanted]
            missing = wanted - {k for k, _ in items}
            if missing:
                logger.warning(f"Unknown strategy ids skipped: {sorted(missing)}")
        for strategy_id, strategy in items:
            logger.info(f"Labelling strategy: {strategy['name']}")
            samples = await self.label_strategy(strategy_id, strategy)
            total_samples += samples
            logger.info(f"  Generated {samples:,} labelled samples")
        logger.success(f"Labelling complete. Total samples: {total_samples:,}")
        return total_samples

    async def label_strategy(self, strategy_id: str, strategy: dict[str, Any]) -> int:
        # Preserve existing crypto labels — skip if already labelled
        if strategy.get("asset_class") == "CRYPTO":
            existing = await self.writer.strategy_sample_count(strategy_id)
            if existing > 0:
                logger.info(
                    f"Skipping {strategy_id} — {existing:,} crypto samples already exist"
                )
                return 0

        asset_class = strategy["asset_class"]
        timeframe = strategy.get("timeframe", "1D")
        if "symbols" in strategy:
            symbols = list(strategy["symbols"])
        else:
            symbols = await self.reader.get_symbols(asset_class)
        all_samples: list[dict[str, Any]] = []

        for symbol in symbols:
            limit = _label_ohlcv_limit(timeframe)
            df = await self.reader.get_ohlcv(symbol, timeframe, limit=limit)
            if len(df) < 100:
                logger.debug(
                    f"Skipping {symbol} — insufficient data ({len(df)} rows)"
                )
                continue
            try:
                entries_raw = strategy["entry"](df)
                exits_raw = strategy["exit"](df)
                entries = pd.Series(
                    np.asarray(entries_raw).astype(bool), index=df.index
                ).fillna(False)
                exits = pd.Series(
                    np.asarray(exits_raw).astype(bool), index=df.index
                ).fillna(False)

                trades = self._extract_trades(
                    df,
                    entries,
                    exits,
                    sl=strategy.get("stop_loss"),
                    tp=strategy.get("take_profit"),
                )
                smc = annotate_smc(df)

                for trade in trades:
                    entry_idx = trade["entry_idx"]
                    features = extract_indicator_features(df, entry_idx)
                    features["smc_structure"] = smc.get("structure")
                    features["smc_fvg_count"] = len(smc.get("fvgs", []))
                    features["smc_ob_count"] = len(smc.get("order_blocks", []))

                    all_samples.append(
                        {
                            "symbol": symbol,
                            "exchange": self.get_exchange(asset_class),
                            "asset_class": asset_class,
                            "timeframe": timeframe,
                            "strategy_id": strategy_id,
                            "entry_time": trade["entry_time"],
                            "exit_time": trade["exit_time"],
                            "entry_price": trade["entry_price"],
                            "exit_price": trade["exit_price"],
                            "direction": "BUY",
                            "outcome": trade["outcome"],
                            "pnl_pct": trade["pnl_pct"],
                            "hold_duration": trade["hold_duration"],
                            "market_regime": self.classify_regime(df, entry_idx),
                            "features": features,
                            "signal_strength": self.compute_signal_strength(features),
                        }
                    )
            except Exception as exc:
                logger.error(f"Labelling error for {symbol}: {exc}")
                continue

        if all_samples:
            await self.writer.write_labelled_samples(all_samples)
        return len(all_samples)

    def _extract_trades(
        self,
        df: pd.DataFrame,
        entries: pd.Series,
        exits: pd.Series,
        sl: float | None,
        tp: float | None,
    ) -> list[dict[str, Any]]:
        if VBT_AVAILABLE:
            try:
                portfolio = vbt.Portfolio.from_signals(
                    df["close"],
                    entries=entries,
                    exits=exits,
                    init_cash=10_000,
                    fees=0.001,
                    sl_stop=sl,
                    tp_stop=tp,
                    freq="1D",
                )
                if len(portfolio.trades.records) == 0:
                    return []
                trades_df = portfolio.trades.records_readable
                out = []
                for _, trade in trades_df.iterrows():
                    entry_index = trade["Entry Index"]
                    exit_index = trade["Exit Index"]
                    try:
                        entry_idx = int(df.index.get_loc(entry_index))
                    except (KeyError, TypeError):
                        continue
                    pnl = float(trade["Return"])
                    duration = trade.get("Duration")
                    hold = int(getattr(duration, "days", 0) or 0)
                    out.append(
                        {
                            "entry_idx": entry_idx,
                            "entry_time": entry_index
                            if hasattr(entry_index, "isoformat")
                            else df.index[entry_idx],
                            "exit_time": exit_index
                            if hasattr(exit_index, "isoformat")
                            else None,
                            "entry_price": float(trade["Entry Price"]),
                            "exit_price": float(trade["Exit Price"]),
                            "pnl_pct": pnl,
                            # BREAKEVEN collapsed into LOSS; >0.1% after fees = WIN
                            "outcome": "WIN" if pnl > 0.001 else "LOSS",
                            "hold_duration": hold,
                        }
                    )
                return out
            except Exception as exc:
                logger.debug(f"vectorbt path failed, using fallback: {exc}")

        return self._pandas_trades(df, entries, exits, sl, tp)

    def _pandas_trades(
        self,
        df: pd.DataFrame,
        entries: pd.Series,
        exits: pd.Series,
        sl: float | None,
        tp: float | None,
    ) -> list[dict[str, Any]]:
        closes = df["close"].to_numpy()
        times = df.index
        in_pos = False
        entry_idx = 0
        entry_price = 0.0
        trades: list[dict[str, Any]] = []

        for i in range(len(df)):
            price = float(closes[i])
            if not in_pos and bool(entries.iloc[i]):
                in_pos = True
                entry_idx = i
                entry_price = price
                continue
            if in_pos:
                ret = (price - entry_price) / entry_price
                hit_sl = sl is not None and ret <= -sl
                hit_tp = tp is not None and ret >= tp
                hit_exit = bool(exits.iloc[i])
                if hit_sl or hit_tp or hit_exit or i == len(df) - 1:
                    # BREAKEVEN collapsed into LOSS; >0.1% covers fees/slippage
                    outcome = "WIN" if ret > 0.001 else "LOSS"
                    trades.append(
                        {
                            "entry_idx": entry_idx,
                            "entry_time": times[entry_idx],
                            "exit_time": times[i],
                            "entry_price": entry_price,
                            "exit_price": price,
                            "pnl_pct": float(ret),
                            "outcome": outcome,
                            "hold_duration": i - entry_idx,
                        }
                    )
                    in_pos = False
        return trades

    def classify_regime(self, df: pd.DataFrame, idx: int) -> str:
        if idx < 50:
            return "UNKNOWN"
        close = df["close"].to_numpy(dtype=np.float64)
        atr = feat_mod._atr(df["high"].values, df["low"].values, close, 14)
        ema20 = _ema(close, 20)
        ema50 = _ema(close, 50)

        if (
            not np.isnan(ema20[idx])
            and not np.isnan(ema50[idx])
            and ema20[idx] > ema50[idx]
            and close[idx] > ema20[idx]
        ):
            if not np.isnan(atr[idx]) and atr[idx] / close[idx] > 0.02:
                return "TRENDING_VOLATILE"
            return "TRENDING"

        ema_diff = abs(ema20[idx] - ema50[idx]) / close[idx]
        if ema_diff < 0.005:
            return "RANGING"
        return "MIXED"

    def compute_signal_strength(self, features: dict[str, Any]) -> float:
        score = 0.5
        rsi = features.get("rsi")
        if rsi is not None:
            if 40 < rsi < 60:
                score += 0.1
            elif rsi < 30 or rsi > 70:
                score -= 0.1
        macd_hist = features.get("macd_hist")
        if macd_hist is not None:
            score += min(0.2, abs(macd_hist) / 100)
        vol_ratio = features.get("volume_ratio")
        if vol_ratio and vol_ratio > 1.5:
            score += 0.1
        return max(0.0, min(1.0, float(score)))

    def get_exchange(self, asset_class: str) -> str:
        return {
            "CRYPTO": "binance",
            "STOCKS": "yfinance",
            "FOREX": "twelvedata",
        }[asset_class]
