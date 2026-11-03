# TruthLayer AI

**Evidence before assertion.** An evidence-led brand-claim investigation and governance application built by **Team Axiom** for Codex 48.

- **Live product:** https://truth-layer-ai-jade.vercel.app/
- **Source code:** https://github.com/swikritidasbiswas07-web/TruthLayer-AI
- **Public API health:** https://truthlayer-ai-api.onrender.com/health
- **Demo access:** select **Enter judge demo** on the landing page. Four sample investigations are preloaded. The account is shared and editable; do not enter private data.

## What the product does

TruthLayer AI helps a reviewer record an exact claim, inspect risk flags and assumptions, gather and link relevant source passages, independently assess policy/permission and evidentiary support, and record a human decision. It also provides an interactive claim-relationship graph and a hypothetical Reality Simulator. AI output is preliminary decision support, **not an automatic fact-check or compliance verdict**.

### Implemented capabilities

1. User sign-in/sign-up with Supabase Auth; individual cloud workspaces with Postgres Row Level Security (RLS).
2. Create, reopen, edit, and sync structured investigation records across sessions. Existing browser investigations may be imported explicitly.
3. Evidence register (title, publisher, date, URL, excerpt, reviewer stance and notes).
4. Public **HTML** webpage retrieval with source metadata, selected passages, timestamp, provenance and reviewer-facing quality flags.
5. Retrieval protections: public IP validation, DNS-pinned connections, redirect checks, standard ports, bounded response size, timeouts, and per-process throttling.
6. Gemini preliminary claim analysis: risk flags, known-from-claim, assumptions, evidence gaps, recommended steps, uncertainty.
7. Independent permission/evidence assessments, evidence linking, and a documented human review decision.
8. Known / Assumed / Unknown audit and claim intelligence relationship graph.
9. Reality Simulator for hypothetical changes; simulations do not change stored assessments or decisions.
10. Browser print / Save as PDF for individual investigation reports; RiRi-assisted judge login with preloaded cases.
11. Offline automated testing and reproducible evaluation report.

## Architecture

```text
Browser: React + TypeScript + Vite (Vercel)
   |-- Supabase JS --> Supabase Auth --> PostgreSQL investigations table + RLS
   |-- HTTPS /api/ai/analyze --> FastAPI (Render) --> Google Gemini
   |-- HTTPS /api/ai/simulate --> FastAPI (Render) --> Google Gemini
   '-- HTTPS /api/evidence/retrieve --> FastAPI (Render) --> validated public HTML pages

FastAPI: Python, Pydantic, BeautifulSoup, bounded DNS-pinned HTTP(S) retrieval.
RiRi: existing frontend 3D model at public/models/help-buddy.glb.
```

### Security model

- The browser uses **only** the Supabase publishable/anon key; never use a service-role or secret key in `VITE_` variables.
- The database `investigations` table has RLS policies constrained by `auth.uid() = user_id` for select, insert, update and delete.
- Shared judge-demo credentials are **public** by design and grant access only to sample records within the demo user's RLS scope. A shared demo account is not a private sandbox; visitors can edit the same demo records.
- Source retrieval is limited to public HTTP(S) HTML pages. Retrieving a URL does not independently authenticate the source or prove the claim.
- API AI endpoints are demonstration endpoints and do not currently enforce per-user authentication or quota; add authorization, provider-budget controls and shared rate limiting before broad public scaling.

## Local setup (Windows PowerShell)

Prerequisites: Node.js/npm, Python 3.12+ (or a version compatible with dependencies), a Supabase project, and a Gemini API key. Clone the repository:

```powershell
git clone https://github.com/swikritidasbiswas07-web/TruthLayer-AI.git
cd TruthLayer-AI
npm install
```

Create `src/lib/supabase.ts` only if absent; it is included in the repository. In the **project root**, create `.env.local`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

In `backend/`, create a virtual environment, install dependencies, then create `backend/.env`:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

