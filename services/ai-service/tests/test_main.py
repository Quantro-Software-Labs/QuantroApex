import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-service"
    assert "patterns_mode" in data

def test_patterns_list():
    response = client.get("/patterns/list")
    assert response.status_code == 200
    data = response.json()
    assert "patterns" in data
    assert isinstance(data["patterns"], list)
    assert data["count"] == len(data["patterns"])

def test_patterns_detect():
    payload = {
        "candles": [
            {"open": 100.0, "high": 105.0, "low": 99.0, "close": 104.0, "volume": 1000},
            {"open": 104.0, "high": 108.0, "low": 103.0, "close": 107.0, "volume": 1200},
            {"open": 107.0, "high": 109.0, "low": 102.0, "close": 103.0, "volume": 1500},
        ]
    }
    response = client.post("/patterns/detect", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "mode" in data
    assert "detections" in data

def test_backtest_run():
    payload = {
        "candles": [
            {"open": 100.0, "high": 105.0, "low": 99.0, "close": 104.0},
            {"open": 104.0, "high": 108.0, "low": 103.0, "close": 107.0},
            {"open": 107.0, "high": 109.0, "low": 102.0, "close": 103.0},
            {"open": 103.0, "high": 110.0, "low": 101.0, "close": 109.0},
        ],
        "strategy": {
            "type": "buy_hold",
            "params": {}
        },
        "initial_cash": 10000.0
    }
    response = client.post("/backtest", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "total_return" in data
    assert "final_value" in data

@pytest.mark.asyncio
async def test_load_ohlcv_no_synthetic_fallback():
    from app.data.market_data import load_ohlcv
    with pytest.raises(RuntimeError, match="Synthetic candle fallback is disabled"):
        await load_ohlcv("STOCKS", "NONEXISTENT_TICKER", "1h", bars=50)

def test_backtest_default_fees_applied():
    from app.backtesting.backtest_runner import run_backtest
    candles = [
        {"timestamp": f"2026-01-0{i+1}T00:00:00Z", "open": 100.0 + i, "high": 105.0 + i, "low": 99.0 + i, "close": 100.0 + i, "volume": 1000}
        for i in range(5)
    ]
    # In buy_hold, if price is flat, total_return will be slightly negative due to mandatory entry/exit fees
    flat_candles = [
        {"timestamp": f"2026-01-0{i+1}T00:00:00Z", "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0, "volume": 1000}
        for i in range(5)
    ]
    result = run_backtest(flat_candles, "buy_hold", params={}, initial_cash=10000.0)
    # Total return must be negative because fees are applied and never zero
    assert result["total_return"] < 0.0
