"""TimescaleDB / Postgres read & write layer for market data."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import asyncpg
import pandas as pd
from loguru import logger

from config import get_settings

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        settings = get_settings()
        last_err: Exception | None = None
        for dsn in settings.dsn_candidates():
            host_bit = dsn.split("@")[-1] if "@" in dsn else dsn
            try:
                if "db." in host_bit and "supabase.co:5432" in host_bit:
                    logger.info(
                        f"Trying direct host {host_bit} "
                        "(may fail on IPv6-only networks)…"
                    )
                elif ":5432" in host_bit and "pooler.supabase.com" in host_bit:
                    logger.info(f"Trying session pooler {host_bit}…")
                elif ":6543" in host_bit:
                    logger.info(
                        f"Trying transaction pooler {host_bit} "
                        "(works on IPv4; keep batches small)…"
                    )
                else:
                    logger.info(f"Trying {host_bit}…")

                _pool = await asyncpg.create_pool(
                    dsn=dsn,
                    min_size=1,
                    max_size=5,
                    command_timeout=max(120.0, settings.write_command_timeout * 2),
                    # Required for pgBouncer / Supavisor transaction pooling.
                    statement_cache_size=0,
                )
                logger.success(f"Database pool ready → {host_bit}")
                return _pool
            except OSError as exc:
                last_err = exc
                logger.warning(f"Unreachable {host_bit}: {exc}")
                _pool = None
            except Exception as exc:
                last_err = exc
                logger.warning(f"Connect failed {host_bit}: {exc}")
                _pool = None

        raise RuntimeError(
            "Could not connect to Postgres. "
            "On networks without IPv6, avoid db.<ref>.supabase.co — use the "
            "Session pooler (pooler.supabase.com:5432) or Transaction pooler (:6543). "
            f"Last error: {last_err}"
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def apply_schema() -> None:
    """Apply base schema and optionally enable TimescaleDB hypertables."""
    pool = await get_pool()
    schema_sql = _SCHEMA_PATH.read_text()

    async with pool.acquire() as conn:
        # Split on statement boundaries carefully enough for our schema file
        for stmt in _split_sql(schema_sql):
            try:
                await conn.execute(stmt)
            except Exception as exc:
                logger.warning(f"Schema statement skipped/failed: {exc}")

        # Try TimescaleDB extension + hypertable
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
            await conn.execute(
                """
                SELECT create_hypertable(
                  'market_ohlcv',
                  'time',
                  chunk_time_interval => INTERVAL '7 days',
                  if_not_exists => TRUE
                )
                """
            )
            logger.success("TimescaleDB hypertable ready on market_ohlcv")
        except Exception as exc:
            logger.warning(
                f"TimescaleDB unavailable — using plain Postgres tables ({exc})"
            )

        # Optional continuous aggregate (TimescaleDB only)
        try:
            await conn.execute(
                """
                CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_daily
                WITH (timescaledb.continuous) AS
                SELECT
                  time_bucket('1 day', time) AS day,
                  symbol,
                  exchange,
                  asset_class,
                  first(open, time)  AS open,
                  max(high)          AS high,
                  min(low)           AS low,
                  last(close, time)  AS close,
                  sum(volume)        AS volume
                FROM market_ohlcv
                WHERE timeframe = '1H'
                GROUP BY day, symbol, exchange, asset_class
                WITH NO DATA
                """
            )
            logger.info("Continuous aggregate ohlcv_daily created")
        except Exception as exc:
            logger.debug(f"Continuous aggregate skipped: {exc}")

    logger.success("Schema applied successfully")


def _split_sql(sql: str) -> list[str]:
    statements: list[str] = []
    buf: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        buf.append(line)
        if stripped.endswith(";"):
            stmt = "\n".join(buf).strip().rstrip(";")
            if stmt:
                statements.append(stmt)
            buf = []
    if buf:
        stmt = "\n".join(buf).strip().rstrip(";")
        if stmt:
            statements.append(stmt)
    return statements


class TimescaleWriter:
    _INSERT_OHLCV = """
        INSERT INTO market_ohlcv
          (time, symbol, exchange, asset_class, timeframe,
           open, high, low, close, volume)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (time, symbol, exchange, timeframe) DO NOTHING
    """

    async def write_ohlcv(
        self,
        candles: list[dict[str, Any]],
        asset: Any,
        timeframe: str,
    ) -> int:
        """Insert candles in small batches with retries (Supabase-safe)."""
        if not candles:
            return 0
        settings = get_settings()
        batch_size = max(50, settings.write_batch_size)
        pool = await get_pool()
        records = [
            (
                c["time"],
                c["symbol"],
                c["exchange"],
                c["asset_class"],
                timeframe,
                float(c["open"]),
                float(c["high"]),
                float(c["low"]),
                float(c["close"]),
                float(c["volume"]),
            )
            for c in candles
        ]

        written = 0
        for start in range(0, len(records), batch_size):
            chunk = records[start : start + batch_size]
            await self._executemany_with_retry(pool, chunk, settings)
            written += len(chunk)
        return written

    async def _executemany_with_retry(
        self,
        pool: asyncpg.Pool,
        records: list[tuple],
        settings: Any,
    ) -> None:
        if not records:
            return
        delay = 1.0
        chunk = records
        attempts = settings.write_max_retries
        for attempt in range(1, attempts + 1):
            try:
                async with pool.acquire() as conn:
                    await conn.executemany(
                        self._INSERT_OHLCV,
                        chunk,
                        timeout=settings.write_command_timeout,
                    )
                return
            except (TimeoutError, asyncpg.QueryCanceledError, OSError) as exc:
                logger.warning(
                    f"DB write timeout ({len(chunk)} rows), "
                    f"attempt {attempt}/{attempts}: {exc}"
                )
                if len(chunk) > 50:
                    mid = len(chunk) // 2
                    await self._executemany_with_retry(pool, chunk[:mid], settings)
                    await self._executemany_with_retry(pool, chunk[mid:], settings)
                    return
                if attempt >= attempts:
                    raise
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)

    async def get_latest_candle_time(
        self, symbol: str, exchange: str, timeframe: str
    ) -> datetime | None:
        """Resume point for partial historical ingestion."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT MAX(time) AS latest
                FROM market_ohlcv
                WHERE symbol=$1 AND exchange=$2 AND timeframe=$3
                """,
                symbol,
                exchange,
                timeframe,
            )
            return row["latest"] if row and row["latest"] else None

    async def write_single_candle(self, candle: dict[str, Any]) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO market_ohlcv
                  (time, symbol, exchange, asset_class, timeframe,
                   open, high, low, close, volume)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (time, symbol, exchange, timeframe) DO NOTHING
                """,
                candle["time"],
                candle["symbol"],
                candle["exchange"],
                candle["asset_class"],
                candle["timeframe"],
                float(candle["open"]),
                float(candle["high"]),
                float(candle["low"]),
                float(candle["close"]),
                float(candle["volume"]),
            )

    async def write_labelled_samples(self, samples: list[dict[str, Any]]) -> int:
        if not samples:
            return 0
        pool = await get_pool()
        records = []
        for s in samples:
            features = s["features"]
            if isinstance(features, (dict, list)):
                features = json.dumps(features)
            records.append(
                (
                    s["symbol"],
                    s["exchange"],
                    s["asset_class"],
                    s["timeframe"],
                    s["strategy_id"],
                    s["entry_time"],
                    s.get("exit_time"),
                    float(s["entry_price"]),
                    float(s["exit_price"]) if s.get("exit_price") is not None else None,
                    s["direction"],
                    s.get("outcome"),
                    float(s["pnl_pct"]) if s.get("pnl_pct") is not None else None,
                    s.get("hold_duration"),
                    s.get("market_regime"),
                    features,
                    float(s["signal_strength"])
                    if s.get("signal_strength") is not None
                    else None,
                )
            )
        async with pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO labelled_samples
                  (symbol, exchange, asset_class, timeframe, strategy_id,
                   entry_time, exit_time, entry_price, exit_price, direction,
                   outcome, pnl_pct, hold_duration, market_regime, features, signal_strength)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
                """,
                records,
            )
        return len(records)

    async def log_ingestion(
        self,
        symbol: str,
        exchange: str,
        timeframe: str,
        from_t: datetime,
        to_t: datetime,
        count: int,
        status: str = "SUCCESS",
    ) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO ingestion_log
                  (symbol, exchange, timeframe, from_time, to_time, candles_count, status)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT DO NOTHING
                """,
                symbol,
                exchange,
                timeframe,
                from_t,
                to_t,
                count,
                status,
            )

    async def check_ingested(self, symbol: str, exchange: str, timeframe: str) -> bool:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) AS cnt FROM ingestion_log
                WHERE symbol=$1 AND exchange=$2 AND timeframe=$3
                  AND status='SUCCESS'
                """,
                symbol,
                exchange,
                timeframe,
            )
            return bool(row and row["cnt"] > 0)

    async def strategy_sample_count(self, strategy_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT COUNT(*) AS cnt FROM labelled_samples WHERE strategy_id=$1",
                strategy_id,
            )
            return int(row["cnt"]) if row else 0

    async def clear_ingestion_log(
        self,
        *,
        exchange: str | None = None,
        symbol_like: str | None = None,
        symbols: list[str] | None = None,
    ) -> int:
        """Delete ingestion_log rows so historical re-fetch is allowed."""
        pool = await get_pool()
        clauses: list[str] = []
        args: list[Any] = []
        if exchange:
            args.append(exchange)
            clauses.append(f"exchange=${len(args)}")
        if symbol_like:
            args.append(symbol_like)
            clauses.append(f"symbol LIKE ${len(args)}")
        if symbols:
            args.append(symbols)
            clauses.append(f"symbol = ANY(${len(args)}::text[])")
        if not clauses:
            raise ValueError("Refusing unbounded ingestion_log delete")
        where = " AND ".join(clauses)
        async with pool.acquire() as conn:
            result = await conn.execute(
                f"DELETE FROM ingestion_log WHERE {where}", *args
            )
        # asyncpg returns e.g. "DELETE 12"
        try:
            return int(str(result).split()[-1])
        except (TypeError, ValueError, IndexError):
            return 0

    async def write_paper_signal(
        self,
        *,
        symbol: str,
        timeframe: str,
        asset_class: str,
        win_prob: float,
        take_trade: bool,
        predicted_class: str,
        gate: float,
        meta: dict[str, Any] | None = None,
    ) -> None:
        pool = await get_pool()
        payload = json.dumps(meta or {})
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO paper_signals
                  (symbol, timeframe, asset_class, win_prob, gate,
                   predicted_class, take_trade, meta)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
                """,
                symbol,
                timeframe,
                asset_class,
                float(win_prob),
                float(gate),
                predicted_class,
                bool(take_trade),
                payload,
            )

    async def start_training_run(self, model_version: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO training_runs (model_version, status)
                VALUES ($1, 'RUNNING')
                RETURNING id
                """,
                model_version,
            )
            return int(row["id"])

    async def complete_training_run(
        self,
        run_id: int,
        *,
        samples_used: int,
        train_loss: float,
        val_loss: float,
        checkpoint_path: str,
        status: str = "SUCCESS",
    ) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE training_runs
                SET completed_at = NOW(),
                    samples_used = $2,
                    train_loss = $3,
                    val_loss = $4,
                    checkpoint_path = $5,
                    status = $6
                WHERE id = $1
                """,
                run_id,
                samples_used,
                train_loss,
                val_loss,
                checkpoint_path,
                status,
            )


