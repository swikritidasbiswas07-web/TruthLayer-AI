# TruthLayer AI — Automated Evaluation Report

- Generated (UTC): 2026-11-02T19:07:34.137016+00:00
- Automated tests: **63/63 passed**; 0 failed; 0 skipped
- Pass rate: **100.0%** (for these offline tests only)
- Labelled review scenarios: **24**
- Execution: `python run_evaluation.py` from `backend/`

## What was evaluated

API response schema and request validation, malformed/empty Gemini responses, simulated provider failures, HTML passage extraction, unsafe URL rejection, retrieval failure, and provenance response fields. The labelled cases check API contracts, **not** correctness of model-generated claims.

## Limitations

- Model responses are mocked; passing cases do not measure Gemini truthfulness or accuracy.
- No live website availability or production latency measured.
- Supabase RLS requires a separate live two-user integration test.
- Shared public demo account can be modified by visitors.

## Outcome

PASS
