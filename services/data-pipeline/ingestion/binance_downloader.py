"""
Binance Vision Klines Downloader.

Downloads 1h and 4h spot klines for BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, and XRPUSDT
from https://data-api.binance.vision (2019-01-01 to latest complete UTC day).
Caches locally as Parquet with resume support and strict gap/duplicate verification.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import socket
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd
from loguru import logger

DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
DEFAULT_INTERVALS = ["1h", "4h"]
BASE_URL = "https://data-api.binance.vision/api/v3/klines"
START_TIMESTAMP_2019 = int(datetime(2019, 1, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)

INTERVAL_SECONDS = {
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}


class DataIntegrityError(Exception):
    """Raised when kline data contains gaps, duplicates, or non-monotonic timestamps."""
    pass


def resolve_dns_fallback(host: str, dns_ip: str = "8.8.8.8", timeout: float = 3.0) -> str:
    """Fallback DNS resolver for environments with transient local resolver failures."""
    try:
        tx_id = random.randint(0, 65535)
        header = tx_id.to_bytes(2, "big") + b"\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00"
        qname = b"".join(len(part).to_bytes(1, "big") + part.encode() for part in host.split(".")) + b"\x00"
        query = header + qname + b"\x00\x01\x00\x01"
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.sendto(query, (dns_ip, 53))
        data, _ = sock.recvfrom(512)
        sock.close()
        ip_bytes = data[-4:]
        return ".".join(str(b) for b in ip_bytes)
    except Exception:
        return ""


# Opt-in resilient DNS resolver fallback at socket level
ENABLE_DNS_FALLBACK = os.environ.get("ENABLE_DNS_FALLBACK", "0").lower() in ("1", "true", "yes")
_orig_getaddrinfo = socket.getaddrinfo

def _resilient_getaddrinfo(host, port, *args, **kwargs):
    h = host.decode() if isinstance(host, bytes) else host
    try:
        return _orig_getaddrinfo(host, port, *args, **kwargs)
    except socket.gaierror:
        if ENABLE_DNS_FALLBACK and "binance.vision" in str(h):
            ip = resolve_dns_fallback(str(h))
            if ip:
                p = int(port) if port is not None else 443
                return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, p))]
        raise

if ENABLE_DNS_FALLBACK:
    socket.getaddrinfo = _resilient_getaddrinfo


def detect_kline_gaps(
    df: pd.DataFrame,
    interval: str,
    symbol: str = "UNKNOWN",
    max_gap_pct: float = 0.01,
) -> tuple[list[dict[str, Any]], float]:
    """
    Detect gaps in historical kline series.
    Real exchange outages (e.g. Binance 2019/2020 maintenance windows) are tolerated
    if total missing bars <= 1% of expected bars.
    Rejects duplicates and out-of-order timestamps strictly.
    """
    if df.empty:
        raise DataIntegrityError("Kline DataFrame is empty")

    if "timestamp" not in df.columns:
        raise DataIntegrityError("DataFrame missing 'timestamp' column")

    # 1. Monotonicity check
    if not df["timestamp"].is_monotonic_increasing:
        raise DataIntegrityError("Timestamps are not strictly monotonically increasing")

    # 2. Duplicate check
    if not df["timestamp"].is_unique:
        dups = df[df["timestamp"].duplicated(keep=False)]["timestamp"].tolist()
        sample_dups = [str(t) for t in dups[:5]]
        raise DataIntegrityError(
            f"Duplicate timestamps detected: {len(dups)} duplicate rows (e.g. {sample_dups})"
        )

    # 3. Gap check
    sec = INTERVAL_SECONDS.get(interval.lower(), 3600)
    diffs = df["timestamp"].diff().dropna().dt.total_seconds()
    bad_mask = diffs > sec
    gap_rows = df.iloc[1:][bad_mask]

    gaps: list[dict[str, Any]] = []
    total_missing_bars = 0

    if not gap_rows.empty:
        for idx in gap_rows.index:
            pos = df.index.get_loc(idx)
            prev_ts = df.iloc[pos - 1]["timestamp"]
            curr_ts = df.iloc[pos]["timestamp"]
            gap_sec = (curr_ts - prev_ts).total_seconds()
            missing_bars = int(round(gap_sec / sec)) - 1
            total_missing_bars += missing_bars
            gaps.append({
                "symbol": symbol,
                "interval": interval,
                "start": prev_ts.isoformat(),
                "end": curr_ts.isoformat(),
                "duration_seconds": gap_sec,
                "bars_missing": missing_bars,
            })

    min_ts = df["timestamp"].min()
    max_ts = df["timestamp"].max()
    total_span_sec = (max_ts - min_ts).total_seconds()
    expected_bars = int(round(total_span_sec / sec)) + 1 if total_span_sec > 0 else len(df)
    gap_pct = float(total_missing_bars / expected_bars) if expected_bars > 0 else 0.0

    if gap_pct > max_gap_pct:
        raise DataIntegrityError(
            f"Gaps exceed 1% threshold: {total_missing_bars}/{expected_bars} bars missing "
            f"({gap_pct:.2%}) for {symbol} {interval}"
        )

    return gaps, gap_pct


def split_into_contiguous_segments(
    df: pd.DataFrame,
    interval: str,
    min_length: int = 60,
) -> list[pd.DataFrame]:
    """
    Split a DataFrame containing gaps into strictly contiguous segments.
    Feature windows and sequences must never cross a gap boundary.
    """
    if df.empty:
        return []

    sec = INTERVAL_SECONDS.get(interval.lower(), 3600)
    diffs = df["timestamp"].diff().dt.total_seconds()
    # A new segment starts where delta != expected_seconds
    segment_ids = (diffs != sec).cumsum()

    segments: list[pd.DataFrame] = []
    for _, seg in df.groupby(segment_ids):
        if len(seg) >= min_length:
            segments.append(seg.reset_index(drop=True))

    return segments


def verify_kline_integrity(df: pd.DataFrame, interval: str, symbol: str = "UNKNOWN") -> list[dict[str, Any]]:
    """
    Verify dataframe integrity. Returns detected gaps list if <= 1% of expected bars.
    Raises DataIntegrityError on duplicates, out-of-order, or gaps > 1%.
    """
    gaps, _ = detect_kline_gaps(df, interval=interval, symbol=symbol, max_gap_pct=0.01)
    return gaps


def _latest_complete_utc_day() -> datetime:
    """Return the start of the current UTC day (00:00:00 UTC), representing latest complete previous day."""
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)


def record_gaps_report(data_dir: Path | str, new_gaps: list[dict[str, Any]]) -> None:
    """Record detected gaps to gaps_report.json, appending and deduplicating."""
    d_dir = Path(data_dir)
    report_file = d_dir / "gaps_report.json"
    existing_gaps: list[dict[str, Any]] = []
    if report_file.exists():
        try:
            with open(report_file, "r", encoding="utf-8") as f:
                existing_gaps = json.load(f)
        except Exception:
            existing_gaps = []

    combined = existing_gaps + new_gaps
    seen = set()
    deduped = []
    for g in combined:
        key = (g.get("symbol"), g.get("interval"), g.get("start"), g.get("end"))
        if key not in seen:
            seen.add(key)
            deduped.append(g)

    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(deduped, f, indent=2)


class BinanceVisionDownloader:
    """Resume-safe downloader for Binance Vision spot klines with Parquet caching."""

    def __init__(self, data_dir: str | Path = "./data/binance") -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._ip_override: str | None = None

    def _get_client(self) -> httpx.Client:
        return httpx.Client(timeout=15.0)

    def get_parquet_path(self, symbol: str, interval: str) -> Path:
        clean_sym = symbol.replace("/", "").upper()
        return self.data_dir / f"{clean_sym}_{interval.lower()}.parquet"

    def fetch_klines_chunk(
        self,
        client: httpx.Client,
        symbol: str,
        interval: str,
        start_ms: int,
        end_ms: int | None = None,
        limit: int = 1000,
    ) -> list[list[Any]]:
        """Fetch a single chunk of up to 1000 klines."""
        params: dict[str, Any] = {
            "symbol": symbol.replace("/", "").upper(),
            "interval": interval.lower(),
            "startTime": start_ms,
            "limit": limit,
        }
        if end_ms is not None:
            params["endTime"] = end_ms

        headers = {"User-Agent": "QuantroApex/1.0"}
        url = BASE_URL

        for attempt in range(4):
            try:
                resp = client.get(url, params=params, headers=headers)
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code == 429:
                    logger.warning(f"Rate limited (429) fetching {symbol} {interval}, sleeping 2s...")
                    time.sleep(2.0)
                    continue
                resp.raise_for_status()
            except (httpx.ConnectError, httpx.RequestError) as exc:
                if attempt == 3:
                    raise
                time.sleep(1.0 + attempt)
        return []

    def download_symbol_interval(
        self,
        symbol: str,
        interval: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        smoke: bool = False,
    ) -> pd.DataFrame:
        """
        Download spot klines for symbol and interval.
        Resume-safe: loads existing parquet and downloads only missing delta.
        """
        parquet_path = self.get_parquet_path(symbol, interval)
        clean_sym = symbol.replace("/", "").upper()
        target_end = end_date or _latest_complete_utc_day()
        target_end_ms = int(target_end.timestamp() * 1000)

        existing_df: pd.DataFrame | None = None
        start_ms = START_TIMESTAMP_2019
        if start_date:
            start_ms = int(start_date.timestamp() * 1000)
        elif smoke:
            # Smoke mode: last 60 days
            start_ms = int((target_end - timedelta(days=60)).timestamp() * 1000)

        if parquet_path.exists():
            try:
                existing_df = pd.read_parquet(parquet_path)
                if not existing_df.empty and "timestamp" in existing_df.columns:
                    existing_df["timestamp"] = pd.to_datetime(existing_df["timestamp"], utc=True)
                    existing_df = existing_df.sort_values("timestamp").reset_index(drop=True)
                    last_ts = existing_df["timestamp"].max()
                    last_ms = int(last_ts.timestamp() * 1000)
                    sec_step = INTERVAL_SECONDS.get(interval.lower(), 3600)
                    step_ms = sec_step * 1000

                    if last_ms >= target_end_ms - step_ms:
                        logger.info(
                            f"Parquet cache up to date for {clean_sym} {interval} ({len(existing_df):,} bars)"
                        )
                        verify_kline_integrity(existing_df, interval)
                        return existing_df

                    # Resume from next bar
                    start_ms = last_ms + step_ms
                    logger.info(
                        f"Resuming {clean_sym} {interval} from {last_ts.isoformat()} ({len(existing_df):,} existing bars)"
                    )
            except Exception as exc:
                logger.warning(f"Could not load existing parquet {parquet_path}: {exc}. Re-downloading.")
                existing_df = None

        logger.info(
            f"Downloading {clean_sym} {interval} from {datetime.fromtimestamp(start_ms/1000, tz=timezone.utc).isoformat()} "
            f"to {target_end.isoformat()}..."
        )

        all_bars: list[list[Any]] = []
        current_start = start_ms
        step_sec = INTERVAL_SECONDS.get(interval.lower(), 3600)

        with self._get_client() as client:
            while current_start < target_end_ms:
                chunk = self.fetch_klines_chunk(
                    client=client,
                    symbol=clean_sym,
                    interval=interval,
                    start_ms=current_start,
                    end_ms=target_end_ms,
                    limit=1000,
                )
                if not chunk:
                    break
                all_bars.extend(chunk)
                last_chunk_open = chunk[-1][0]
                current_start = last_chunk_open + (step_sec * 1000)
                if len(chunk) < 1000:
                    break

        if not all_bars and existing_df is None:
            raise RuntimeError(f"No klines returned for {clean_sym} {interval}")

        new_df = pd.DataFrame()
        if all_bars:
            raw = pd.DataFrame(all_bars)
            new_df = pd.DataFrame(
                {
                    "timestamp": pd.to_datetime(raw[0], unit="ms", utc=True),
                    "open": raw[1].astype(float),
                    "high": raw[2].astype(float),
                    "low": raw[3].astype(float),
                    "close": raw[4].astype(float),
                    "volume": raw[5].astype(float),
                }
            )

        if existing_df is not None and not existing_df.empty:
            if not new_df.empty:
                combined = pd.concat([existing_df, new_df], ignore_index=True)
                combined = combined.drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
            else:
                combined = existing_df
        else:
            combined = new_df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)

        # Filter strictly up to target_end
        combined = combined[combined["timestamp"] <= target_end].reset_index(drop=True)

        # Verify integrity before writing (tolerates genuine exchange outages <= 1%)
        gaps = verify_kline_integrity(combined, interval, symbol=clean_sym)
        if gaps:
            self._record_gaps(gaps)

        # Write to Parquet
        combined.to_parquet(parquet_path, index=False)
        logger.success(f"Saved {len(combined):,} bars to {parquet_path}")
        return combined

    def _record_gaps(self, new_gaps: list[dict[str, Any]]) -> None:
        record_gaps_report(self.data_dir, new_gaps)

    def download_all(
        self,
        symbols: list[str] | None = None,
        intervals: list[str] | None = None,
        smoke: bool = False,
    ) -> dict[str, pd.DataFrame]:
        """Download all configured symbols and intervals."""
        sym_list = symbols or DEFAULT_SYMBOLS
        int_list = intervals or DEFAULT_INTERVALS
        if smoke:
            sym_list = ["BTCUSDT"]
            int_list = ["1h"]

        results: dict[str, pd.DataFrame] = {}
        for sym in sym_list:
            for itv in int_list:
                key = f"{sym.replace('/', '').upper()}_{itv.lower()}"
                try:
                    df = self.download_symbol_interval(sym, itv, smoke=smoke)
                    results[key] = df
                except Exception as exc:
                    logger.error(f"Failed to download {sym} {itv}: {exc}")
                    raise
        return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Binance Vision spot klines to Parquet")
    parser.add_argument("--symbols", nargs="+", default=DEFAULT_SYMBOLS)
    parser.add_argument("--intervals", nargs="+", default=DEFAULT_INTERVALS)
    parser.add_argument("--data-dir", type=str, default="./data/binance")
    parser.add_argument("--smoke", action="store_true", help="Smoke mode: download only recent BTCUSDT 1h data")
    args = parser.parse_args()

    downloader = BinanceVisionDownloader(data_dir=args.data_dir)
    downloader.download_all(symbols=args.symbols, intervals=args.intervals, smoke=args.smoke)


if __name__ == "__main__":
    main()
