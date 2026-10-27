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
This is a local prototype. It does not yet call Gemini or another AI model, independently fetch or validate source URLs, or automatically verify claims. User-entered evidence is marked unverified. Records are stored in the current browser only, not shared across devices. Add a backend, secure server-side API key handling, evidence retrieval and model-based analysis before presenting this as an automated verification system.

Palette: paper `#F4F0E6`, forest `#172B27`, sage `#E4E5D5`, olive `#C6D46B`, rust `#C45B42`.
