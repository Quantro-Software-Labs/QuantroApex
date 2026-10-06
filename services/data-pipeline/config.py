"""Environment configuration for the QuantroApex data pipeline."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load monorepo root .env then local .env
_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql://quantroapex:quantroapex_dev@127.0.0.1:5433/quantroapex"
    # Prefer direct (non-pooler) URL for bulk writes / DDL when available
    direct_url: str | None = None

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_data_url: str = "https://data.alpaca.markets"

    oanda_api_key: str = ""
    oanda_access_token: str = ""
    oanda_account_id: str = ""
    oanda_base_url: str = "https://api-fxpractice.oanda.com"
    oanda_environment: str = "practice"

    twelvedata_api_key: str = ""

    checkpoint_dir: str = "./checkpoints"
    data_service_host: str = "0.0.0.0"
    data_service_port: int = 8002
    log_level: str = "INFO"

    # Soft caps for local/dev runs (0 = unlimited)
    max_candles_per_fetch: int = 1000
    historical_rate_limit_sleep: float = 0.15
    # Keep insert batches small — Supabase pooler times out on huge executemany
    write_batch_size: int = 500
    # Flush to DB during fetch after this many buffered candles
    ingest_flush_size: int = 2000
    write_command_timeout: float = 60.0
    write_max_retries: int = 4

    @staticmethod
    def _normalize_dsn(url: str) -> str:
        if "?" in url:
            base, query = url.split("?", 1)
            parts = [
                p
                for p in query.split("&")
                if not p.startswith("schema=") and not p.startswith("pgbouncer=")
            ]
            url = base if not parts else f"{base}?{'&'.join(parts)}"
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        return url

    @staticmethod
    def _session_pooler_from(url: str) -> str | None:
        """
        Supabase transaction pooler is :6543 (IPv4-friendly).
        Session mode is the same pooler host on :5432 — better for bulk ingest
        when db.<ref>.supabase.co (direct) is IPv6-only / unreachable.
        """
        if "pooler.supabase.com:6543" in url:
            return url.replace("pooler.supabase.com:6543", "pooler.supabase.com:5432")
        return None

    def dsn_candidates(self) -> list[str]:
        """Ordered connection attempts for the data pipeline."""
        seen: set[str] = set()
        out: list[str] = []

        def add(raw: str | None) -> None:
            if not raw:
                return
            dsn = self._normalize_dsn(raw)
            if dsn not in seen:
                seen.add(dsn)
                out.append(dsn)

        # 1) Explicit DIRECT_URL (prefer session pooler :5432 over IPv6-only db.* host)
        add(self.direct_url)
        # 2) Auto-derived session pooler from DATABASE_URL / DIRECT_URL
        add(self._session_pooler_from(self.database_url))
        if self.direct_url:
            add(self._session_pooler_from(self.direct_url))
        # 3) DATABASE_URL last (often transaction pooler :6543)
        add(self.database_url)
        return out

    @property
    def pg_dsn(self) -> str:
        """Primary DSN (first candidate). Prefer dsn_candidates() for connect+fallback."""
        cands = self.dsn_candidates()
        return cands[0] if cands else self._normalize_dsn(self.database_url)

    @property
    def oanda_token(self) -> str:
        return self.oanda_access_token or self.oanda_api_key

    @property
    def alpaca_secret(self) -> str:
        return self.alpaca_secret_key or os.environ.get("ALPACA_API_SECRET", "")


@lru_cache
def get_settings() -> Settings:
    # Map alternate env names used elsewhere in the monorepo
    env_map = {
        "DATABASE_URL": os.environ.get("DATABASE_URL"),
        "DIRECT_URL": os.environ.get("DIRECT_URL"),
        "ALPACA_API_KEY": os.environ.get("ALPACA_API_KEY"),
        "ALPACA_SECRET_KEY": os.environ.get("ALPACA_SECRET_KEY")
        or os.environ.get("ALPACA_API_SECRET"),
        "ALPACA_DATA_URL": os.environ.get("ALPACA_DATA_URL"),
        "OANDA_API_KEY": os.environ.get("OANDA_API_KEY"),
        "OANDA_ACCESS_TOKEN": os.environ.get("OANDA_ACCESS_TOKEN"),
        "OANDA_ACCOUNT_ID": os.environ.get("OANDA_ACCOUNT_ID"),
        "OANDA_BASE_URL": os.environ.get("OANDA_BASE_URL"),
        "OANDA_ENVIRONMENT": os.environ.get("OANDA_ENVIRONMENT"),
        "TWELVEDATA_API_KEY": os.environ.get("TWELVEDATA_API_KEY"),
        "CHECKPOINT_DIR": os.environ.get("CHECKPOINT_DIR"),
    }
    kwargs = {}
    if env_map["DATABASE_URL"]:
        kwargs["database_url"] = env_map["DATABASE_URL"]
    if env_map["DIRECT_URL"]:
        kwargs["direct_url"] = env_map["DIRECT_URL"]
    if env_map["ALPACA_API_KEY"]:
        kwargs["alpaca_api_key"] = env_map["ALPACA_API_KEY"]
    if env_map["ALPACA_SECRET_KEY"]:
        kwargs["alpaca_secret_key"] = env_map["ALPACA_SECRET_KEY"]
    if env_map["ALPACA_DATA_URL"]:
        # Strip trailing /v2 if present — alpaca-py adds paths
        kwargs["alpaca_data_url"] = env_map["ALPACA_DATA_URL"].rstrip("/").removesuffix("/v2")
    if env_map["OANDA_API_KEY"]:
        kwargs["oanda_api_key"] = env_map["OANDA_API_KEY"]
    if env_map["OANDA_ACCESS_TOKEN"]:
        kwargs["oanda_access_token"] = env_map["OANDA_ACCESS_TOKEN"]
    if env_map["OANDA_ACCOUNT_ID"]:
        kwargs["oanda_account_id"] = env_map["OANDA_ACCOUNT_ID"]
    if env_map["OANDA_BASE_URL"]:
        kwargs["oanda_base_url"] = env_map["OANDA_BASE_URL"]
    if env_map["OANDA_ENVIRONMENT"]:
        kwargs["oanda_environment"] = env_map["OANDA_ENVIRONMENT"]
    if env_map["TWELVEDATA_API_KEY"]:
        kwargs["twelvedata_api_key"] = env_map["TWELVEDATA_API_KEY"]
    if env_map["CHECKPOINT_DIR"]:
        kwargs["checkpoint_dir"] = env_map["CHECKPOINT_DIR"]
    return Settings(**kwargs)
