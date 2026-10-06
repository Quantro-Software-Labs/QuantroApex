"""Quant Engine FastAPI application."""

from __future__ import annotations

from typing import Any, Literal, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.backtest import VECTORBT_AVAILABLE, run_backtest
from app.patterns import TALIB_AVAILABLE, detect_patterns, list_pattern_names

app = FastAPI(
    title="QuantroApex Quant Engine",
    description="TA-Lib candlestick patterns & VectorBT backtesting",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Candle(BaseModel):
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None
    timestamp: Optional[str] = None


class PatternDetectRequest(BaseModel):
    candles: list[Candle] = Field(..., min_length=1)
    patterns: Optional[list[str]] = None


class PatternDetection(BaseModel):
    index: int
    name: str
    signal: int
    degraded: Optional[bool] = None


class PatternDetectResponse(BaseModel):
    mode: str
    detections: list[PatternDetection]
    count: int
    warning: Optional[str] = None


class StrategyConfig(BaseModel):
    type: Literal["sma_crossover", "rsi", "buy_hold"]
    params: Optional[dict[str, Any]] = None


class BacktestRequest(BaseModel):
    candles: list[Candle] = Field(..., min_length=2)
    strategy: StrategyConfig
    initial_cash: float = Field(default=10_000.0, gt=0)


class EquityPoint(BaseModel):
    t: Any
    equity: float


class BacktestResponse(BaseModel):
    total_return: float
    sharpe: float
    max_drawdown: float
    win_rate: float
    trades: int
    equity_curve: list[EquityPoint]
    final_value: float
    engine: str
    strategy: dict[str, Any]
    warning: Optional[str] = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "quant-engine",
        "talib": TALIB_AVAILABLE,
        "vectorbt": VECTORBT_AVAILABLE,
        "patterns_mode": "talib" if TALIB_AVAILABLE else "degraded",
    }


@app.get("/patterns/list")
def patterns_list() -> dict[str, Any]:
    names = list_pattern_names()
    return {
        "patterns": names,
        "count": len(names),
        "mode": "talib" if TALIB_AVAILABLE else "degraded",
    }


@app.post("/patterns/detect", response_model=PatternDetectResponse)
def patterns_detect(body: PatternDetectRequest) -> PatternDetectResponse:
    try:
        result = detect_patterns(
            [c.model_dump() for c in body.candles],
            body.patterns,
        )
        return PatternDetectResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/backtest/run", response_model=BacktestResponse)
def backtest_run(body: BacktestRequest) -> BacktestResponse:
    try:
        result = run_backtest(
            candles=[c.model_dump() for c in body.candles],
            strategy_type=body.strategy.type,
            params=body.strategy.params or {},
            initial_cash=body.initial_cash,
        )
        return BacktestResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def main() -> None:
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)


if __name__ == "__main__":
    main()