```dotenv
GEMINI_API_KEY=YOUR_OWN_GEMINI_KEY
GEMINI_MODEL=gemini-2.5-flash-lite
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Configure **Supabase Auth email/password** and create `public.investigations` with at least `id TEXT`, `user_id UUID REFERENCES auth.users(id)`, `payload JSONB`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, composite primary key `(user_id,id)`. Enable RLS; permit authenticated users to select, insert, update and delete **only rows where `auth.uid() = user_id`**. This is an essential deployment prerequisite: an empty or missing table is not an installation success. Do not disable RLS. Configure Supabase Auth site and redirect URLs for localhost and your deployed domain. Refer to your SQL migration/script if you maintain one; this repository does not currently guarantee an automated database migration.

In **backend terminal**:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

In **a second terminal**, from the project root:

```powershell
npm run dev -- --port 5173 --strictPort
```

Open http://localhost:5173/ and http://127.0.0.1:8000/health . Run `npm run build` to validate the production frontend build.

## Production configuration

- **Render backend**: build with `pip install -r requirements.txt` from the `backend` root directory; serve using `uvicorn main:app --host 0.0.0.0 --port $PORT`. Set `GEMINI_API_KEY`, optional `GEMINI_MODEL`, and `CORS_ORIGINS=https://truth-layer-ai-jade.vercel.app`. Ensure the Render root directory is `backend` (or adapt commands appropriately).
- **Vercel frontend**: build from repository root using `npm run build`, output `dist`. Define Production variables `VITE_API_BASE_URL=https://truthlayer-ai-api.onrender.com`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` (publishable key only). Redeploy after changing Vite environment variables.
- **Supabase**: permit the production domain as a redirect URL and retain owner-only RLS policies.
- **Free-tier caveat**: Render can spin down and incur cold starts; do not promise consistently low first-request latency.

## How to run the reliability suite

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe run_evaluation.py
```

Outputs: `backend/evaluation/reports/latest.md`, `latest.json`. Last demonstrated result on November 3, 2026: **63/63 offline tests passed**, one dependency deprecation warning, and **24 hand-authored scenario labels**. Tests mock Gemini and network interactions; the result is an API-contract and failure-handling pass rate, **not a model truthfulness, classification-accuracy, or evidence-attribution-accuracy score**. The labelled scenarios have `reference_verdict: not_assigned`.

## Quick manual smoke tests

1. Open the deployed product in an incognito tab; click **Enter judge demo**. Confirm four sample investigations load (three Reviewed, one In review).
2. Open one case, inspect evidence, and refresh to confirm persistence. Avoid modifying the shared demo data unnecessarily.
3. Submit a realistic claim to **Analyse claim with AI**; confirm structured sections and uncertainty note.
4. Retrieve a **public HTML** page in the Evidence Register, inspect passages, selected excerpt, timestamp and provenance; save and link a source if needed.
5. Run a hypothetical Reality Simulator scenario, then verify the stored evidence assessment and human decision were **not** changed.
6. Inspect Claim Intelligence Graph node relationships and node details.
7. Validate rejection behaviour: blank analysis claim returns HTTP 422; local retrieval URL returns HTTP 400. Avoid live brute-force/security testing of third-party endpoints.
8. Confirm account isolation with two separate test users using non-sensitive sample records. A simulated SQL policy check is supporting evidence, not a complete penetration test.

## Backup, recovery and limitations

- **Recovery:** Investigations persist in Supabase across browser refresh and sign-in. The database is the source of truth; the earlier browser-storage import is only for migration, not a full backup system.
- **Recommended backup:** With authorized project-admin access, regularly export the `investigations` table (including `user_id`, `id`, `payload` and timestamps) to a protected location and test restoration in a separate project. Preserve Supabase Auth users and RLS configuration separately. **An automated scheduled backup/restore feature is not implemented.**
- **Edit safety:** Autosave is debounced; wait for **Cloud synced** before closing a page or signing out. Concurrent writers and shared-demo edits can overwrite one another; transaction-level conflict resolution is not implemented.
- **Source restrictions:** HTML only; PDFs, authenticated pages, inaccessible/oversized pages and other unsupported formats cannot be automatically extracted. Retrieval metadata is not independent source authentication.
- **AI limitations:** Gemini may generate incorrect, overconfident or incomplete content. Human evidence review is required. A full reference-labelled benchmark for classification and evidence-attribution error rates has **not** been completed.
- **Other loose ends:** Original Round 1 Brand Vault/draft approval workflow is not fully implemented end to end; some Brand DNA and Brand Court working-canvas data is stored only in the browser. AI responses and simulation outputs are not necessarily persisted after refresh. Shared public demo state is mutable.

## Roadmap

1. **Reliability:** Real-world labelled benchmarks with reference verdicts, attribution precision, adverse-case testing, request timeouts, UI autosave indicators, conflict handling and application monitoring.
2. **Evidence:** PDF ingestion, archived citations, source authenticity checks, versioned passage snapshots and source-quality review workflows.
3. **Governance:** Full Brand Vault and draft approval lifecycle, reviewer roles, immutable audit histories and RBAC.
4. **Operations:** Automated backup/restore drills, authenticated API proxy, global usage limits, observability and a resettable isolated demo environment.

## Responsible-use statement

TruthLayer provides a structured workflow for investigating claims and documenting decisions. It is not a regulator, legal advisor, certification body, or autonomous truth arbiter. Final decisions require qualified human review of primary source materials.
