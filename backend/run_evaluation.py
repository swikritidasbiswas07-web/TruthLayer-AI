"""Run reproducible offline TruthLayer tests and emit evaluation/report artifacts."""
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent

class Results:
    def __init__(self):
        self.tests = {}
    def pytest_runtest_logreport(self, report):
        if report.when == 'call':
            self.tests[report.nodeid] = 'passed' if report.passed else ('skipped' if report.skipped else 'failed')
        elif report.when == 'setup' and (report.failed or report.skipped):
            self.tests[report.nodeid] = 'failed' if report.failed else 'skipped'


def main():
    dataset = json.loads((ROOT / 'evaluation' / 'claim_scenarios.json').read_text(encoding='utf-8'))
    results = Results()
    exit_code = int(pytest.main(['-q', 'tests'], plugins=[results]))
    outcomes = Counter(results.tests.values())
    passed = outcomes['passed']
    failed = outcomes['failed']
    skipped = outcomes['skipped']
    total = passed + failed + skipped
    result = {
        'generated_at_utc':datetime.now(timezone.utc).isoformat(),
        'test_type':'Offline automated contract, validation, and failure-path checks; mocked Gemini and network',
        'total_tests':total,'passed':passed,'failed':failed,'skipped':skipped,
        'pass_rate_percent':round(100 * passed / total, 2) if total else 0,
        'dataset_scenarios':len(dataset),
        'scenario_types':dict(Counter(c['expected_review_focus'] for c in dataset)),
        'factual_accuracy_evaluated':False,
        'limitations':['Model responses are mocked; passing cases do not measure Gemini truthfulness or accuracy.',
                       'No live website availability or production latency measured.',
                       'Supabase RLS requires a separate live two-user integration test.',
                       'Shared public demo account can be modified by visitors.'],
        'pytest_exit_code':exit_code,
        'test_results':results.tests,
    }
    out = ROOT / 'evaluation' / 'reports'
    out.mkdir(parents=True,exist_ok=True)
    (out/'latest.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    md = f'''# TruthLayer AI — Automated Evaluation Report

- Generated (UTC): {result['generated_at_utc']}
- Automated tests: **{passed}/{total} passed**; {failed} failed; {skipped} skipped
- Pass rate: **{result['pass_rate_percent']}%** (for these offline tests only)
- Labelled review scenarios: **{len(dataset)}**
- Execution: `python run_evaluation.py` from `backend/`

## What was evaluated

API response schema and request validation, malformed/empty Gemini responses, simulated provider failures, HTML passage extraction, unsafe URL rejection, retrieval failure, and provenance response fields. The labelled cases check API contracts, **not** correctness of model-generated claims.

## Limitations

'''+''.join(f'- {x}\n' for x in result['limitations'])+f'\n## Outcome\n\n{"PASS" if exit_code == 0 and failed == 0 else "FAIL — inspect pytest output"}\n'
    (out/'latest.md').write_text(md,encoding='utf-8')
    print(f'\nReport written to: {out / "latest.md"}')
    return exit_code

if __name__ == '__main__':
    raise SystemExit(main())