class TimescaleReader:
    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 2000,
        exchange: str | None = None,
    ) -> pd.DataFrame:
        pool = await get_pool()
        async with pool.acquire() as conn:
            if exchange:
                rows = await conn.fetch(
                    """
                    SELECT time, open, high, low, close, volume
                    FROM (
                      SELECT time, open, high, low, close, volume
                      FROM market_ohlcv
                      WHERE symbol=$1 AND timeframe=$2 AND exchange=$3
                      ORDER BY time DESC
                      LIMIT $4
                    ) recent
                    ORDER BY time ASC
                    """,
                    symbol,
                    timeframe,
                    exchange,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT time, open, high, low, close, volume
                    FROM (
                      SELECT time, open, high, low, close, volume
                      FROM market_ohlcv
                      WHERE symbol=$1 AND timeframe=$2
                      ORDER BY time DESC
                      LIMIT $3
                    ) recent
                    ORDER BY time ASC
                    """,
                    symbol,
                    timeframe,
                    limit,
                )
        if not rows:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
        df = pd.DataFrame([dict(r) for r in rows])
        df["time"] = pd.to_datetime(df["time"], utc=True)
        return df.set_index("time")

    async def get_ohlcv_window(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        exchange: str | None = None,
    ) -> pd.DataFrame:
        """Load OHLCV bars in [start, end] inclusive (chronological)."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            if exchange:
                rows = await conn.fetch(
                    """
                    SELECT time, open, high, low, close, volume
                    FROM market_ohlcv
                    WHERE symbol=$1 AND timeframe=$2 AND exchange=$3
                      AND time >= $4 AND time <= $5
                    ORDER BY time ASC
                    """,
                    symbol,
                    timeframe,
                    exchange,
                    start,
                    end,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT time, open, high, low, close, volume
                    FROM market_ohlcv
                    WHERE symbol=$1 AND timeframe=$2
                      AND time >= $3 AND time <= $4
                    ORDER BY time ASC
                    """,
                    symbol,
                    timeframe,
                    start,
                    end,
                )
        if not rows:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
        df = pd.DataFrame([dict(r) for r in rows])
        df["time"] = pd.to_datetime(df["time"], utc=True)
        return df.set_index("time")

    async def get_symbols(self, asset_class: str) -> list[str]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT symbol FROM market_ohlcv
                WHERE asset_class=$1
                ORDER BY symbol
                """,
                asset_class,
            )
        return [r["symbol"] for r in rows]

    async def get_labelled_samples(self, limit: int = 500_000) -> list[dict[str, Any]]:
        """
        Load labelled rows in pages (full SELECT * of 60k+ JSONB rows
        often drops on Supabase pooler).
        """
        pool = await get_pool()
        page_size = 5_000
        out: list[dict[str, Any]] = []
        offset = 0

        while offset < limit:
            chunk_limit = min(page_size, limit - offset)
            rows = None
            last_err: Exception | None = None
            for attempt in range(4):
                try:
                    async with pool.acquire() as conn:
                        rows = await conn.fetch(
                            """
                            SELECT
                              symbol, exchange, asset_class, timeframe,
                              strategy_id, entry_time, exit_time,
                              outcome, pnl_pct, features, signal_strength,
                              market_regime
                            FROM labelled_samples
                            WHERE outcome IS NOT NULL
                            ORDER BY entry_time ASC NULLS LAST, id ASC
                            LIMIT $1 OFFSET $2
                            """,
                            chunk_limit,
                            offset,
                        )
                    break
                except Exception as exc:
                    last_err = exc
                    logger.warning(
                        f"labelled_samples page offset={offset} "
                        f"attempt {attempt + 1}/4 failed: {exc}"
                    )
                    await asyncio.sleep(1.5 * (attempt + 1))
            if rows is None:
                raise RuntimeError(
                    f"Failed to load labelled_samples at offset {offset}: {last_err}"
                )
            if not rows:
                break

            for r in rows:
                d = dict(r)
                feats = d.get("features")
                if isinstance(feats, str):
                    try:
                        d["features"] = json.loads(feats)
                    except json.JSONDecodeError:
                        d["features"] = {}
                elif feats is None:
                    d["features"] = {}
                out.append(d)

            offset += len(rows)
            logger.info(f"Loaded labelled samples: {len(out):,}")
            if len(rows) < chunk_limit:
                break

        return out

    async def get_recent_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 200,
    ) -> pd.DataFrame:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT time, open, high, low, close, volume, exchange, asset_class
                FROM market_ohlcv
                WHERE symbol=$1 AND timeframe=$2
                ORDER BY time DESC
                LIMIT $3
                """,
                symbol,
                timeframe,
                limit,
            )
        if not rows:
            return pd.DataFrame(
                columns=[
                    "open",
                    "high",
                    "low",
                    "close",
                    "volume",
                    "exchange",
                    "asset_class",
                ]
            )
        df = pd.DataFrame([dict(r) for r in rows])
        df["time"] = pd.to_datetime(df["time"], utc=True)
        return df.sort_values("time").set_index("time")

    async def count_ohlcv(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT COUNT(*) AS cnt FROM market_ohlcv")
            return int(row["cnt"]) if row else 0

    async def count_samples(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT COUNT(*) AS cnt FROM labelled_samples")
            return int(row["cnt"]) if row else 0

    async def paper_trade_stats(self) -> dict[str, Any]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                  COUNT(*) FILTER (WHERE take_trade) AS trades_taken,
                  COUNT(*) AS signals_scored,
                  COUNT(*) FILTER (WHERE take_trade AND resolved AND outcome = 'WIN')
                    AS wins,
                  COUNT(*) FILTER (WHERE take_trade AND resolved) AS resolved_takes
                FROM paper_signals
                """
            )
        if not row:
            return {"trades_taken": 0, "hit_rate": 0.0, "signals_scored": 0}
        taken = int(row["trades_taken"] or 0)
        resolved = int(row["resolved_takes"] or 0)
        wins = int(row["wins"] or 0)
        return {
            "trades_taken": taken,
            "signals_scored": int(row["signals_scored"] or 0),
            "resolved_takes": resolved,
            "hit_rate": (wins / resolved) if resolved else 0.0,
        }
