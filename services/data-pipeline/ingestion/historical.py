"""Bulk historical OHLCV — CCXT crypto, yfinance stocks, Twelve Data forex."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import ccxt
import httpx
import pandas as pd
from loguru import logger

from config import get_settings
from ingestion.sources import ALL_ASSETS, CCXT_TIMEFRAME_MAP, AssetConfig
from processing.cleaner import DataCleaner
from storage.timescale import TimescaleWriter


class HistoricalIngester:
    """
    Pulls historical OHLCV for all configured assets.
    Handles rate limits, retries, and deduplication via ingestion_log.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.writer = TimescaleWriter()
        self.cleaner = DataCleaner()
        self.exchanges: dict[str, Any] = {}
        for name in ("binance", "bybit", "coinbase"):
            try:
                klass = getattr(ccxt, name)
                self.exchanges[name] = klass({"enableRateLimit": True})
            except Exception as exc:
                logger.warning(f"Could not init exchange {name}: {exc}")
        if "coinbase" in self.exchanges:
            self.exchanges["coinbasepro"] = self.exchanges["coinbase"]

    async def run(
        self,
        assets: list[AssetConfig] | None = None,
        *,
        asset_class: str | None = None,
        force: bool = False,
    ) -> int:
        logger.info("Starting historical bulk ingestion")
        logger.info(
            "  Sources: Binance/Bybit (crypto), yfinance (stocks), Twelve Data (forex)"
        )
        asset_list = assets or list(ALL_ASSETS)
        if asset_class:
            ac = asset_class.upper()
            asset_list = [a for a in asset_list if a.asset_class.upper() == ac]
            logger.info(f"Filtered to asset_class={ac}: {len(asset_list)} assets")
        if force and asset_list:
            from storage.timescale import TimescaleWriter

            writer = TimescaleWriter()
            # Clear log so yfinance / stocks re-fetch with longer history
            if asset_class and asset_class.upper() == "STOCKS":
                deleted = await writer.clear_ingestion_log(
                    exchange="yfinance",
                    symbol_like="%.LG",
                )
                logger.info(f"Cleared {deleted} ingestion_log rows for %.LG")
                stock_syms = [a.symbol for a in asset_list]
                deleted2 = await writer.clear_ingestion_log(
                    exchange="yfinance", symbols=stock_syms
                )
                logger.info(
                    f"Cleared {deleted2} ingestion_log rows for {len(stock_syms)} stock symbols"
                )
            else:
                syms = [a.symbol for a in asset_list]
                deleted = await writer.clear_ingestion_log(symbols=syms)
                logger.info(f"Cleared {deleted} ingestion_log rows (force)")

        asset_list = sorted(asset_list, key=lambda a: a.priority)
        logger.info(f"Total assets: {len(asset_list)}")

        total_candles = 0
        for asset in asset_list:
            for timeframe in asset.timeframes:
                try:
                    count = await self.ingest_asset(asset, timeframe)
                    total_candles += count
                    logger.info(
                        f"Progress: {asset.symbol} {timeframe} — {count:,} candles"
                    )
                except Exception as exc:
                    logger.error(
                        f"Failed {asset.symbol} {timeframe} — continuing: {exc}"
                    )
                    continue

        logger.success(
            f"Historical ingestion complete. Total candles: {total_candles:,}"
        )
        return total_candles

    async def ingest_asset(self, asset: AssetConfig, timeframe: str) -> int:
        already = await self.writer.check_ingested(
            asset.symbol, asset.exchange, timeframe
        )
        if already:
            logger.info(f"Skipping {asset.symbol} {timeframe} — already ingested")
            return 0

        since = datetime.now(timezone.utc) - timedelta(days=365 * asset.history_years)
        if timeframe == "1m":
            cap = datetime.now(timezone.utc) - timedelta(days=365 * 2)
            if since < cap:
                since = cap
                logger.info(
                    f"{asset.symbol} 1m capped to 2 years for manageable bulk load"
                )

        # Twelve Data pages newest→oldest; keep the original floor so a log-only
        # re-run still walks back and fills shallow majors (ON CONFLICT dedupes).
        td_history_floor = since

        latest = await self.writer.get_latest_candle_time(
            asset.symbol, asset.exchange, timeframe
        )
        if latest is not None:
            if latest.tzinfo is None:
                latest = latest.replace(tzinfo=timezone.utc)
            if asset.exchange == "twelvedata":
                logger.info(
                    f"Backfilling {asset.symbol} {timeframe} to "
                    f"{td_history_floor.isoformat()} "
                    f"(existing latest={latest.isoformat()})"
                )
            elif latest > since:
                since = latest + timedelta(seconds=1)
                logger.info(
                    f"Resuming {asset.symbol} {timeframe} from {since.isoformat()}"
                )

        buffer: list[dict[str, Any]] = []
        total_written = 0
        current_since = since
        flush_size = self.settings.ingest_flush_size
        fetch_errors = 0
        yfinance_done = False
        # Twelve Data pages backwards from newest → oldest
        td_end_cursor: datetime | None = None

        while True:
            try:
                if asset.exchange == "yfinance":
                    if yfinance_done:
                        break
                    candles = await self.fetch_yfinance(
                        asset.symbol, timeframe, current_since
                    )
                    yfinance_done = True
                elif asset.exchange == "twelvedata":
                    candles = await self.fetch_twelvedata(
                        asset.symbol,
                        timeframe,
                        td_end_cursor,  # None = first page (end=now)
                        history_floor=td_history_floor,
                    )
                elif asset.exchange == "alpaca":
                    candles = await self.fetch_alpaca(
                        asset.symbol, timeframe, current_since
                    )
                elif asset.exchange == "oanda":
                    candles = await self.fetch_oanda(
                        asset.symbol, timeframe, current_since
                    )
                elif asset.exchange in (
                    "binance",
                    "coinbase",
                    "coinbasepro",
                    "bybit",
                    "kraken",
                ):
                    candles = await asyncio.to_thread(
                        self._fetch_ccxt_sync, asset, timeframe, current_since
                    )
                else:
                    logger.warning(
                        f"Unknown exchange: {asset.exchange} for {asset.symbol}"
                    )
                    break

                if not candles:
                    break

                for c in candles:
                    c["timeframe"] = timeframe

                cleaned = self.cleaner.clean(candles)
                buffer.extend(cleaned)

                last_time = candles[-1]["time"]
                first_time = candles[0]["time"]
                if isinstance(last_time, datetime):
                    if last_time.tzinfo is None:
                        last_time = last_time.replace(tzinfo=timezone.utc)
                    current_since = last_time + timedelta(seconds=1)
                else:
                    break
                if isinstance(first_time, datetime) and first_time.tzinfo is None:
                    first_time = first_time.replace(tzinfo=timezone.utc)

                if len(buffer) >= flush_size:
                    written = await self.writer.write_ohlcv(buffer, asset, timeframe)
                    total_written += written
                    logger.info(
                        f"  flushed {written:,} ({asset.symbol} {timeframe}) "
                        f"total={total_written:,} cursor={current_since.isoformat()}"
                    )
                    buffer = []

                fetch_errors = 0

                if asset.exchange == "yfinance":
                    break

                if asset.exchange == "twelvedata":
                    # Page older: next end_date = oldest bar in this page − 1s
                    if first_time <= td_history_floor:
                        break
                    if len(candles) < 100:
                        break
                    td_end_cursor = first_time - timedelta(seconds=1)
                    await asyncio.sleep(self.settings.historical_rate_limit_sleep)
                    continue

                await asyncio.sleep(self.settings.historical_rate_limit_sleep)

                if len(candles) < 500:
                    break

                if current_since >= datetime.now(timezone.utc) - timedelta(minutes=5):
                    break

            except ccxt.RateLimitExceeded:
                logger.warning(f"Rate limit hit for {asset.symbol} — waiting 60s")
                await asyncio.sleep(60)
            except Exception as exc:
                fetch_errors += 1
                logger.error(f"Error fetching {asset.symbol} {timeframe}: {exc}")
                if fetch_errors >= 3:
                    logger.warning(
                        f"Giving up fetch loop for {asset.symbol} {timeframe} "
                        f"after {fetch_errors} errors — flushing buffer"
                    )
                    break
                await asyncio.sleep(5)
                continue

        if buffer:
            written = await self.writer.write_ohlcv(buffer, asset, timeframe)
            total_written += written

        if total_written > 0:
            await self.writer.log_ingestion(
                asset.symbol,
                asset.exchange,
                timeframe,
                since,
                current_since,
                total_written,
            )

        return total_written

    def _fetch_ccxt_sync(
        self, asset: AssetConfig, timeframe: str, since: datetime
    ) -> list[dict[str, Any]]:
        exchange = self.exchanges.get(asset.exchange)
        if exchange is None:
            logger.error(f"No exchange client for {asset.exchange}")
            return []
        tf = CCXT_TIMEFRAME_MAP.get(timeframe, timeframe.lower())
        since_ms = int(since.timestamp() * 1000)
        raw = exchange.fetch_ohlcv(
            asset.symbol,
            timeframe=tf,
            since=since_ms,
            limit=self.settings.max_candles_per_fetch,
        )
        return self.parse_ccxt_ohlcv(raw, asset, timeframe)

    def parse_ccxt_ohlcv(
        self, raw: list, asset: AssetConfig, timeframe: str
    ) -> list[dict[str, Any]]:
        return [
            {
                "time": datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc),
                "symbol": asset.symbol,
                "exchange": asset.exchange,
                "asset_class": asset.asset_class,
                "timeframe": timeframe,
                "open": float(c[1]),
                "high": float(c[2]),
                "low": float(c[3]),
                "close": float(c[4]),
                "volume": float(c[5]),
            }
            for c in raw
        ]

    async def fetch_yfinance(
        self, symbol: str, timeframe: str, since: datetime
    ) -> list[dict[str, Any]]:
        """Yahoo Finance — no API key; works globally including Nigeria.

        Yahoo hard-caps intraday history:
          1m  → last 7 days
          5m/15m → last 60 days
          1h  → last 730 days (we request 729 to avoid boundary rejects)
          1d  → multi-year OK
        """
        try:
            import yfinance as yf
        except ImportError:
            logger.error("yfinance not installed — pip install yfinance")
            return []

        tf_map = {
            "5m": "5m",
            "15m": "15m",
            "1H": "1h",
            "4H": "1h",
            "1D": "1d",
            "1W": "1wk",
            "1m": "1m",
        }
        yf_interval = tf_map.get(timeframe)
        if not yf_interval:
            logger.warning(f"yfinance unsupported timeframe {timeframe}")
            return []

        # Prefer period= for intraday — start/end often trip Yahoo's range guards
        period_by_interval = {
            "1m": "7d",
            "5m": "60d",
            "15m": "60d",
            "1h": "730d",
        }

        now = datetime.now(timezone.utc)
        use_period = period_by_interval.get(yf_interval)

        def _pull() -> list[dict[str, Any]]:
            ticker = yf.Ticker(symbol)
            if use_period:
                df = ticker.history(
                    period=use_period,
                    interval=yf_interval,
                    auto_adjust=True,
                    prepost=False,
                    actions=False,
                )
            else:
                days_back = max(1, (now - since).days)
                days_back = min(days_back, 365 * 10)
                start_str = (now - timedelta(days=days_back)).strftime("%Y-%m-%d")
                end_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")
                df = ticker.history(
                    start=start_str,
                    end=end_str,
                    interval=yf_interval,
                    auto_adjust=True,
                    prepost=False,
                    actions=False,
                )
            if df is None or df.empty:
                return []
            df = df.reset_index()
            time_col = "Datetime" if "Datetime" in df.columns else "Date"
            results: list[dict[str, Any]] = []
            for _, row in df.iterrows():
                try:
                    raw_time = row[time_col]
                    ts = pd.Timestamp(raw_time)
                    if ts.tzinfo is not None:
                        ts = ts.tz_convert("UTC").tz_localize(None)
                    dt = ts.to_pydatetime().replace(tzinfo=timezone.utc)
                    since_utc = (
                        since if since.tzinfo else since.replace(tzinfo=timezone.utc)
                    )
                    if dt < since_utc:
                        continue
                    results.append(
                        {
                            "time": dt,
                            "symbol": symbol,
                            "exchange": "yfinance",
                            "asset_class": "STOCKS",
                            "timeframe": timeframe,
                            "open": float(row["Open"]),
                            "high": float(row["High"]),
                            "low": float(row["Low"]),
                            "close": float(row["Close"]),
                            "volume": float(row.get("Volume", 0) or 0),
                        }
                    )
                except Exception as exc:
                    logger.debug(
                        f"Skipping malformed yfinance row for {symbol}: {exc}"
                    )
            return results

        try:
            results = await asyncio.to_thread(_pull)
        except Exception as exc:
            logger.warning(f"yfinance fetch failed for {symbol} {timeframe}: {exc}")
            return []

        if not results:
            logger.warning(f"yfinance returned empty data for {symbol} {timeframe}")

        await asyncio.sleep(1.0)
        return results

    async def fetch_twelvedata(
        self,
        symbol: str,
        timeframe: str,
        end_cursor: datetime | None,
        *,
        history_floor: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Twelve Data forex OHLCV — requires TWELVEDATA_API_KEY.

        Pages backwards: each call returns up to 5000 bars ending at
        ``end_cursor`` (or now on the first call). Empty / 400 = end of history.
        """
        api_key = self.settings.twelvedata_api_key
        if not api_key:
            logger.error("TWELVEDATA_API_KEY not set — cannot fetch forex data")
            return []

        tf_map = {
            "5m": "5min",
            "15m": "15min",
            "1H": "1h",
            "4H": "4h",
            "1D": "1day",
            "1W": "1week",
        }
        interval = tf_map.get(timeframe)
        if not interval:
            return []

        now = datetime.now(timezone.utc)
        end_date = end_cursor or now
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)

        floor = history_floor
        if floor is not None and floor.tzinfo is None:
            floor = floor.replace(tzinfo=timezone.utc)

        def _pull() -> list[dict[str, Any]]:
            from twelvedata import TDClient

            td = TDClient(apikey=api_key)
            try:
                kwargs: dict[str, Any] = {
                    "symbol": symbol,
                    "interval": interval,
                    "end_date": end_date.astimezone(timezone.utc).strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ),
                    "outputsize": 5000,
                    "timezone": "UTC",
                }
                if floor is not None:
                    kwargs["start_date"] = floor.astimezone(timezone.utc).strftime(
                        "%Y-%m-%d %H:%M:%S"
                    )
                ts = td.time_series(**kwargs)
                df = ts.as_pandas()
            except Exception as exc:
                msg = str(exc)
                if "No data is available" in msg or '"code":400' in msg:
                    logger.debug(
                        f"Twelve Data end of history for {symbol} {timeframe}"
                    )
                    return []
                raise

            if df is None or df.empty:
                return []
            df = df.reset_index()
            time_col = "datetime" if "datetime" in df.columns else df.columns[0]
            results: list[dict[str, Any]] = []
            for _, row in df.iterrows():
                try:
                    raw_time = pd.Timestamp(row[time_col])
                    if raw_time.tzinfo is not None:
                        raw_time = raw_time.tz_convert("UTC").tz_localize(None)
                    dt = raw_time.to_pydatetime().replace(tzinfo=timezone.utc)
                    if floor is not None and dt < floor:
                        continue
                    vol = 0.0
                    if "volume" in row.index and pd.notna(row.get("volume")):
                        vol = float(row["volume"])
                    results.append(
                        {
                            "time": dt,
                            "symbol": symbol,
                            "exchange": "twelvedata",
                            "asset_class": "FOREX",
                            "timeframe": timeframe,
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "volume": vol,
                        }
                    )
                except Exception as exc:
                    logger.debug(
                        f"Skipping malformed Twelve Data row for {symbol}: {exc}"
                    )
            results.sort(key=lambda r: r["time"])
            return results

        try:
            results = await asyncio.to_thread(_pull)
        except Exception as exc:
            msg = str(exc)
            if "No data is available" in msg or '"code":400' in msg:
                logger.debug(f"Twelve Data no more data for {symbol} {timeframe}")
                return []
            logger.warning(
                f"Twelve Data fetch failed for {symbol} {timeframe}: {exc}"
            )
            return []

        await asyncio.sleep(2.0)
        return results

    async def fetch_alpaca(
        self, symbol: str, timeframe: str, since: datetime
    ) -> list[dict[str, Any]]:
        settings = self.settings
        if not settings.alpaca_api_key or not settings.alpaca_secret:
            logger.warning("Alpaca credentials missing — skipping stock fetch")
            return []

        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

        tf_map = {
            "1m": TimeFrame(1, TimeFrameUnit.Minute),
            "5m": TimeFrame(5, TimeFrameUnit.Minute),
            "15m": TimeFrame(15, TimeFrameUnit.Minute),
            "1H": TimeFrame(1, TimeFrameUnit.Hour),
            "1D": TimeFrame(1, TimeFrameUnit.Day),
        }
        if timeframe not in tf_map:
            return []

        def _pull() -> list[dict[str, Any]]:
            client = StockHistoricalDataClient(
                settings.alpaca_api_key,
                settings.alpaca_secret,
            )
            end = datetime.now(timezone.utc)
            request = StockBarsRequest(
                symbol_or_symbols=symbol,
                timeframe=tf_map[timeframe],
                start=(
                    since.replace(tzinfo=timezone.utc)
                    if since.tzinfo is None
                    else since
                ),
                end=end,
                limit=10000,
            )
            bars = client.get_stock_bars(request)
            df = bars.df
            if df.empty:
                return []
            df = df.reset_index()
            time_col = "timestamp" if "timestamp" in df.columns else df.columns[0]
            rows = []
            for _, row in df.iterrows():
                ts = row[time_col]
                if hasattr(ts, "to_pydatetime"):
                    ts = ts.to_pydatetime()
                if isinstance(ts, datetime) and ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                rows.append(
                    {
                        "time": ts,
                        "symbol": symbol,
                        "exchange": "alpaca",
                        "asset_class": "STOCKS",
                        "timeframe": timeframe,
                        "open": float(row["open"]),
                        "high": float(row["high"]),
                        "low": float(row["low"]),
                        "close": float(row["close"]),
                        "volume": float(row["volume"]),
                    }
                )
            return rows

        return await asyncio.to_thread(_pull)

    async def fetch_oanda(
        self, symbol: str, timeframe: str, since: datetime
    ) -> list[dict[str, Any]]:
        token = self.settings.oanda_token
        if not token:
            logger.warning("OANDA token missing — skipping forex fetch")
            return []

        tf_map = {
            "5m": "M5",
            "15m": "M15",
            "1H": "H1",
            "4H": "H4",
            "1D": "D",
            "1m": "M1",
        }
        if timeframe not in tf_map:
            return []

        base = self.settings.oanda_base_url.rstrip("/")
        url = f"{base}/v3/instruments/{symbol}/candles"
        headers = {"Authorization": f"Bearer {token}"}
        params = {
            "granularity": tf_map[timeframe],
            "from": since.astimezone(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%S.000000000Z"
            ),
            "count": 500,
            "price": "M",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers=headers, params=params)
            if response.status_code >= 400:
                logger.warning(
                    f"OANDA {symbol} {timeframe}: "
                    f"HTTP {response.status_code} {response.text[:200]}"
                )
                return []
            data = response.json()

        out: list[dict[str, Any]] = []
        for c in data.get("candles", []):
            if not c.get("complete"):
                continue
            raw_t = c["time"]
            try:
                ts = datetime.fromisoformat(raw_t.replace("Z", "+00:00"))
            except ValueError:
                ts = datetime.strptime(raw_t[:26], "%Y-%m-%dT%H:%M:%S.%f").replace(
                    tzinfo=timezone.utc
                )
            mid = c["mid"]
            out.append(
                {
                    "time": ts,
                    "symbol": symbol,
                    "exchange": "oanda",
                    "asset_class": "FOREX",
                    "timeframe": timeframe,
                    "open": float(mid["o"]),
                    "high": float(mid["h"]),
                    "low": float(mid["l"]),
                    "close": float(mid["c"]),
                    "volume": float(c.get("volume", 0)),
                }
            )
        return out
