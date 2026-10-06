"""Real-time market data streaming — crypto, stocks, forex."""

from __future__ import annotations

import asyncio
import json
import queue
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from loguru import logger

from config import get_settings
from ingestion.sources import (
    CCXT_TIMEFRAME_MAP,
    STREAM_CRYPTO_SYMBOLS,
    STREAM_FOREX_SYMBOLS,
    STREAM_STOCK_SYMBOLS,
)
from processing.cleaner import DataCleaner
from storage.timescale import TimescaleWriter

# NG / CloudFront often blocks Binance+Bybit intermittently — try NG-friendly
# spot venues first, then the majors. REST poll uses the same order.
_CRYPTO_EXCHANGE_ORDER = (
    "okx",
    "gate",
    "bitget",
    "kucoin",
    "kraken",
    "bybit",
    "binance",
)


class RealTimeStreamer:
    """
    Maintains live feeds into TimescaleDB continuously from launch day.
    Completely independent of QuantroApex user activity.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.writer = TimescaleWriter()
        self.cleaner = DataCleaner()
        self.running = True
        self._watch_err_logged: set[str] = set()

    def stop(self) -> None:
        self.running = False

    async def run(self) -> None:
        logger.info("Starting real-time market data streaming")

        has_alpaca = bool(
            self.settings.alpaca_api_key and self.settings.alpaca_secret
        )
        has_twelvedata = bool(self.settings.twelvedata_api_key)

        tasks = [self.stream_crypto()]

        if has_alpaca:
            tasks.append(self.stream_alpaca_stocks())
            logger.info("Stocks: using Alpaca WebSocket stream")
        else:
            tasks.append(self.stream_yfinance_stocks())
            logger.info("Stocks: using yfinance polling (no Alpaca key found)")

        if has_twelvedata:
            tasks.append(self.stream_twelvedata_forex())
            logger.info("Forex: using Twelve Data WebSocket stream")
        else:
            logger.warning(
                "Forex: TWELVEDATA_API_KEY not set — forex streaming disabled"
            )

        await asyncio.gather(*tasks, return_exceptions=True)

    def _ccxt_pro_factory(self, name: str) -> Any:
        import ccxt.pro as ccxtpro

        # Spot-only — avoid option/linear instrument fetches that some CDNs block.
        opts = {
            "enableRateLimit": True,
            "options": {
                "defaultType": "spot",
                "fetchMarkets": ["spot"],
            },
        }
        factory = getattr(ccxtpro, name, None)
        if factory is None:
            raise ValueError(f"Unknown ccxt.pro exchange: {name}")
        return factory(opts)

    async def stream_crypto(self) -> None:
        """Live crypto via ccxt.pro watch, with REST poll fallback."""
        try:
            import ccxt.pro as ccxtpro  # noqa: F401
        except ImportError:
            logger.error("ccxt.pro unavailable — falling back to REST crypto poll")
            await self.poll_crypto_rest()
            return

        symbols = STREAM_CRYPTO_SYMBOLS
        timeframes = ["1m", "5m", "15m", "1H"]

        for name in _CRYPTO_EXCHANGE_ORDER:
            if not self.running:
                return
            logger.info(f"Crypto: trying {name} WebSocket stream")
            try:
                exchange = self._ccxt_pro_factory(name)
                await exchange.load_markets()
                # Confirm watch works before spawning the full fan-out
                await exchange.watch_ohlcv("BTC/USDT", "1m")
                logger.success(f"Crypto: WebSocket live via {name}")
            except Exception as exc:
                logger.warning(f"Crypto {name} unavailable: {exc}")
                try:
                    await exchange.close()
                except Exception:
                    pass
                continue

            try:
                while self.running:
                    self._watch_err_logged.clear()
                    watch_tasks = [
                        self.watch_ohlcv(
                            exchange, symbol, tf, name, "CRYPTO"
                        )
                        for symbol in symbols
                        for tf in timeframes
                    ]
                    results = await asyncio.gather(
                        *watch_tasks, return_exceptions=True
                    )
                    failures = sum(
                        1 for r in results if isinstance(r, Exception)
                    )
                    if failures >= len(watch_tasks):
                        logger.warning(
                            f"Crypto {name} watch failed for all pairs — "
                            "trying next venue"
                        )
                        break
                    logger.warning(
                        f"Crypto {name} watchers restarted "
                        f"({failures}/{len(watch_tasks)} errors)"
                    )
                    await asyncio.sleep(5)
                else:
                    return  # self.running became False
            finally:
                try:
                    await exchange.close()
                except Exception:
                    pass

        logger.warning("Crypto WebSocket venues failed — using REST poll")
        await self.poll_crypto_rest()

    async def poll_crypto_rest(self) -> None:
        """Poll closed OHLCV bars when WebSockets are blocked."""
        try:
            import ccxt.async_support as ccxt
        except ImportError:
            logger.error("ccxt unavailable — crypto streaming disabled")
            return

        symbols = STREAM_CRYPTO_SYMBOLS
        timeframes = ["1m", "5m", "15m", "1H"]
        last_ts: dict[tuple[str, str], int] = {}

        exchange = None
        exchange_name = "okx"
        for name in _CRYPTO_EXCHANGE_ORDER:
            try:
                factory = getattr(ccxt, name)
                exchange = factory(
                    {
                        "enableRateLimit": True,
                        "options": {
                            "defaultType": "spot",
                            "fetchMarkets": ["spot"],
                        },
                    }
                )
                await exchange.load_markets()
                # Sanity check — confirm OHLCV works before committing
                probe = await exchange.fetch_ohlcv("BTC/USDT", "1m", limit=2)
                if not probe:
                    raise RuntimeError(f"{name} returned empty BTC/USDT OHLCV")
                exchange_name = name
                logger.info(f"Crypto: REST polling via {name}")
                break
            except Exception as exc:
                logger.warning(f"Crypto REST {name} failed: {exc}")
                if exchange is not None:
                    try:
                        await exchange.close()
                    except Exception:
                        pass
                    exchange = None

        if exchange is None:
            logger.error("No crypto venue reachable — crypto streaming disabled")
            return

        try:
            while self.running:
                for symbol in symbols:
                    for timeframe in timeframes:
                        if not self.running:
                            break
                        tf = CCXT_TIMEFRAME_MAP.get(timeframe, timeframe.lower())
                        try:
                            candles = await exchange.fetch_ohlcv(
                                symbol, tf, limit=3
                            )
                            if not candles or len(candles) < 2:
                                continue
                            closed = candles[-2]
                            ts = int(closed[0])
                            key = (symbol, timeframe)
                            if last_ts.get(key) == ts:
                                continue
                            last_ts[key] = ts
                            record = {
                                "time": datetime.fromtimestamp(
                                    ts / 1000, tz=timezone.utc
                                ),
                                "symbol": symbol,
                                "exchange": exchange_name,
                                "asset_class": "CRYPTO",
                                "timeframe": timeframe,
                                "open": float(closed[1]),
                                "high": float(closed[2]),
                                "low": float(closed[3]),
                                "close": float(closed[4]),
                                "volume": float(closed[5]),
                            }
                            cleaned = self.cleaner.clean([record])
                            if cleaned:
                                await self.writer.write_single_candle(cleaned[0])
                        except Exception as exc:
                            key = f"poll:{symbol}:{timeframe}"
                            if key not in self._watch_err_logged:
                                self._watch_err_logged.add(key)
                                logger.warning(
                                    f"Crypto poll error {symbol} {timeframe}: {exc}"
                                )
                            await asyncio.sleep(1)
                await asyncio.sleep(20)
        finally:
            try:
                await exchange.close()
            except Exception:
                pass

    async def watch_ohlcv(
        self,
        exchange: Any,
        symbol: str,
        timeframe: str,
        exchange_name: str,
        asset_class: str,
    ) -> None:
        tf = CCXT_TIMEFRAME_MAP.get(timeframe, timeframe.lower())
        last_closed_ts: int | None = None
        consecutive_errors = 0
        # OKX (and other venues) drop the keepalive ping-pong under load; if
        # watch_ohlcv hangs for 30 s with no data we treat it as a stale
        # connection and loop — CCXT Pro will reconnect on the next call.
        _WATCH_TIMEOUT = 30.0

        while self.running:
            try:
                candles = await asyncio.wait_for(
                    exchange.watch_ohlcv(symbol, tf),
                    timeout=_WATCH_TIMEOUT,
                )
                consecutive_errors = 0
                if not candles or len(candles) < 2:
                    continue
                closed = candles[-2]
                ts = int(closed[0])
                if last_closed_ts is not None and ts <= last_closed_ts:
                    continue
                last_closed_ts = ts
                record = {
                    "time": datetime.fromtimestamp(ts / 1000, tz=timezone.utc),
                    "symbol": symbol,
                    "exchange": exchange_name,
                    "asset_class": asset_class,
                    "timeframe": timeframe,
                    "open": float(closed[1]),
                    "high": float(closed[2]),
                    "low": float(closed[3]),
                    "close": float(closed[4]),
                    "volume": float(closed[5]),
                }
                cleaned = self.cleaner.clean([record])
                if cleaned:
                    await self.writer.write_single_candle(cleaned[0])
            except asyncio.TimeoutError:
                # Keepalive stall — log once per pair then loop; CCXT Pro will
                # re-enter the WebSocket on the next watch_ohlcv call.
                key = f"{exchange_name}:{symbol}:{timeframe}:timeout"
                if key not in self._watch_err_logged:
                    self._watch_err_logged.add(key)
                    logger.warning(
                        f"Watch timeout {symbol} {timeframe} — keepalive stall, "
                        "re-entering watch (no reconnect needed)"
                    )
                await asyncio.sleep(2)
            except Exception as exc:
                consecutive_errors += 1
                key = f"{exchange_name}:{symbol}:{timeframe}"
                if key not in self._watch_err_logged:
                    self._watch_err_logged.add(key)
                    logger.warning(f"Watch error {symbol} {timeframe}: {exc}")
                if consecutive_errors >= 3:
                    raise
                await asyncio.sleep(min(5 * consecutive_errors, 30))

    async def stream_alpaca_stocks(self) -> None:
        settings = self.settings
        if not settings.alpaca_api_key or not settings.alpaca_secret:
            logger.warning("Alpaca credentials missing — stock streaming disabled")
            while self.running:
                await asyncio.sleep(60)
            return

        try:
            from alpaca.data.live import StockDataStream
        except ImportError:
            logger.error("alpaca-py live stream unavailable — falling back to yfinance")
            await self.stream_yfinance_stocks()
            return

        symbols = STREAM_STOCK_SYMBOLS
        bar_queue: queue.Queue = queue.Queue(maxsize=5000)
        fallback = asyncio.Event()

        async def consume_bars() -> None:
            while self.running and not fallback.is_set():
                try:
                    bar = await asyncio.to_thread(bar_queue.get, True, 1.0)
                except queue.Empty:
                    continue
                try:
                    ts = bar.timestamp
                    if isinstance(ts, datetime) and ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    record = {
                        "time": ts,
                        "symbol": bar.symbol,
                        "exchange": "alpaca",
                        "asset_class": "STOCKS",
                        "timeframe": "1m",
                        "open": float(bar.open),
                        "high": float(bar.high),
                        "low": float(bar.low),
                        "close": float(bar.close),
                        "volume": float(bar.volume),
                    }
                    cleaned = self.cleaner.clean([record])
                    if cleaned:
                        await self.writer.write_single_candle(cleaned[0])
                except Exception as exc:
                    logger.warning(f"Alpaca bar write error: {exc}")

        def _stop_client(client: Any) -> None:
            for name in ("stop", "close"):
                fn = getattr(client, name, None)
                if callable(fn):
                    try:
                        fn()
                    except Exception:
                        pass

        async def run_client() -> None:
            # Free Alpaca accounts allow 1 concurrent WS — don't hammer reconnects
            limit_hits = 0
            while self.running and not fallback.is_set():
                client: Any = None
                try:
                    client = StockDataStream(
                        settings.alpaca_api_key,
                        settings.alpaca_secret,
                    )

                    async def handle_bar(bar: Any) -> None:
                        try:
                            bar_queue.put_nowait(bar)
                        except queue.Full:
                            pass

                    client.subscribe_bars(handle_bar, *symbols)
                    logger.info("Alpaca WebSocket connecting…")
                    await asyncio.to_thread(client.run)
                    limit_hits = 0
                except Exception as exc:
                    msg = str(exc).lower()
                    if client is not None:
                        await asyncio.to_thread(_stop_client, client)
                    if "connection limit" in msg:
                        limit_hits += 1
                        logger.error(
                            "Alpaca connection limit exceeded "
                            f"(attempt {limit_hits}/2). "
                            "Only 1 live WS is allowed per account — "
                            "stop other main.py / Alpaca clients, wait ~60s."
                        )
                        if limit_hits >= 2:
                            fallback.set()
                            return
                        await asyncio.sleep(90)
                    else:
                        logger.error(
                            f"Alpaca stream error: {exc} — reconnecting in 30s"
                        )
                        await asyncio.sleep(30)

        await asyncio.gather(consume_bars(), run_client())
        if self.running and fallback.is_set():
            logger.warning("Falling back to yfinance stock polling")
            await self.stream_yfinance_stocks()

    async def stream_yfinance_stocks(self) -> None:
        """Poll yfinance every minute when Alpaca keys are absent."""
        try:
            import yfinance as yf
        except ImportError:
            logger.error("yfinance not installed — stock polling disabled")
            return

        symbols = STREAM_STOCK_SYMBOLS

        def is_market_hours() -> bool:
            now = datetime.now(timezone.utc)
            if now.weekday() >= 5:
                return False
            hour = now.hour + now.minute / 60
            return 14.5 <= hour <= 21.0

        while self.running:
            if not is_market_hours():
                await asyncio.sleep(60)
                continue

            for symbol in symbols:
                try:
                    def _pull(sym: str = symbol) -> dict[str, Any] | None:
                        ticker = yf.Ticker(sym)
                        df = ticker.history(period="1d", interval="1m", prepost=False)
                        if df is None or len(df) < 2:
                            return None
                        latest = df.iloc[-2]
                        time_idx = df.index[-2]
                        raw_time = pd.Timestamp(time_idx)
                        if raw_time.tzinfo is not None:
                            raw_time = raw_time.tz_convert("UTC").tz_localize(None)
                        dt = raw_time.to_pydatetime().replace(tzinfo=timezone.utc)
                        return {
                            "time": dt,
                            "symbol": sym,
                            "exchange": "yfinance",
                            "asset_class": "STOCKS",
                            "timeframe": "1m",
                            "open": float(latest["Open"]),
                            "high": float(latest["High"]),
                            "low": float(latest["Low"]),
                            "close": float(latest["Close"]),
                            "volume": float(latest.get("Volume", 0) or 0),
                        }

                    record = await asyncio.to_thread(_pull)
                    if record:
                        cleaned = self.cleaner.clean([record])
                        if cleaned:
                            await self.writer.write_single_candle(cleaned[0])
                    await asyncio.sleep(0.5)
                except Exception as exc:
                    logger.debug(f"yfinance poll error for {symbol}: {exc}")

            await asyncio.sleep(60)

    async def stream_twelvedata_forex(self) -> None:
        """Twelve Data WebSocket ticks → 1m synthetic candles."""
        try:
            import websockets
        except ImportError:
            logger.error("websockets not installed — forex streaming disabled")
            return

        api_key = self.settings.twelvedata_api_key
        if not api_key:
            logger.error("TWELVEDATA_API_KEY not set — forex streaming disabled")
            return

        url = f"wss://ws.twelvedata.com/v1/quotes/price?apikey={api_key}"
        symbols = STREAM_FOREX_SYMBOLS[:8]  # free-tier max 8
        tick_buckets: dict[str, dict[str, Any]] = {}

        def get_bucket_time() -> datetime:
            now = datetime.now(timezone.utc)
            return now.replace(second=0, microsecond=0)

        async def flush_completed_buckets(current_bucket: datetime) -> None:
            to_flush = [
                (sym, data)
                for sym, data in list(tick_buckets.items())
                if data["bucket"] < current_bucket
            ]
            for sym, data in to_flush:
                record = {
                    "time": data["bucket"],
                    "symbol": sym,
                    "exchange": "twelvedata",
                    "asset_class": "FOREX",
                    "timeframe": "1m",
                    "open": data["open"],
                    "high": data["high"],
                    "low": data["low"],
                    "close": data["close"],
                    "volume": 0.0,
                }
                cleaned = self.cleaner.clean([record])
                if cleaned:
                    await self.writer.write_single_candle(cleaned[0])
                del tick_buckets[sym]

        while self.running:
            try:
                async with websockets.connect(url, ping_interval=30) as ws:
                    logger.info("Twelve Data WebSocket connected")
                    await ws.send(
                        json.dumps(
                            {
                                "action": "subscribe",
                                "params": {"symbols": ",".join(symbols)},
                            }
                        )
                    )
                    async for message in ws:
                        if not self.running:
                            break
                        data = json.loads(message)
                        if data.get("event") != "price":
                            continue
                        symbol = str(data.get("symbol", "")).replace(":", "/")
                        try:
                            price = float(data.get("price", 0))
                        except (TypeError, ValueError):
                            continue
                        if not price:
                            continue

                        current_bucket = get_bucket_time()
                        await flush_completed_buckets(current_bucket)

                        if symbol not in tick_buckets:
                            tick_buckets[symbol] = {
                                "bucket": current_bucket,
                                "open": price,
                                "high": price,
                                "low": price,
                                "close": price,
                            }
                        else:
                            bucket = tick_buckets[symbol]
                            if bucket["bucket"] != current_bucket:
                                await flush_completed_buckets(current_bucket)
                                tick_buckets[symbol] = {
                                    "bucket": current_bucket,
                                    "open": price,
                                    "high": price,
                                    "low": price,
                                    "close": price,
                                }
                            else:
                                bucket["high"] = max(bucket["high"], price)
                                bucket["low"] = min(bucket["low"], price)
                                bucket["close"] = price
            except Exception as exc:
                name = type(exc).__name__
                if "ConnectionClosed" in name:
                    logger.warning(
                        f"Twelve Data WS closed: {exc} — reconnecting in 15s"
                    )
                    await asyncio.sleep(15)
                else:
                    logger.error(
                        f"Twelve Data stream error: {exc} — reconnecting in 30s"
                    )
                    await asyncio.sleep(30)
