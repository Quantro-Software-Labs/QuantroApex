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
    from inference.policy import is_inference_allowed, DECISION_GATE, PAPER_UNIVERSE
    assert isinstance(PAPER_UNIVERSE, list)
    assert len(PAPER_UNIVERSE) > 0
    assert is_inference_allowed(0.70) is True
    assert is_inference_allowed(0.40) is False
