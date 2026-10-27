
import json
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_analysis_rejects_empty_claim():
    response = client.post(
        "/api/ai/analyze",
        json={"claim": "", "category": "Environment"},
    )
    assert response.status_code == 422


def test_analysis_rejects_missing_claim():
    response = client.post(
        "/api/ai/analyze",
        json={"category": "Environment"},
    )
    assert response.status_code == 422


def test_analysis_success_with_mocked_gemini():
    fake_result = {
        "plain_language_meaning": "The product uses recycled materials.",
        "risk_flags": ["Claim needs substantiation."],
        "known_from_claim": ["The claim refers to recycled materials."],
        "assumptions_to_test": ["The recycled content percentage."],
        "evidence_gaps": ["No supporting documentation was supplied."],
        "recommended_next_steps": ["Request supplier documentation."],
        "uncertainty_note": "The claim has not been independently verified.",
    }

    fake_client = Mock()
    fake_client.models.generate_content.return_value = Mock(
        text=json.dumps(fake_result)
    )

    with patch("main.get_client_or_raise", return_value=fake_client):
        response = client.post(
            "/api/ai/analyze",
            json={
                "claim": "Our packaging contains recycled materials.",
                "category": "Environment",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["plain_language_meaning"] == fake_result["plain_language_meaning"]
    assert data["evidence_gaps"] == fake_result["evidence_gaps"]
    fake_client.models.generate_content.assert_called_once()


def test_analysis_returns_502_when_gemini_fails():
    fake_client = Mock()
    fake_client.models.generate_content.side_effect = RuntimeError(
        "Simulated provider failure"
    )

    with patch("main.get_client_or_raise", return_value=fake_client):
        response = client.post(
            "/api/ai/analyze",
            json={
                "claim": "Our packaging contains recycled materials.",
                "category": "Environment",
            },
        )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "AI analysis failed. Check the backend terminal for the provider error."
    )


def test_analysis_returns_503_when_api_key_is_missing(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    response = client.post(
        "/api/ai/analyze",
        json={
            "claim": "Our packaging contains recycled materials.",
            "category": "Environment",
        },
    )

    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()

def test_simulation_success_with_mocked_gemini():
    fake_result = {
        "scenario_summary": "The supplier cannot verify the recycled content.",
        "what_changes": [
            "The recycled-content claim needs further substantiation."
        ],
        "affected_assumptions": [
            "The supplier documentation is reliable."
        ],
        "possible_consequences": [
            "The claim may require reassessment if the scenario is confirmed."
        ],
        "evidence_needed": [
            "Obtain supplier records and independent test results."
        ],
        "reassessment_recommendation": (
            "Ask a human reviewer to reassess the claim."
        ),
        "confidence_limit": (
            "This is hypothetical and has not been independently verified."
        ),
    }

    fake_client = Mock()
    fake_client.models.generate_content.return_value = Mock(
        text=json.dumps(fake_result)
    )

    with patch("main.get_client_or_raise", return_value=fake_client):
        response = client.post(
            "/api/ai/simulate",
            json={
                "claim": "Our packaging contains recycled materials.",
                "category": "Environment",
                "scenario": (
                    "The supplier cannot verify the recycled content."
                ),
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["scenario_summary"] == fake_result["scenario_summary"]
    assert data["evidence_needed"] == fake_result["evidence_needed"]
    fake_client.models.generate_content.assert_called_once()


def test_simulation_returns_502_when_gemini_fails():
    fake_client = Mock()
    fake_client.models.generate_content.side_effect = RuntimeError(
        "Simulated provider failure"
    )

    with patch("main.get_client_or_raise", return_value=fake_client):
        response = client.post(
            "/api/ai/simulate",
            json={
                "claim": "Our packaging contains recycled materials.",
                "category": "Environment",
                "scenario": "The supplier cannot verify the claim.",
            },
        )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Reality simulation failed. Check the backend terminal "
        "for the provider error."
    )


def test_simulation_rejects_empty_scenario():
    response = client.post(
        "/api/ai/simulate",
        json={
            "claim": "Our packaging contains recycled materials.",
            "category": "Environment",
            "scenario": "",
        },
    )

    assert response.status_code == 422


def test_simulation_returns_503_when_api_key_is_missing(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    response = client.post(
        "/api/ai/simulate",
        json={
            "claim": "Our packaging contains recycled materials.",
            "category": "Environment",
            "scenario": "The supplier cannot verify the claim.",
        },
    )

    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()
