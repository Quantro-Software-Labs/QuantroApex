"""Attach real OHLCV feature sequences to labelled samples."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from loguru import logger

from processing.features import precompute_feature_matrix, sequence_from_matrix
from storage.timescale import TimescaleReader

_TF_DELTA: dict[str, timedelta] = {
    "1m": timedelta(minutes=1),
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "1H": timedelta(hours=1),
    "4H": timedelta(hours=4),
    "1D": timedelta(days=1),
}


def _as_utc(t: Any) -> datetime | None:
    if t is None:
        return None
    if isinstance(t, datetime):
        if t.tzinfo is None:
            return t.replace(tzinfo=timezone.utc)
        return t.astimezone(timezone.utc)
    return None


async def attach_feature_sequences(
    reader: TimescaleReader,
    samples: list[dict[str, Any]],
    seq_len: int = 60,
    warmup_bars: int = 220,
) -> list[dict[str, Any]]:
    """
    For each sample, attach sample['feature_seq'] as (seq_len, 14) float32
    built from real bars ending at entry_time (not tiled single vectors).
    Samples that cannot be matched keep a zero sequence and are marked
    sample['_seq_ok'] = False.
    """
    if not samples:
        return samples

    groups: dict[tuple[str, str, str | None], list[int]] = defaultdict(list)
    for i, s in enumerate(samples):
        key = (
            str(s.get("symbol") or ""),
            str(s.get("timeframe") or "1D"),
            s.get("exchange"),
        )
        groups[key].append(i)

    ok = 0
    missing = 0

    for (symbol, timeframe, exchange), indices in groups.items():
        times = [_as_utc(samples[i].get("entry_time")) for i in indices]
        valid_times = [t for t in times if t is not None]
        if not valid_times:
            for i in indices:
                samples[i]["feature_seq"] = np.zeros(
                    (seq_len, 14), dtype=np.float32
                )
                samples[i]["_seq_ok"] = False
                missing += len(indices)
            continue

        delta = _TF_DELTA.get(timeframe, timedelta(days=1))
        start = min(valid_times) - delta * warmup_bars
        end = max(valid_times) + delta  # small slack for nearest match

        try:
            df = await reader.get_ohlcv_window(
                symbol, timeframe, start, end, exchange=exchange
            )
        except Exception as exc:
            logger.warning(
                f"OHLCV window failed {symbol} {timeframe} {exchange}: {exc}"
            )
            df = None

        if df is None or len(df) < 30:
            # Fallback: no exchange filter
            if exchange:
                try:
                    df = await reader.get_ohlcv_window(
                        symbol, timeframe, start, end, exchange=None
                    )
                except Exception:
                    df = None

        if df is None or len(df) < 30:
            for i in indices:
                samples[i]["feature_seq"] = np.zeros(
                    (seq_len, 14), dtype=np.float32
                )
                samples[i]["_seq_ok"] = False
                missing += 1
            continue

        matrix = precompute_feature_matrix(df)
        index = df.index

        for i, t in zip(indices, times):
            if t is None:
                samples[i]["feature_seq"] = np.zeros(
                    (seq_len, 14), dtype=np.float32
                )
                samples[i]["_seq_ok"] = False
                missing += 1
                continue

            # Nearest bar at or before entry
            pos = int(index.searchsorted(t, side="right") - 1)
            if pos < 0:
                pos = 0
            if pos >= len(index):
                pos = len(index) - 1

            # Reject if nearest bar is wildly far from entry
            bar_t = index[pos].to_pydatetime()
            if bar_t.tzinfo is None:
                bar_t = bar_t.replace(tzinfo=timezone.utc)
            if abs((bar_t - t).total_seconds()) > delta.total_seconds() * 3 + 3600:
                samples[i]["feature_seq"] = np.zeros(
                    (seq_len, 14), dtype=np.float32
                )
                samples[i]["_seq_ok"] = False
                missing += 1
                continue

            samples[i]["feature_seq"] = sequence_from_matrix(matrix, pos, seq_len)
            samples[i]["_seq_ok"] = True
            ok += 1

        logger.info(
            f"Sequences {symbol} {timeframe}: "
            f"{sum(1 for i in indices if samples[i].get('_seq_ok'))}/{len(indices)} ok"
        )

    logger.success(
        f"Feature sequences attached — ok={ok:,} missing={missing:,} "
        f"(seq_len={seq_len})"
    )
    return samples


def filter_sequence_ready(
    samples: list[dict[str, Any]], *, require_seq: bool = True
) -> list[dict[str, Any]]:
    if not require_seq:
        return samples
    return [s for s in samples if s.get("_seq_ok")]
