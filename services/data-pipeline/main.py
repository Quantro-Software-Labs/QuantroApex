"""
QuantroApex Data Pipeline — orchestration entry point.

Modes:
  setup         — schema → historical ingest → label → train Global Brain
  stream        — continuous real-time market data into TimescaleDB
  api           — FastAPI query service on :8002
  label         — labelling only
  train         — training only
  evaluate      — time holdout + walk-forward vs EMA/RSI baselines
  walk-forward  — calendar 4w/2w sliding windows (decision-gate metric)
  paper         — SCOPED_EDGE paper inference (NGX + US stocks, gate 0.55)
  all           — stream + API + paper trader concurrently (production default)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Ensure service root is on sys.path when run as `python main.py`
_SERVICE_ROOT = Path(__file__).resolve().parent
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from loguru import logger

from config import get_settings
from inference.policy import INFERENCE_MIN_WIN_PROB
from storage.timescale import apply_schema, close_pool


def _configure_logging() -> None:
    settings = get_settings()
    logger.remove()
    logger.add(
        sys.stderr,
        level=settings.log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
    )


async def run_setup(
    *,
    skip_ingest: bool = False,
    skip_label: bool = False,
    skip_train: bool = False,
    epochs: int = 50,
    asset_class: str | None = None,
    force_reingest: bool = False,
    strategy_id: str | None = None,
) -> None:
    """
    Setup pipeline: schema → ingest (crypto skip if logged) → label → train.
    """
    logger.info("═══════════════════════════════════════════════")
    logger.info("  QuantroApex Data Pipeline — Setup            ")
    logger.info("═══════════════════════════════════════════════")
    logger.info("  Sources: Binance (crypto), yfinance (stocks),")
    logger.info("           Twelve Data (forex)                 ")
    logger.info("═══════════════════════════════════════════════")

    logger.info("Step 1/4: Applying TimescaleDB / Postgres schema")
    await apply_schema()
    logger.success("Schema applied")

    if not skip_ingest:
        logger.info("Step 2/4: Historical bulk ingestion")
        logger.info("  Crypto:  SKIPPED if already in ingestion_log")
        logger.info("  Stocks:  yfinance — no credentials needed")
        logger.info("  Forex:   Twelve Data — requires TWELVEDATA_API_KEY")
        from ingestion.historical import HistoricalIngester

        ingester = HistoricalIngester()
        total = await ingester.run(
            asset_class=asset_class,
            force=force_reingest,
        )
        logger.success(
            f"Historical ingestion complete ({total:,} candles written this run)"
        )
    else:
        logger.info("Step 2/4: Skipping historical ingestion")

    if not skip_label:
        logger.info("Step 3/4: Strategy labelling (crypto + stocks + forex)")
        from processing.labeller import StrategyLabeller

        labeller = StrategyLabeller()
        strategy_ids = [strategy_id] if strategy_id else None
        samples = await labeller.run_all(strategy_ids=strategy_ids)
        logger.success(f"Labelling complete ({samples:,} samples)")
    else:
        logger.info("Step 3/4: Skipping labelling")

    if not skip_train:
        logger.info("Step 4/4: Training Global Brain on full dataset")
        logger.info(
            "  Previous checkpoint archived — latest.pt updated with new best"
        )
        from training.trainer import GlobalBrainTrainer

        trainer = GlobalBrainTrainer()
        result = await trainer.train(epochs=epochs, batch_size=256)
        logger.success(f"Global Brain training finished: {result}")
    else:
        logger.info("Step 4/4: Skipping training")

    # Summary from DB
    try:
        from storage.timescale import get_pool

        pool = await get_pool()
        async with pool.acquire() as conn:
            total_candles = await conn.fetchval("SELECT COUNT(*) FROM market_ohlcv")
            total_samples = await conn.fetchval(
                "SELECT COUNT(*) FROM labelled_samples"
            )
            total_runs = await conn.fetchval(
                "SELECT COUNT(*) FROM training_runs WHERE status='SUCCESS'"
            )
            by_class = await conn.fetch(
                """
                SELECT asset_class, COUNT(*) AS n
                FROM market_ohlcv
                GROUP BY asset_class
                ORDER BY asset_class
                """
            )
        logger.info("═══════════════════════════════════════════════")
        logger.info(f"  OHLCV candles:       {total_candles:,}")
        for row in by_class:
            logger.info(f"    {row['asset_class']}: {row['n']:,}")
        logger.info(f"  Labelled samples:    {total_samples:,}")
        logger.info(f"  Training runs:       {total_runs}")
        logger.info("  Checkpoint:          checkpoints/global_brain_latest.pt")
        logger.info("═══════════════════════════════════════════════")
    except Exception as exc:
        logger.warning(f"Could not print DB summary: {exc}")

    logger.info("  Setup complete. Ready for V2 launch.")
    await close_pool()


async def run_streaming() -> None:
    logger.info("Starting real-time market data streaming")
    await apply_schema()
    from ingestion.streaming import RealTimeStreamer

    streamer = RealTimeStreamer()
    await streamer.run()


def run_api() -> None:
    import uvicorn
    from api.routes import app

    settings = get_settings()

    @app.on_event("startup")
    async def _startup() -> None:
        try:
            await apply_schema()
        except Exception as exc:
            logger.warning(f"Schema ensure on API startup failed: {exc}")

    uvicorn.run(
        app,
        host=settings.data_service_host,
        port=settings.data_service_port,
        log_level=settings.log_level.lower(),
    )


async def run_label_only(strategy_id: str | None = None) -> None:
    await apply_schema()
    from processing.labeller import StrategyLabeller

    labeller = StrategyLabeller()
    strategy_ids = [strategy_id] if strategy_id else None
    await labeller.run_all(strategy_ids=strategy_ids)
    await close_pool()


async def run_train_only(epochs: int = 50) -> None:
    await apply_schema()
    from training.trainer import GlobalBrainTrainer

    trainer = GlobalBrainTrainer()
    await trainer.train(epochs=epochs)
    await close_pool()


async def run_evaluate(
    *,
    checkpoint: str | None = None,
    holdout: float = 0.2,
    folds: int = 3,
    min_win_prob: float = INFERENCE_MIN_WIN_PROB,
    no_walk_forward: bool = False,
    asset_class: str | None = None,
) -> None:
    """Time holdout + walk-forward eval vs EMA/RSI baselines."""
    await apply_schema()
    from training.evaluate import GlobalBrainEvaluator

    evaluator = GlobalBrainEvaluator(checkpoint_path=checkpoint)
    report = await evaluator.run(
        holdout_frac=holdout,
        n_folds=folds,
        min_win_prob=min_win_prob,
        walk_forward=not no_walk_forward,
        asset_class=asset_class,
    )
    logger.success(f"Evaluation complete — {report.get('verdict', '')}")
    await close_pool()


async def run_walk_forward_cli(
    *,
    checkpoint: str | None = None,
    min_win_prob: float = INFERENCE_MIN_WIN_PROB,
    asset_class: str | None = "STOCKS",
    strategy_id: str | None = None,
) -> None:
    await apply_schema()
    from evaluation.walk_forward import run_walk_forward

    await run_walk_forward(
        checkpoint=checkpoint,
        min_win_prob=min_win_prob,
        asset_class=asset_class,
        strategy_id=strategy_id,
    )
    await close_pool()


async def run_paper(
    *,
    once: bool = False,
    poll_seconds: int = 900,
    checkpoint: str | None = None,
) -> None:
    await apply_schema()
    from inference.paper_trader import run_paper_trader

    await run_paper_trader(
        once=once,
        poll_seconds=poll_seconds,
        checkpoint_path=checkpoint,
    )
    await close_pool()


async def run_all() -> None:
    """Production: streaming + API + scoped paper inference."""
    await apply_schema()

    async def _api() -> None:
        import uvicorn
        from api.routes import app

        settings = get_settings()
        config = uvicorn.Config(
            app,
            host=settings.data_service_host,
            port=settings.data_service_port,
            log_level=settings.log_level.lower(),
        )
        server = uvicorn.Server(config)
        await server.serve()

    from ingestion.streaming import RealTimeStreamer
    from inference.paper_trader import PaperTrader

    streamer = RealTimeStreamer()
    paper = PaperTrader(poll_seconds=900)
    await asyncio.gather(streamer.run(), _api(), paper.run())


def main() -> None:
    _configure_logging()
    parser = argparse.ArgumentParser(description="QuantroApex Data Pipeline")
    parser.add_argument(
        "mode",
        choices=[
            "setup",
            "stream",
            "api",
            "label",
            "train",
            "evaluate",
            "walk-forward",
            "paper",
            "all",
        ],
        help="Pipeline mode",
    )
    parser.add_argument("--skip-ingest", action="store_true")
    parser.add_argument("--skip-label", action="store_true")
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument(
        "--force-reingest",
        action="store_true",
        help="Clear matching ingestion_log rows before historical fetch",
    )
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=None,
        help="Path to .pt checkpoint (default: checkpoints/global_brain_latest.pt)",
    )
    parser.add_argument(
        "--holdout",
        type=float,
        default=0.2,
        help="Fraction of newest samples held out by entry_time (default 0.2)",
    )
    parser.add_argument(
        "--folds",
        type=int,
        default=3,
        help="Walk-forward fold count for evaluate mode (default 3)",
    )
    parser.add_argument(
        "--min-win-prob",
        type=float,
        default=INFERENCE_MIN_WIN_PROB,
        help=f"Confidence gate for WIN predictions (default {INFERENCE_MIN_WIN_PROB})",
    )
    parser.add_argument(
        "--no-walk-forward",
        action="store_true",
        help="Skip walk-forward folds; holdout only",
    )
    parser.add_argument(
        "--asset-class",
        type=str,
        default=None,
        help="Limit to CRYPTO, STOCKS, or FOREX (setup ingest / evaluate)",
    )
    parser.add_argument(
        "--strategy-id",
        type=str,
        default=None,
        help="Label / walk-forward only this strategy (e.g. ngx-trend-follower)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="For paper mode: single sweep then exit",
    )
    parser.add_argument(
        "--poll-seconds",
        type=int,
        default=900,
        help="Paper trader poll interval (default 900)",
    )
    args = parser.parse_args()

    settings = get_settings()
    logger.info(
        f"DATABASE → {settings.dsn_candidates()[0].split('@')[-1] if settings.dsn_candidates() and '@' in settings.dsn_candidates()[0] else '(local)'}"
    )
    if len(settings.dsn_candidates()) > 1:
        logger.info(f"Fallback DSNs available: {len(settings.dsn_candidates()) - 1}")
    os.makedirs(settings.checkpoint_dir, exist_ok=True)

    if args.mode == "setup":
        asyncio.run(
            run_setup(
                skip_ingest=args.skip_ingest,
                skip_label=args.skip_label,
                skip_train=args.skip_train,
                epochs=args.epochs,
                asset_class=args.asset_class,
                force_reingest=args.force_reingest,
                strategy_id=args.strategy_id,
            )
        )
    elif args.mode == "stream":
        asyncio.run(run_streaming())
    elif args.mode == "api":
        run_api()
    elif args.mode == "label":
        asyncio.run(run_label_only(strategy_id=args.strategy_id))
    elif args.mode == "train":
        asyncio.run(run_train_only(epochs=args.epochs))
    elif args.mode == "evaluate":
        asyncio.run(
            run_evaluate(
                checkpoint=args.checkpoint,
                holdout=args.holdout,
                folds=args.folds,
                min_win_prob=args.min_win_prob,
                no_walk_forward=args.no_walk_forward,
                asset_class=args.asset_class,
            )
        )
    elif args.mode == "walk-forward":
        asyncio.run(
            run_walk_forward_cli(
                checkpoint=args.checkpoint,
                min_win_prob=args.min_win_prob,
                asset_class=args.asset_class or "STOCKS",
                strategy_id=args.strategy_id,
            )
        )
    elif args.mode == "paper":
        asyncio.run(
            run_paper(
                once=args.once,
                poll_seconds=args.poll_seconds,
                checkpoint=args.checkpoint,
            )
        )
    elif args.mode == "all":
        asyncio.run(run_all())


if __name__ == "__main__":
    main()
