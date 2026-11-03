
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app
from evidence_retrieval import (
    extract_content,
    score_passage,
    validate_url,
)

client = TestClient(app)


def test_rejects_localhost():
    with pytest.raises(ValueError):
        validate_url("http://localhost:8000")


def test_rejects_private_ip():
    with pytest.raises(ValueError):
        validate_url("http://127.0.0.1")


def test_rejects_unsupported_scheme():
    with pytest.raises(ValueError):
        validate_url("file:///etc/passwd")


def test_rejects_credentials_in_url():
    with pytest.raises(ValueError):
        validate_url("https://user:pass@example.com")


def test_rejects_nonstandard_port():
    with pytest.raises(ValueError):
        validate_url("https://example.com:8080")


def test_passage_relevance():
    score = score_passage(
        "This packaging contains recycled materials.",
        "Our packaging contains recycled materials.",
    )

    assert score > 0


def test_html_extraction():
    html = """
    <html>
      <head><title>Environmental Report</title></head>
      <body>
        <article>
          <p>
            This report describes the recycled materials
            used in the packaging manufacturing process.
          </p>
        </article>
      </body>
    </html>
    """

    title, passages = extract_content(
        html,
        "Packaging contains recycled materials.",
    )

    assert title == "Environmental Report"
    assert len(passages) == 1
    assert passages[0].relevance_score > 0


def test_retrieval_success():
    html = """
    <html>
      <head><title>Evidence Source</title></head>
      <body>
        <p>
          The manufacturer reports using recycled
          materials in its packaging products.
        </p>
      </body>
    </html>
    """

    with patch(
        "evidence_retrieval.retrieve_page",
        return_value=(html, "https://example.com/report"),
    ):
        response = client.post(
            "/api/evidence/retrieve",
            json={
                "url": "https://example.com/report",
                "claim": "Our packaging contains recycled materials.",
            },
        )

    assert response.status_code == 200
    assert response.json()["retrieval_status"] == "retrieved"
    assert len(response.json()["passages"]) > 0


def test_retrieval_invalid_url():
    response = client.post(
        "/api/evidence/retrieve",
        json={
            "url": "http://localhost:8000/private",
            "claim": "Our packaging contains recycled materials.",
        },
    )

    assert response.status_code == 400


def test_retrieval_missing_claim():
    response = client.post(
        "/api/evidence/retrieve",
        json={
            "url": "https://example.com",
        },
    )

    assert response.status_code == 422


def test_retrieval_timeout():
    with patch(
        "evidence_retrieval.retrieve_page",
        side_effect=ValueError("The source request timed out."),
    ):
        response = client.post(
            "/api/evidence/retrieve",
            json={
                "url": "https://example.com/report",
                "claim": "Our packaging contains recycled materials.",
            },
        )

    assert response.status_code == 400
    assert "timed out" in response.json()["detail"].lower()
