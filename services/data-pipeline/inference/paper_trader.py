"""Paper-trade loop — NGX + US stocks only, confidence gate hard-enforced."""

from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from inference.engine import GlobalBrainInference
from inference.policy import (
    DECISION_GATE,
    PAPER_PRIMARY_SYMBOLS,
    PAPER_SECONDARY_SYMBOLS,
    PAPER_UNIVERSE,
)
from storage.timescale import TimescaleReader, TimescaleWriter


class PaperTrader:
    """
    Periodically score the paper universe and persist signals.

    Does NOT place broker orders. Crypto/forex never enter this loop.
    """

    def __init__(
        self,
        *,
        poll_seconds: int = 900,
        timeframe: str = "1D",
        checkpoint_path: str | None = None,
    ) -> None:
        self.poll_seconds = max(60, int(poll_seconds))
        self.timeframe = timeframe
        self.engine = GlobalBrainInference(checkpoint_path=checkpoint_path)
        self.writer = TimescaleWriter()
        self.reader = TimescaleReader()
        self.running = True
        self._symbols = sorted(PAPER_UNIVERSE)

    def stop(self) -> None:
        self.running = False

    async def run_once(self) -> list[dict[str, Any]]:
        self.engine.load()
        results: list[dict[str, Any]] = []
        for symbol in self._symbols:
            try:
                result = await self.engine.infer_symbol(
                    symbol,
                    timeframe=self.timeframe,
                    asset_class="STOCKS",
                )
                payload = result.as_dict()
                payload["tier"] = (
                    "primary"
                    if symbol in PAPER_PRIMARY_SYMBOLS
                    or symbol.upper()
                    in {s.upper() for s in PAPER_PRIMARY_SYMBOLS}
                    else "secondary"
                )
                if result.allowed:
                    await self.writer.write_paper_signal(
                        symbol=symbol,
                        timeframe=self.timeframe,
                        asset_class="STOCKS",
                        win_prob=result.win_prob,
                        take_trade=result.take_trade,
                        predicted_class=result.predicted_class,
                        gate=result.gate,
                        meta=payload,
                    )
                results.append(payload)
                if result.take_trade:
                    logger.info(
                        f"PAPER SIGNAL {symbol} {self.timeframe} "
                        f"win_prob={result.win_prob:.3f} ≥ {result.gate:.2f}"
                    )
            except Exception as exc:
                logger.warning(f"Paper infer failed {symbol}: {exc}")
        return results

    async def run(self) -> None:
        logger.info(
            f"Paper trader starting — {len(self._symbols)} symbols, "
            f"gate={self.engine.min_win_prob:.2f}, poll={self.poll_seconds}s "
            f"(CRYPTO/FOREX inference disabled)"
        )
        logger.info(
            f"Primary NGX-focused: {sorted(PAPER_PRIMARY_SYMBOLS)} | "
            f"Secondary US: {sorted(PAPER_SECONDARY_SYMBOLS)}"
        )
        while self.running:
            await self.run_once()
            await self._log_gate_progress()
            await asyncio.sleep(self.poll_seconds)

    async def _log_gate_progress(self) -> None:
        try:
            stats = await self.reader.paper_trade_stats()
            n = int(stats.get("trades_taken") or 0)
            hit = float(stats.get("hit_rate") or 0.0)
            target = int(DECISION_GATE["min_paper_trades_ngx_stocks"])
            logger.info(
                f"Decision gate progress: paper takes={n}/{target} "
                f"hit_rate={hit*100:.1f}% "
                f"(need ≥{DECISION_GATE['min_paper_hit_rate']*100:.0f}%)"
            )
        except Exception as exc:
            logger.debug(f"paper stats unavailable: {exc}")


async def run_paper_trader(
    *,
    poll_seconds: int = 900,
    once: bool = False,
    checkpoint_path: str | None = None,
) -> None:
    trader = PaperTrader(
        poll_seconds=poll_seconds,
        checkpoint_path=checkpoint_path,
    )
    if once:
        results = await trader.run_once()
        taken = sum(1 for r in results if r.get("take_trade"))
        logger.success(
            f"Paper sweep done — {len(results)} scored, {taken} take signals"
        )
        return
    await trader.run()
