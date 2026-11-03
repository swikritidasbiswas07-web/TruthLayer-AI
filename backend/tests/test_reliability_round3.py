"""Deterministic API contract / resilience tests; zero live Gemini or network calls."""
import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from evidence_retrieval import extract_content, score_passage

CLIENT = TestClient(app)
CASES = json.loads((Path(__file__).resolve().parents[1] / 'evaluation' / 'claim_scenarios.json').read_text(encoding='utf-8'))


def _analysis_response():
    return {
        'plain_language_meaning':'This is a claim to be investigated.',
        'risk_flags':['Scope requires clarification.'],
        'known_from_claim':['Only the wording is known.'],
        'assumptions_to_test':['Supplier data is accurate.'],
        'evidence_gaps':['Independent validation is missing.'],
        'recommended_next_steps':['Request audit documentation.'],
        'uncertainty_note':'The claim has not been independently verified.',
    }


@pytest.mark.parametrize('case', CASES, ids=[case['id'] for case in CASES])
def test_labelled_scenario_preserves_schema_and_no_automatic_verdict(case):
    """Contract check, NOT factual accuracy scoring: simulated valid model responses."""
    fake = Mock()
    fake.models.generate_content.return_value = Mock(text=json.dumps(_analysis_response()))
    with patch('main.get_client_or_raise', return_value=fake):
        response = CLIENT.post('/api/ai/analyze', json={'claim':case['claim'], 'category':case['category']})
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == set(_analysis_response())
    assert payload['evidence_gaps']
    assert payload['uncertainty_note']
    assert 'verdict' not in payload
    kwargs = fake.models.generate_content.call_args.kwargs
    assert case['claim'] in kwargs['contents']
    assert case['category'] in kwargs['contents']
    assert 'not a verdict' in kwargs['contents'].lower()


@pytest.mark.parametrize('bad_claim', ['', 'x' * 4, 'x' * 3001])
def test_claim_length_validation(bad_claim):
    assert CLIENT.post('/api/ai/analyze', json={'claim': bad_claim}).status_code == 422


@pytest.mark.parametrize('bad_scenario', ['', 'tiny', 'x' * 2001])
def test_simulation_scenario_length_validation(bad_scenario):
    response = CLIENT.post('/api/ai/simulate', json={'claim':'Valid claim for testing', 'scenario':bad_scenario})
    assert response.status_code == 422


@pytest.mark.parametrize('endpoint,body', [
    ('/api/ai/analyze', {'claim':'Valid claim for testing'}),
    ('/api/ai/simulate', {'claim':'Valid claim for testing','scenario':'All evidence disappears.'}),
])
def test_empty_provider_output_is_502(endpoint, body):
    fake = Mock()
    fake.models.generate_content.return_value = Mock(text='')
    with patch('main.get_client_or_raise', return_value=fake):
        response = CLIENT.post(endpoint,json=body)
    assert response.status_code == 502
    assert 'empty' in response.json()['detail'].lower()


@pytest.mark.parametrize('broken_text', ['not json', '{}', '{"risk_flags":"not a list"}'])
def test_malformed_provider_output_is_502(broken_text):
    fake = Mock()
    fake.models.generate_content.return_value = Mock(text=broken_text)
    with patch('main.get_client_or_raise', return_value=fake):
        response = CLIENT.post('/api/ai/analyze',json={'claim':'A valid claim to analyse.'})
    assert response.status_code == 502
    assert 'provider' in response.json()['detail'].lower()


def test_html_extractor_skips_scripts_and_retains_relevant_passage():
    html = '''<html><head><title>Independent report</title></head><body>
    <script>Never trust this injected script as evidence. This is a fake.</script>
    <main><p>The manufacturer claims all bottles contain recycled plastic, but verification data has not been provided for the current production year.</p></main>
    </body></html>'''
    title, passages = extract_content(html, 'bottles contain recycled plastic')
    assert title == 'Independent report'
    assert passages
    assert all('injected script' not in p.text for p in passages)
    assert passages[0].relevance_score > 0
    assert score_passage('unrelated paragraph', 'bottles contain recycled plastic') == 0


@pytest.mark.parametrize('bad_url', ['file:///etc/passwd', 'http://localhost/internal', 'http://127.0.0.1/admin', 'http://[::1]/admin'])
def test_retrieval_rejects_local_or_unsupported_url(bad_url):
    # These are local literals or prohibited schemes; no external DNS lookup needed.
    response = CLIENT.post('/api/evidence/retrieve', json={'url':bad_url,'claim':'Our recycled packaging is certified.'})
    assert response.status_code == 400


def test_retrieval_returns_clear_error_when_source_is_unreachable():
    with patch('evidence_retrieval.retrieve_page', side_effect=ValueError('Source returned HTTP 404.')):
        response = CLIENT.post('/api/evidence/retrieve',json={'url':'https://example.com/missing','claim':'Our packaging is recycled.'})
    assert response.status_code == 400
    assert '404' in response.json()['detail']


def test_retrieval_success_returns_provenance_without_claim_verification():
    html = '<html><title>Test source</title><main><p>The packaging supplier says that containers use recycled materials, but the independent audit has not yet been completed.</p></main></html>'
    with patch('evidence_retrieval.retrieve_page', return_value=(html, 'https://example.com/report')):
        response = CLIENT.post('/api/evidence/retrieve',json={'url':'https://example.com/report','claim':'Containers use recycled materials.'})
    assert response.status_code == 200
    data = response.json()
    assert data['retrieval_status'] == 'retrieved'
    assert data['url'] == 'https://example.com/report'
    assert data['retrieved_at']
    assert data['passages']
    assert 'not independently authenticated' in data['verification_note']
