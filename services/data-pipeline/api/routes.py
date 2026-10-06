"""FastAPI query endpoints for the AI service."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from inference.engine import GlobalBrainInference
from inference.policy import (
    DECISION_GATE,
    INFERENCE_MIN_WIN_PROB,
    PAPER_UNIVERSE,
    is_inference_allowed,
)
from processing.features import annotate_smc, extract_indicator_features
from storage.timescale import TimescaleReader

app = FastAPI(
    title="QuantroApex Data Service",
    description="Market data query API for AI service / Global Brain inference",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

reader = TimescaleReader()
_inference: GlobalBrainInference | None = None


def _get_inference() -> GlobalBrainInference:
    global _inference
    if _inference is None:
        _inference = GlobalBrainInference(min_win_prob=INFERENCE_MIN_WIN_PROB)
    return _inference


@app.get("/health")
async def health():
    try:
        candles = await reader.count_ohlcv()
        samples = await reader.count_samples()
        return {
            "status": "ok",
            "service": "data-pipeline",
            "ohlcv_count": candles,
            "labelled_samples": samples,
            "inference_gate": INFERENCE_MIN_WIN_PROB,
            "paper_universe_size": len(PAPER_UNIVERSE),
        }
    except Exception as exc:
        return {"status": "degraded", "service": "data-pipeline", "error": str(exc)}


@app.get("/market-data/{symbol}/{timeframe}")
async def get_market_data(
    symbol: str,
    timeframe: str,
    limit: int = Query(200, ge=1, le=5000),
):
    """
    Used by the SMC analysis engine and signal generation models
    to fetch recent OHLCV data for a given asset.
    """
    # Accept URL-encoded symbols like BTC%2FUSDT
    symbol = symbol.replace("-", "/")
    df = await reader.get_recent_ohlcv(symbol, timeframe, limit)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol} {timeframe}")

    reset = df.reset_index()
    candles = []
    for _, row in reset.iterrows():
        candles.append(
            {
                "time": row["time"].isoformat() if hasattr(row["time"], "isoformat") else str(row["time"]),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"]),
            }
        )
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "count": len(candles),
        "candles": candles,
    }


@app.get("/symbols/{asset_class}")
async def get_symbols(asset_class: str):
    symbols = await reader.get_symbols(asset_class.upper())
    return {"asset_class": asset_class.upper(), "symbols": symbols, "count": len(symbols)}


@app.get("/features/{symbol}/{timeframe}")
async def get_features(
    symbol: str,
    timeframe: str,
    limit: int = Query(200, ge=50, le=2000),
):
    """Latest indicator + SMC feature snapshot for inference."""
    symbol = symbol.replace("-", "/")
    df = await reader.get_recent_ohlcv(symbol, timeframe, limit)
    if df.empty or len(df) < 50:
        raise HTTPException(status_code=404, detail=f"Insufficient data for {symbol}")
    idx = len(df) - 1
    features = extract_indicator_features(df, idx)
    smc = annotate_smc(df)
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "features": features,
        "smc": smc,
    }


@app.get("/infer/{symbol}")
async def infer_symbol(
    symbol: str,
    timeframe: str = Query("1D"),
    asset_class: str = Query("STOCKS"),
):
    """
    SCOPED_EDGE Global Brain inference.

    Hard gate: win_prob >= 0.55. Crypto/forex and out-of-universe symbols
    always return take_trade=false.
    """
    symbol = symbol.replace("-", "/")
    allowed, reason = is_inference_allowed(symbol, asset_class)
    if not allowed:
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "asset_class": asset_class.upper(),
            "allowed": False,
            "deny_reason": reason,
            "take_trade": False,
            "gate": INFERENCE_MIN_WIN_PROB,
            "mode": "blocked",
        }
    try:
        result = await _get_inference().infer_symbol(
            symbol, timeframe=timeframe, asset_class=asset_class.upper()
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return result.as_dict()


@app.get("/paper/status")
async def paper_status():
    """Decision-gate progress from the paper_signals ledger."""
    try:
        stats = await reader.paper_trade_stats()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    target = int(DECISION_GATE["min_paper_trades_ngx_stocks"])
    taken = int(stats.get("trades_taken") or 0)
    return {
        "mode": "paper",
        "gate": INFERENCE_MIN_WIN_PROB,
        "universe": sorted(PAPER_UNIVERSE),
        "stats": stats,
        "decision_gate": DECISION_GATE,
        "progress": {
            "paper_trades": taken,
            "paper_trades_target": target,
            "paper_trades_pct": round(100.0 * taken / target, 1) if target else 0.0,
        },
    }


@app.get("/stats")
async def stats():
    candles = await reader.count_ohlcv()
    samples = await reader.count_samples()
    return {"ohlcv_count": candles, "labelled_samples": samples}
