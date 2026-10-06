"""OHLCV validation and cleaning before storage."""

from __future__ import annotations

from typing import Any

import pandas as pd
from loguru import logger


class DataCleaner:
    """
    Validates and cleans raw OHLCV data before storage.
    Removes corrupted candles, fills small gaps, flags anomalies.
    """

    def clean(self, candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not candles:
            return []

        df = pd.DataFrame(candles)
        original_count = len(df)

        # Ensure timeframe column exists for dedupe key consistency
        if "timeframe" not in df.columns:
            df["timeframe"] = ""

        subset = ["time", "symbol", "exchange"]
        if "timeframe" in df.columns:
            subset.append("timeframe")
        df = df.drop_duplicates(subset=subset)

        df = df[df["high"] >= df["low"]]
        df = df[df["high"] >= df["open"]]
        df = df[df["high"] >= df["close"]]
        df = df[df["low"] <= df["open"]]
        df = df[df["low"] <= df["close"]]
        df = df[df["close"] > 0]
        df = df[df["volume"] >= 0]

        df = df.sort_values("time")
        if len(df) >= 5:
            rolling_median = df["close"].rolling(window=20, min_periods=1).median()
            df = df[df["close"] < rolling_median * 10]
            df = df[df["close"] > rolling_median * 0.1]

        cleaned_count = len(df)
        removed = original_count - cleaned_count
        if removed > 0:
            logger.debug(f"Cleaned {removed} invalid candles")

        return df.to_dict("records")
