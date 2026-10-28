import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# Load environment variables from backend/.env
load_dotenv(Path(__file__).resolve().parent / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("truthlayer")

app = FastAPI(
    title="TruthLayer AI API",
    description="Evidence-first brand claim investigation and hypothetical scenario analysis",
    version="0.4.0",
)

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")


class ClaimRequest(BaseModel):
    claim: str = Field(min_length=5, max_length=3000)
    category: str = Field(default="Other", max_length=100)


class ClaimAnalysis(BaseModel):
    plain_language_meaning: str
    risk_flags: list[str]
    known_from_claim: list[str]
    assumptions_to_test: list[str]
    evidence_gaps: list[str]
    recommended_next_steps: list[str]
    uncertainty_note: str


class SimulationEvidence(BaseModel):
    title: str = Field(default="", max_length=300)
    stance: str = Field(default="Context", max_length=30)
    publisher: str = Field(default="", max_length=300)
    publication_date: str = Field(default="", max_length=40)
    excerpt: str = Field(default="", max_length=3000)
    note: str = Field(default="", max_length=2000)


class SimulationRequest(BaseModel):
    claim: str = Field(min_length=5, max_length=3000)
    category: str = Field(default="Other", max_length=100)
    scenario: str = Field(min_length=5, max_length=2000)
    known: str = Field(default="", max_length=3000)
    assumed: str = Field(default="", max_length=3000)
    unknown: str = Field(default="", max_length=3000)
    evidence: list[SimulationEvidence] = Field(default_factory=list, max_length=30)
    permission_status: str = Field(default="Not assessed", max_length=100)
    evidence_status: str = Field(default="Unverified", max_length=100)
    review_decision: str = Field(default="No human review decision recorded", max_length=300)


class SimulationResult(BaseModel):
    scenario_summary: str
    what_changes: list[str]
    affected_assumptions: list[str]
    possible_consequences: list[str]
    evidence_needed: list[str]
    reassessment_recommendation: str
    confidence_limit: str


def get_client_or_raise():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI is not configured. Check backend/.env.",
        )
    return genai.Client(api_key=api_key)


@app.get("/")
def root():
    return {
        "name": "TruthLayer AI API",
        "message": "Backend is running.",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "truthlayer-api",
    }


@app.get("/api/ai/status")
def ai_status():
    configured = bool(os.getenv("GEMINI_API_KEY", "").strip())
    return {
        "configured": configured,
        "provider": "gemini",
        "model": MODEL_NAME,
        "message": "API key detected." if configured else "Gemini API key has not been configured.",
    }


@app.post("/api/ai/analyze", response_model=ClaimAnalysis)
def analyze_claim(request: ClaimRequest):
    client = get_client_or_raise()
    prompt = f"""
You are the claim-analysis assistant for TruthLayer AI.

Analyse the submitted brand claim as a preliminary review, not a verdict.
Do not invent studies, sources, certifications, measurements, or facts.
The claim text alone is not proof that it is true. Identify absolute or ambiguous wording,
assumptions, and evidence gaps. Recommend specific evidence that a human reviewer should request.
Do not claim to have browsed the web or independently verified anything.
Use concise, clear language.

Category: {request.category}
Claim: {request.claim}
"""
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ClaimAnalysis,
                temperature=0.2,
                max_output_tokens=1200,
            ),
        )
        if not response.text:
            raise HTTPException(status_code=502, detail="The AI provider returned an empty response.")
        return ClaimAnalysis.model_validate_json(response.text)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Gemini analysis failed (%s): %s", type(exc).__name__, str(exc))
        raise HTTPException(
            status_code=502,
            detail="AI analysis failed. Check the backend terminal for the provider error.",
        ) from None


@app.post("/api/ai/simulate", response_model=SimulationResult)
def simulate_reality(request: SimulationRequest):
    """Explore a hypothetical scenario without changing saved assessments or decisions."""
    client = get_client_or_raise()

    evidence_summary = [
        {
            "title": item.title,
            "stance": item.stance,
            "publisher": item.publisher,
            "publication_date": item.publication_date,
            "excerpt": item.excerpt,
            "note": item.note,
        }
        for item in request.evidence
    ]

    prompt = f"""
You are TruthLayer AI's Reality Simulator. You are running a HYPOTHETICAL stress test,
not fact-checking or browsing the web.

Task:
Explain how the claim's assessment might need to change IF the user's scenario were true.
Treat the scenario as an assumption for the simulation, not as an established fact.
Use only the provided claim, notes, evidence metadata, and scenario. Do not invent sources,
data, events, or relationships. If a conclusion depends on missing information, say so.
Do not turn missing evidence into proof that the claim is false. Do not assign a new factual
verdict or a numeric probability. Do not change the existing permission/evidence statuses or
human decision. Recommend reassessment rather than automatic approval/rejection.

Return concise, actionable items in each schema field:
- scenario_summary: one-sentence description of the hypothetical being tested.
- what_changes: what would change in the analysis if the scenario were true.
- affected_assumptions: assumptions or scope boundaries affected.
- possible_consequences: plausible implications, explicitly conditional on the scenario.
- evidence_needed: specific evidence needed to resolve the uncertainty.
- reassessment_recommendation: what a human reviewer should do next.
- confidence_limit: explain why this is hypothetical and what is not verified.

Claim: {request.claim}
Category: {request.category}
Hypothetical scenario: {request.scenario}
Known notes: {request.known or 'None supplied'}
Assumed notes: {request.assumed or 'None supplied'}
Unknowns / open questions: {request.unknown or 'None supplied'}
Evidence register (user supplied, not independently verified): {evidence_summary}
Current permission assessment: {request.permission_status}
Current evidence assessment: {request.evidence_status}
Current human review decision: {request.review_decision}
"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SimulationResult,
                temperature=0.2,
                max_output_tokens=1800,
            ),
        )
        if not response.text:
            raise HTTPException(status_code=502, detail="The AI provider returned an empty simulation response.")
        return SimulationResult.model_validate_json(response.text)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Gemini simulation failed (%s): %s", type(exc).__name__, str(exc))
        raise HTTPException(
            status_code=502,
            detail="Reality simulation failed. Check the backend terminal for the provider error.",
        ) from None
