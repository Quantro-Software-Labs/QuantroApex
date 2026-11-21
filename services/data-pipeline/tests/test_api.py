import pytest
from fastapi.testclient import TestClient
from api.routes import app

client = TestClient(app)

def test_data_pipeline_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["service"] == "data-pipeline"
    assert "inference_gate" in data

def test_data_pipeline_policy():
    from inference.policy import (
        is_inference_allowed,
        passes_confidence_gate,
        DECISION_GATE,
        PAPER_UNIVERSE,
    )
    assert isinstance(PAPER_UNIVERSE, frozenset)
    assert len(PAPER_UNIVERSE) > 0
    assert passes_confidence_gate(0.70) is True
    assert passes_confidence_gate(0.40) is False
    allowed, _ = is_inference_allowed("AAPL", "STOCKS")
    assert allowed is True
    blocked, _ = is_inference_allowed("BTCUSDT", "CRYPTO")
    assert blocked is False
