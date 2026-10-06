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
