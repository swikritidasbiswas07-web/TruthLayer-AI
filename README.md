# TruthLayer AI — Round 2 Build

React + TypeScript + Vite prototype for an evidence-first brand governance workflow.

## Run locally
1. Extract this ZIP and open the `TruthLayer_AI_Round2` folder in VS Code.
2. Open a terminal in that folder.
3. Run `npm.cmd install`, then `npm.cmd run dev` (Windows PowerShell). On macOS/Linux use `npm install` and `npm run dev`.
4. Open the local URL Vite prints, usually `http://localhost:5173`.

## Add RiRi's 3D model
Copy your GLB to `public/models/help-buddy.glb`. Keep that exact filename. Until the model is added, a simple placeholder appears.

## Included
- Three-step onboarding and RiRi dialogue cloud
- Evidence Desk with starter records, metrics, search and status filtering
- New claim investigation / founder interview form
- Evidence register with title, URL, notes, and support/contradiction/context tags
- Known / Assumed / Unknown audit
- Brand DNA canvas
- Three strategic direction choices
- Four-lens Brand Court notes (customer, skeptic, strategist, operator)
- Human review decision and printable report
- Browser-local persistence, responsive layout, and warm cream / forest / sage / olive / rust palette

## Honest limitations
TruthLayer AI uses Gemini for AI-assisted claim analysis through its backend. Evidence entered by users is assessed using the information available to the system; source URLs are not independently fetched and validated automatically. AI-generated assessments may contain errors and do not constitute legal advice or definitive proof of compliance. Investigation records are stored in the current browser and are not synchronised across devices. Human review is required before making compliance decisions.
