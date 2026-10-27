
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck,
  BookOpen, Check, ChevronDown, CircleHelp, FileSearch, FileText,
  Filter, FlaskConical, FolderOpen, Gauge, Leaf, Menu, Plus,
  Search, ShieldCheck, Share2, Sparkles, X
} from "lucide-react";
import OnboardingGuide from "./components/OnboardingGuide";
import HelpBuddy3D from "./components/HelpBuddy3D";
import ClaimIntelligenceGraph from "./components/ClaimIntelligenceGraph";
import "./RealitySimulator.css";
import "./IntroductionPolish.css";

type Status = "Draft" | "Needs evidence" | "In review" | "Reviewed";
type Evidence = {
  id: string;
  title: string;
  url: string;
  note: string;
  stance: "Supports" | "Contradicts" | "Context";
  publisher?: string;
  publicationDate?: string;
  excerpt?: string;
};
type PermissionStatus =
  | "Not assessed"
  | "Permitted"
  | "Restricted"
  | "Not permitted"
  | "Criteria needed";

type EvidenceStatus = "Supported" | "Contradicted" | "Unverified" | "Ambiguous";

type RecordItem = {
  id: string;
  name: string;
  claim: string;
  category: string;
  status: Status;
  createdAt: string;
  evidence: Evidence[];
  decision: string;
  notes: string;
  known: string;
  assumed: string;
  unknown: string;
  // Independent governance assessments; these are not automatically verified.
  permissionStatus?: PermissionStatus;
  permissionCriteria?: string;
  evidenceStatus?: EvidenceStatus;
  assessmentNotes?: string;
  assessmentEvidenceIds?: string[];
};
type View =
  | "dashboard" | "investigations" | "interview"
  | "branddna" | "directions" | "court" | "report" | "simulator" | "graph";

type AIAnalysis = {
  plain_language_meaning: string;
  risk_flags: string[];
  known_from_claim: string[];
  assumptions_to_test: string[];
  evidence_gaps: string[];
  recommended_next_steps: string[];
  uncertainty_note: string;
};

type SimulationResult = {
  scenario_summary: string;
  what_changes: string[];
  affected_assumptions: string[];
  possible_consequences: string[];
  evidence_needed: string[];
  reassessment_recommendation: string;
  confidence_limit: string;
};

const API_BASE = "http://127.0.0.1:8000";

const seed: RecordItem[] = [
  {
    id: "TL-0241",
    name: "Compostable packaging claim",
    claim: "Our packaging is 100% biodegradable.",
    category: "Environment",
    status: "Needs evidence",
    createdAt: "Today",
    evidence: [],
    decision: "",
    notes: "",
    known: "The packaging material and its composition need to be documented.",
    assumed: "Customers may interpret biodegradable as breaking down in any environment.",
    unknown: "Timeframe, conditions, certification, and disposal infrastructure."
  },
  {
    id: "TL-0238",
    name: "Ethical sourcing statement",
    claim: "All our ingredients are ethically sourced.",
    category: "Sourcing",
    status: "Draft",
    createdAt: "Yesterday",
    evidence: [],
    decision: "",
    notes: "",
    known: "The brand intends to communicate sourcing standards.",
    assumed: "All suppliers currently meet a consistent standard.",
    unknown: "Supplier coverage, audit frequency, traceability and exceptions."
  },
  {
    id: "TL-0229",
    name: "Carbon neutral delivery",
    claim: "Every delivery we make is carbon neutral.",
    category: "Climate",
    status: "In review",
    createdAt: "24 Oct",
    evidence: [],
    decision: "",
    notes: "Need to distinguish measured emissions from offsets.",
    known: "The claim concerns delivery-related emissions.",
    assumed: "Offsets cover all relevant delivery emissions.",
    unknown: "Scope, methodology, verification, and offset quality."
  }
];

const statusClass: Record<Status, string> = {
  Draft: "draft",
  "Needs evidence": "needs-evidence",
  "In review": "in-review",
  Reviewed: "reviewed"
};

function loadRecords(): RecordItem[] {
  try {
    const stored = localStorage.getItem("truthlayer-round2-records");
    if (stored) {
      const parsed = JSON.parse(stored) as RecordItem[];
      return parsed.map((record): RecordItem => ({
        ...record,
        permissionStatus: record.permissionStatus ?? "Not assessed",
        permissionCriteria: record.permissionCriteria ?? "",
        evidenceStatus: record.evidenceStatus ?? "Unverified",
        assessmentNotes: record.assessmentNotes ?? "",
        assessmentEvidenceIds: record.assessmentEvidenceIds ?? [],
      }));
    }
  } catch {
    // Fall back to the starter records if browser storage is unavailable.
  }
  return seed.map((record): RecordItem => ({
    ...record,
    permissionStatus: "Not assessed",
    permissionCriteria: "",
    evidenceStatus: "Unverified",
    assessmentNotes: "",
    assessmentEvidenceIds: [],
  }));
}

function makeId() {
  return `TL-${String(Date.now()).slice(-6)}`;
}

const analysisSections: {
  key: keyof Pick<
    AIAnalysis,
    | "risk_flags"
    | "known_from_claim"
    | "assumptions_to_test"
    | "evidence_gaps"
    | "recommended_next_steps"
  >;
  title: string;
}[] = [
  { key: "risk_flags", title: "Risk flags" },
  { key: "known_from_claim", title: "Known from the claim" },
  { key: "assumptions_to_test", title: "Assumptions to test" },
  { key: "evidence_gaps", title: "Evidence gaps" },
  { key: "recommended_next_steps", title: "Recommended next steps" }
];

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("truthlayer-onboarding-done")
  );
  const [records, setRecords] = useState<RecordItem[]>(loadRecords);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState("");

  const [claim, setClaim] = useState("");
  const [recordName, setRecordName] = useState("");
  const [category, setCategory] = useState("Environment");

  const [eTitle, setETitle] = useState("");
  const [eUrl, setEUrl] = useState("");
  const [eNote, setENote] = useState("");
  const [ePublisher, setEPublisher] = useState("");
  const [ePublicationDate, setEPublicationDate] = useState("");
  const [eExcerpt, setEExcerpt] = useState("");
  const [eStance, setEStance] = useState<Evidence["stance"]>("Supports");

  const [reviewDecision, setReviewDecision] = useState("");
  const [interview, setInterview] = useState({
    customer: "",
    problem: "",
    alternative: "",
    differentiator: "",
    proof: ""
  });
  const [dna, setDna] = useState({
    purpose: "",
    audience: "",
    promise: "",
    values: ""
  });
  const [direction, setDirection] = useState("Evidence-led");
  const [court, setCourt] = useState({
    customer: "",
    skeptic: "",
    strategist: "",
    operator: ""
  });

  // Real AI analysis state.
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Reality Simulator: scenarios are hypothetical and do not overwrite assessments.
  const [simulationScenario, setSimulationScenario] = useState("The evidence currently linked to this claim becomes unavailable.");
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState("");
  const [simulationRecordId, setSimulationRecordId] = useState<string>("");

  useEffect(() => {
    try {
      localStorage.setItem("truthlayer-round2-records", JSON.stringify(records));
    } catch {
      setNotice("Browser storage is unavailable. Changes may not persist.");
    }
  }, [records]);

  const active = records.find((record) => record.id === activeId) ?? null;

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const query = search.toLowerCase().trim();
      const matchesQuery =
        !query ||
        `${record.id} ${record.name} ${record.claim} ${record.category}`
          .toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === "All statuses" || record.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [records, search, statusFilter]);

  const update = (patch: Partial<RecordItem>) => {
    if (!active) return;

    setRecords((all) =>
      all.map((record) =>
        record.id === active.id ? { ...record, ...patch } : record
      )
    );
  };

  const nav = (nextView: View) => {
    setView(nextView);
    setMobileNav(false);
    setNotice("");
  };

  const startNew = () => {
    setClaim("");
    setRecordName("");
    setCategory("Environment");
    setActiveId(null);
    setAiAnalysis(null);
    setAiError("");
    nav("interview");
  };

  const create = () => {
    if (!claim.trim()) {
      setNotice("Enter the exact claim before creating an investigation.");
      return;
    }

    const item: RecordItem = {
      id: makeId(),
      name: recordName.trim() || claim.trim().slice(0, 48),
      claim: claim.trim(),
      category,
      status: "Needs evidence",
      createdAt: new Date().toLocaleDateString(),
      evidence: [],
      decision: "",
      notes: "",
      known: "",
      assumed: "",
      unknown: "",
      permissionStatus: "Not assessed",
      permissionCriteria: "",
      evidenceStatus: "Unverified",
      assessmentNotes: "",
      assessmentEvidenceIds: []
    };

    setRecords((all) => [item, ...all]);
    setActiveId(item.id);
    setAiAnalysis(null);
    setAiError("");
    nav("report");
    setNotice("Investigation created. Add sources and separate facts from assumptions.");
  };

  const openRecord = (recordId: string) => {
    setActiveId(recordId);
    setReviewDecision("");
    setAiAnalysis(null);
    setAiError("");
    nav("report");
  };

  const addEvidence = () => {
    if (!active) return;

    if (!eTitle.trim() && !eUrl.trim() && !eNote.trim() && !eExcerpt.trim()) {
      setNotice("Add a source title, URL, excerpt, or evidence note first.");
      return;
    }

    const evidence: Evidence = {
      id: makeId(),
      title: eTitle.trim() || "Untitled source",
      url: eUrl.trim(),
      note: eNote.trim(),
      stance: eStance,
      publisher: ePublisher.trim() || undefined,
      publicationDate: ePublicationDate || undefined,
      excerpt: eExcerpt.trim() || undefined
    };

    update({
      evidence: [...active.evidence, evidence],
      status: "In review"
    });

    setETitle("");
    setEUrl("");
    setENote("");
    setEPublisher("");
    setEPublicationDate("");
    setEExcerpt("");
    setEStance("Supports");
    setNotice("Evidence item added. Source details have not been independently verified.");
  };

  // Calls the real FastAPI + Gemini endpoint.
  const analyzeClaim = async () => {
    if (!active) return;

    setAiLoading(true);
    setAiError("");
    setAiAnalysis(null);

    try {
      const response = await fetch(`${API_BASE}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim: active.claim,
          category: active.category
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Analysis failed with status ${response.status}.`
        );
      }

      setAiAnalysis(data as AIAnalysis);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Could not connect to the AI service. Check that the backend is running."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const runSimulation = async () => {
    const target = records.find((record) => record.id === simulationRecordId) ?? active;
    if (!target) {
      setSimulationError("Choose an investigation to simulate first.");
      return;
    }
    if (!simulationScenario.trim()) {
      setSimulationError("Describe the hypothetical change you want to test.");
      return;
    }

    setSimulationLoading(true);
    setSimulationError("");
    setSimulationResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/ai/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim: target.claim,
          category: target.category,
          scenario: simulationScenario.trim(),
          known: target.known,
          assumed: target.assumed,
          unknown: target.unknown,
          evidence: target.evidence.map((item) => ({
            title: item.title,
            stance: item.stance,
            publisher: item.publisher ?? "",
            publication_date: item.publicationDate ?? "",
            excerpt: item.excerpt ?? "",
            note: item.note,
          })),
          permission_status: target.permissionStatus ?? "Not assessed",
          evidence_status: target.evidenceStatus ?? "Unverified",
          review_decision: target.decision || "No human review decision recorded",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : `Simulation failed with status ${response.status}.`);
      }
      setSimulationResult(data as SimulationResult);
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Could not connect to the AI service. Check that the backend is running.");
    } finally {
      setSimulationLoading(false);
    }
  };

  const finish = () => {
    setShowOnboarding(false);
    try {
      localStorage.setItem("truthlayer-onboarding-done", "yes");
    } catch {
      // The introduction can still be closed for this session.
    }
  };

  if (showOnboarding) {
    return <OnboardingGuide onComplete={finish} />;
  }

  const needs = records.filter((r) => r.status === "Needs evidence").length;
  const inReview = records.filter((r) => r.status === "In review").length;
  const reviewed = records.filter((r) => r.status === "Reviewed").length;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <button className="brand-lockup" onClick={() => nav("dashboard")}>
          <span className="brand-name">TRUTHLAYER <b>AI</b></span>
          <span className="brand-subtitle">BRAND GOVERNANCE SYSTEM</span>
        </button>

        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav">
          <NavButton active={view === "dashboard"} icon={<Gauge size={17} />} onClick={() => nav("dashboard")}>
            Overview
          </NavButton>
          <NavButton active={view === "investigations"} icon={<FolderOpen size={17} />} onClick={() => nav("investigations")}>
            Investigations <span className="nav-count">{records.length}</span>
          </NavButton>

          <div className="nav-label nav-label-spaced">BRAND INTELLIGENCE</div>
          <NavButton active={view === "interview"} icon={<Sparkles size={17} />} onClick={startNew}>
            Founder interview
          </NavButton>
          <NavButton active={view === "branddna"} icon={<Leaf size={17} />} onClick={() => nav("branddna")}>
            Brand DNA
          </NavButton>
          <NavButton active={view === "directions"} icon={<ArrowUpRight size={17} />} onClick={() => nav("directions")}>
            Strategic directions
          </NavButton>
          <NavButton active={view === "court"} icon={<ShieldCheck size={17} />} onClick={() => nav("court")}>
            Brand Court
          </NavButton>
          <NavButton active={view === "simulator"} icon={<FlaskConical size={17} />} onClick={() => {
            setSimulationRecordId(activeId ?? records[0]?.id ?? "");
            setSimulationResult(null);
            setSimulationError("");
            nav("simulator");
          }}>
            Reality Simulator
          </NavButton>
          <NavButton active={view === "graph"} icon={<Activity size={17} />} onClick={() => nav("graph")}>
            Claim Intelligence Graph
          </NavButton>
        </nav>

        <div className="sidebar-bottom">
          <div className="privacy-note">
            <span className="online-dot" />
            LOCAL PROTOTYPE
            <p>Records are saved in this browser. AI claim analysis is connected to the backend.</p>
          </div>
          <button className="nav-link" onClick={() => setShowOnboarding(true)}>
            <CircleHelp size={17} /> Replay introduction
          </button>
          <div className="sidebar-footer">TRUTHLAYER / ROUND 02</div>
        </div>
      </aside>

      {mobileNav && (
        <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />
      )}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav((v) => !v)} aria-label="Toggle menu">
            <Menu size={20} />
          </button>
          <div className="crumb">
            TRUTHLAYER <span>/</span> {active ? active.id : view.replace("-", " ").toUpperCase()}
          </div>
          <div className="topbar-right">
            <span className="topbar-status"><span className="online-dot" /> EVIDENCE FIRST</span>
            <div className="user-mark">TL</div>
          </div>
        </header>

        <div className="page-content">
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )}

          {(view === "dashboard" || view === "investigations") && (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">
                    {view === "dashboard" ? "YOUR BRAND. UNDER SCRUTINY." : "REGISTER / ALL RECORDS"}
                  </p>
                  <h1>
                    {view === "dashboard" ? <>The evidence desk<span className="rust-dot">.</span></> : <>Investigations<span className="rust-dot">.</span></>}
                  </h1>
                  <p className="intro-copy">
                    A decision is only as strong as the evidence behind it. Examine what a claim says, what supports it, and what still needs to be established.
                  </p>
                </div>
                <button className="primary-button" onClick={startNew}>
                  <Plus size={16} /> New investigation
                </button>
              </section>

              {view === "dashboard" && (
                <>
                  <section className="principle-banner">
                    <div>
                      <span className="micro-label">THE TRUTHLAYER PRINCIPLE</span>
                      <p>A credible-sounding claim is not the same as a claim supported by evidence.</p>
                    </div>
                    <div className="banner-mark">T<span>.</span></div>
                  </section>
                  <section className="metric-grid">
                    <Metric label="TOTAL INVESTIGATIONS" value={records.length} detail="Saved records" icon={<FileSearch size={17} />} />
                    <Metric label="IN REVIEW" value={inReview} detail="Evidence being assembled" icon={<Activity size={17} />} />
                    <Metric label="NEEDS EVIDENCE" value={needs} detail="Outstanding evidence" icon={<FlaskConical size={17} />} />
                    <Metric label="REVIEWED" value={reviewed} detail="Human decision recorded" icon={<BadgeCheck size={17} />} />
                  </section>
                </>
              )}

              {view === "investigations" && (
                <div className="table-tools">
                  <label className="search-box">
                    <Search size={17} />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search claims, IDs, categories..." />
                  </label>
                  <label className="filter-select">
                    <Filter size={15} />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option>All statuses</option>
                      <option>Draft</option>
                      <option>Needs evidence</option>
                      <option>In review</option>
                      <option>Reviewed</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>
              )}

              <InvestigationTable
                records={view === "dashboard" ? records.slice(0, 5) : filtered}
                onOpen={openRecord}
                onViewAll={view === "dashboard" ? () => nav("investigations") : undefined}
              />

              {view === "dashboard" && (
                <section className="workflow-strip">
                  <div>
                    <span className="micro-label">THE WORKFLOW</span>
                    <h2>From assumption to accountable decision.</h2>
                  </div>
                  <div className="workflow-steps">
                    <span>01 / CLAIM</span><ArrowRight size={14} />
                    <span>02 / EVIDENCE</span><ArrowRight size={14} />
                    <span>03 / REVIEW</span>
                  </div>
                </section>
              )}

              {view === "dashboard" && (
                <section className="intro-tools-section" aria-labelledby="intro-tools-title">
                  <div className="intro-tools-heading">
                    <div>
                      <span className="micro-label">GO BEYOND THE RECORD</span>
                      <h2 id="intro-tools-title">Two ways to examine a claim.</h2>
                    </div>
                    <p>Trace the relationships behind an assessment, then test how your reasoning holds up when a condition changes.</p>
                  </div>
                  <div className="intro-tools-grid">
                    <article className="intro-tool-card intro-tool-graph">
                      <div className="intro-tool-topline"><span className="intro-tool-icon"><Share2 size={19} /></span><span className="intro-tool-kicker">01 / MAP THE EVIDENCE</span></div>
                      <h3>Claim Intelligence Graph<span className="rust-dot">.</span></h3>
                      <p>See how the exact claim connects to recorded evidence, assumptions, permission and evidence assessments, and the human review decision. Select a node to inspect its context and limitations.</p>
                      <button type="button" className="intro-tool-link" onClick={() => nav("graph")}>Explore claim connections <ArrowUpRight size={16} /></button>
                      <div className="intro-tool-visual graph-mini" aria-hidden="true"><span className="graph-mini-node graph-mini-main">CLAIM</span><i /><i /><i /><span className="graph-mini-node graph-mini-a">EVIDENCE</span><span className="graph-mini-node graph-mini-b">ASSUMPTIONS</span><span className="graph-mini-node graph-mini-c">REVIEW</span></div>
                    </article>
                    <article className="intro-tool-card intro-tool-simulator">
                      <div className="intro-tool-topline"><span className="intro-tool-icon"><FlaskConical size={19} /></span><span className="intro-tool-kicker">02 / TEST A SCENARIO</span></div>
                      <h3>Reality Simulator<span className="rust-dot">.</span></h3>
                      <p>Change one hypothetical condition — such as missing evidence, narrower scope, or contrary information — and explore what may need reassessment, without changing the saved record or human decision.</p>
                      <button type="button" className="intro-tool-link" onClick={() => nav("simulator")}>Run a what-if scenario <ArrowUpRight size={16} /></button>
                      <div className="intro-tool-visual simulator-mini" aria-hidden="true"><span>BASELINE</span><b>→</b><span className="simulator-mini-highlight">WHAT IF?</span><b>→</b><span>REASSESS</span><div className="simulator-mini-track" /></div>
                    </article>
                  </div>
                  <p className="intro-tools-note"><ShieldCheck size={14} /> These tools support human review. Graph relationships reflect recorded information; simulations are hypothetical, not verdicts.</p>
                </section>
              )}
            </>
          )}

          {view === "interview" && (
            <section className="form-page">
              <Back onClick={() => nav("dashboard")} />
              <p className="eyebrow">STAGE 01 / FOUNDER INTERVIEW</p>
              <h1>Start with the story.<br /><em>Test the assumptions.</em></h1>
              <p className="intro-copy wide-copy">Capture the idea in the founder's own words before shaping a brand around it.</p>

              <div className="form-card">
                <div className="form-section-title">
                  <span>01</span><div><h2>The claim</h2><p>What do you want the world to believe?</p></div>
                </div>

                <label>Investigation name
                  <input value={recordName} onChange={(e) => setRecordName(e.target.value)} placeholder="e.g. Low-impact daily essentials" />
                </label>
                <label>Claim category
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {["Environment", "Packaging", "Climate", "Sourcing", "Social impact", "Product performance", "Other"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>Exact claim to investigate <span className="required">*</span>
                  <textarea rows={4} value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Write the exact wording. Avoid paraphrasing the claim." />
                </label>
                <div className="form-help"><CircleHelp size={15} /> Keep the original wording. Specific, bounded claims are easier to investigate.</div>

                <div className="form-section-title section-spaced">
                  <span>02</span><div><h2>Founder context</h2><p>What is the idea based on?</p></div>
                </div>
                <div className="two-col">
                  <label>Who is this for?
                    <textarea rows={2} value={interview.customer} onChange={(e) => setInterview({ ...interview, customer: e.target.value })} placeholder="Primary audience and need" />
                  </label>
                  <label>What problem are you solving?
                    <textarea rows={2} value={interview.problem} onChange={(e) => setInterview({ ...interview, problem: e.target.value })} placeholder="Problem as understood today" />
                  </label>
                  <label>What do people use instead?
                    <textarea rows={2} value={interview.alternative} onChange={(e) => setInterview({ ...interview, alternative: e.target.value })} placeholder="Current alternatives" />
                  </label>
                  <label>What makes this different?
                    <textarea rows={2} value={interview.differentiator} onChange={(e) => setInterview({ ...interview, differentiator: e.target.value })} placeholder="Differentiator, not a slogan" />
                  </label>
                </div>
                <label>What evidence do you already have?
                  <textarea rows={3} value={interview.proof} onChange={(e) => setInterview({ ...interview, proof: e.target.value })} placeholder="Studies, customer data, certifications, supplier records, or none yet" />
                </label>
                <div className="form-actions">
                  <button className="secondary-button" onClick={() => nav("dashboard")}>Cancel</button>
                  <button className="primary-button" onClick={create}>Create investigation <ArrowRight size={15} /></button>
                </div>
              </div>
            </section>
          )}

          {view === "branddna" && (
            <section className="form-page">
              <p className="eyebrow">STAGE 02 / BRAND DNA</p>
              <h1>Build from what is<br /><em>actually known.</em></h1>
              <p className="intro-copy wide-copy">Record a strategic foundation. Keep documented facts separate from founder beliefs and unanswered questions.</p>
              <div className="dna-grid">
                {([
                  ["01", "Purpose", "Why should this brand exist?", "purpose"],
                  ["02", "Audience", "Who has the problem?", "audience"],
                  ["03", "Promise", "What can the brand credibly promise?", "promise"],
                  ["04", "Values in practice", "What observable behaviours prove the values?", "values"]
                ] as const).map(([n, title, description, key]) => (
                  <label className="dna-field" key={key}>
                    <span className="dna-number">{n}</span><h2>{title}</h2><p>{description}</p>
                    <textarea rows={4} value={dna[key]} onChange={(e) => setDna({ ...dna, [key]: e.target.value })} placeholder="Record the current thinking..." />
                  </label>
                ))}
              </div>
              <div className="callout">
                <BookOpen size={18} />
                <p><strong>Evidence-derived, not AI-invented.</strong><br />These fields are a working canvas. They are not automatically verified by the AI claim-analysis service.</p>
              </div>
              <button className="primary-button" onClick={() => {
                try { localStorage.setItem("truthlayer-brand-dna", JSON.stringify(dna)); } catch {}
                setNotice("Brand DNA saved in this browser.");
              }}>Save Brand DNA <Check size={15} /></button>
            </section>
          )}

          {view === "directions" && (
            <section className="form-page">
              <p className="eyebrow">STAGE 03 / STRATEGIC DIRECTIONS</p>
              <h1>Three paths.<br /><em>Different trade-offs.</em></h1>
              <p className="intro-copy wide-copy">Explore strategic directions as hypotheses, not generated truths. Select a direction to carry into Brand Court.</p>
              <div className="direction-grid">
                {[
                  { title: "Evidence-led", tag: "LOWER CLAIM RISK", desc: "Lead with transparent proof, clear limits, and specific measurable benefits.", trade: "May feel less emotionally bold until the evidence base grows." },
                  { title: "Community-led", tag: "RELATIONSHIP FIRST", desc: "Build credibility through participation, supplier stories, and visible accountability.", trade: "Requires genuine participation; stories alone are not proof." },
                  { title: "Performance-led", tag: "PRODUCT FIRST", desc: "Lead with demonstrated product utility and substantiate sustainability claims separately.", trade: "Needs robust comparisons and transparent methodology." }
                ].map((item) => (
                  <button key={item.title} className={`direction-card ${direction === item.title ? "direction-selected" : ""}`} onClick={() => setDirection(item.title)}>
                    <span className="micro-label">{item.tag}</span><h2>{item.title}</h2><p>{item.desc}</p>
                    <div className="tradeoff"><span>TRADE-OFF</span><p>{item.trade}</p></div>
                    <span className="direction-select">{direction === item.title ? <><Check size={15} /> Selected</> : <>Select direction <ArrowRight size={14} /></>}</span>
                  </button>
                ))}
              </div>
              <button className="primary-button" onClick={() => nav("court")}>Take direction to Brand Court <ArrowRight size={15} /></button>
            </section>
          )}

          {view === "court" && (
            <section className="form-page">
              <p className="eyebrow">STAGE 04 / BRAND COURT</p>
              <h1>Put the strategy<br /><em>on trial.</em></h1>
              <p className="intro-copy wide-copy">Four perspectives stress-test the selected direction. These are review prompts, not autonomous personas or customer research.</p>
              <div className="court-direction">
                <span className="micro-label">SELECTED DIRECTION</span><strong>{direction}</strong>
                <button className="text-action" onClick={() => nav("directions")}>Change direction <ArrowRight size={13} /></button>
              </div>
              <div className="court-grid">
                {([
                  { key: "customer", n: "01", title: "The Customer", question: "Would a customer understand and value this promise?", hint: "Clarity, relevance, trust and likely interpretation." },
                  { key: "skeptic", n: "02", title: "The Skeptic", question: "What could be misleading or unsupported?", hint: "Counter-evidence, missing context, absolutes and greenwashing risk." },
                  { key: "strategist", n: "03", title: "The Strategist", question: "Is this direction distinctive and coherent?", hint: "Positioning, differentiation, focus and consistency." },
                  { key: "operator", n: "04", title: "The Operator", question: "Can the team deliver and prove this promise?", hint: "Cost, process, ownership, measurement and implementation." }
                ] as const).map((item) => (
                  <div className="court-card" key={item.key}>
                    <span className="court-number">{item.n} / REVIEW LENS</span><h2>{item.title}</h2>
                    <p className="court-question">{item.question}</p><p className="court-hint">{item.hint}</p>
                    <textarea rows={3} value={court[item.key]} onChange={(e) => setCourt({ ...court, [item.key]: e.target.value })} placeholder="Record your critique..." />
                  </div>
                ))}
              </div>
              <div className="form-card decision-card">
                <p className="eyebrow">FOUNDER DECISION</p><h2>What happens next?</h2>
                <p className="muted-copy">Record a human decision after considering the four perspectives.</p>
                <div className="decision-actions">
                  <button className="secondary-button" onClick={() => setNotice("Direction defended. Record the rationale in your Brand Court notes.")}>Defend direction</button>
                  <button className="secondary-button" onClick={() => nav("directions")}>Reopen direction</button>
                  <button className="primary-button" onClick={() => {
                    try { localStorage.setItem("truthlayer-court-notes", JSON.stringify(court)); } catch {}
                    nav(active ? "report" : "dashboard");
                  }}>Continue <ArrowRight size={15} /></button>
                </div>
              </div>
            </section>
          )}

          {view === "graph" && (
            <section className="claim-graph-page">
              <div className="page-heading graph-page-heading">
                <div>
                  <p className="eyebrow">TRUTHLAYER / CLAIM INTELLIGENCE</p>
                  <h1>See how the claim connects<span className="rust-dot">.</span></h1>
                  <p className="intro-copy">Explore the relationship between the exact claim, recorded evidence, assumptions, independent assessments, and the human review decision.</p>
                </div>
                <button className="secondary-button" onClick={() => active ? nav("report") : nav("investigations")}>
                  <FileText size={15} /> Open investigation record
                </button>
              </div>
              <ClaimIntelligenceGraph records={records} selectedRecordId={activeId} onSelectRecord={setActiveId} />
            </section>
          )}

          {view === "simulator" && (
            <section className="simulator-page">
              <div className="simulator-hero">
                <div>
                  <p className="eyebrow">TRUTHLAYER / REALITY SIMULATOR</p>
                  <h1>Stress-test the story.<br /><em>Before you trust it.</em></h1>
                  <p className="intro-copy wide-copy">Change one assumption, evidence condition, or definition and explore how the claim may need to be reassessed. Scenarios are hypothetical; they never overwrite your investigation or human decision.</p>
                </div>
                <div className="simulator-buddy-visual" aria-label="TruthLayer 3D assistant"><HelpBuddy3D /></div>
              </div>

              <div className="simulator-layout">
                <div className="simulator-controls form-card">
                  <div className="form-section-title"><span>01</span><div><h2>Choose an investigation</h2><p>Use an existing TruthLayer record.</p></div></div>
                  <label>Investigation
                    <select value={simulationRecordId} onChange={(e) => { setSimulationRecordId(e.target.value); setSimulationResult(null); setSimulationError(""); }}>
                      <option value="">Select an investigation</option>
                      {records.map((record) => <option value={record.id} key={record.id}>{record.id} · {record.name}</option>)}
                    </select>
                  </label>
                  {(() => {
                    const target = records.find((record) => record.id === simulationRecordId);
                    if (!target) return <div className="simulator-claim-preview"><strong>No investigation selected</strong><p>Select a record above, or create one in the workspace first.</p></div>;
                    return <div className="simulator-claim-preview"><span className="micro-label">CLAIM UNDER TEST · {target.id}</span><blockquote>“{target.claim}”</blockquote><div className="simulator-status-row"><span>Evidence: {target.evidenceStatus ?? "Unverified"}</span><span>Permission: {target.permissionStatus ?? "Not assessed"}</span></div><p>{target.evidence.length} evidence item(s) registered · {target.decision ? "Human decision recorded" : "No human decision recorded"}</p></div>;
                  })()}

                  <div className="form-section-title section-spaced"><span>02</span><div><h2>Change one condition</h2><p>Describe a plausible hypothetical scenario.</p></div></div>
                  <div className="scenario-presets">
                    <button type="button" className="scenario-preset" onClick={() => { setSimulationScenario("The evidence currently linked to this claim becomes unavailable."); setSimulationResult(null); }}>Evidence disappears</button>
                    <button type="button" className="scenario-preset" onClick={() => { setSimulationScenario("The claim's supporting data covers only a small pilot, not the full population implied by the wording."); setSimulationResult(null); }}>Scope narrows</button>
                    <button type="button" className="scenario-preset" onClick={() => { setSimulationScenario("The key metric is defined differently than readers would reasonably understand it."); setSimulationResult(null); }}>Definition changes</button>
                    <button type="button" className="scenario-preset" onClick={() => { setSimulationScenario("A credible source is found that contradicts the claim's central assertion."); setSimulationResult(null); }}>Contrary evidence appears</button>
                  </div>
                  <label>Hypothetical scenario
                    <textarea rows={4} value={simulationScenario} onChange={(e) => { setSimulationScenario(e.target.value); setSimulationResult(null); }} placeholder="What changes in this hypothetical world?" />
                  </label>
                  <div className="simulator-safety-note"><ShieldCheck size={17} /><span>Simulation only. TruthLayer will not mark the claim true or false, change the evidence status, or modify the saved human-review decision.</span></div>
                  {simulationError && <div className="notice" role="alert"><span>{simulationError}</span><button onClick={() => setSimulationError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
                  <button className="primary-button full-button" onClick={runSimulation} disabled={simulationLoading || !simulationRecordId}>
                    <Sparkles size={16} /> {simulationLoading ? "Simulating scenario..." : "Run reality simulation"} <ArrowRight size={15} />
                  </button>
                </div>

                <div className="simulation-output">
                  {!simulationResult && !simulationLoading && (
                    <div className="simulation-empty"><div className="simulation-empty-icon"><FlaskConical size={26} /></div><p className="eyebrow">SCENARIO LAB / OUTPUT</p><h2>What changes if reality changes?</h2><p>Choose an investigation and run a scenario. TruthLayer will outline the assumptions affected, plausible consequences, and evidence needed to reassess the claim.</p><div className="simulation-empty-steps"><span>01 / BASELINE</span><span>02 / WHAT IF</span><span>03 / REASSESS</span></div></div>
                  )}
                  {simulationLoading && <div className="simulation-empty" role="status"><div className="simulation-empty-icon"><Activity size={26} /></div><p className="eyebrow">SCENARIO LAB / PROCESSING</p><h2>Testing the hypothetical...</h2><p>Gemini is reasoning from the investigation details you provided. This is not a source-verification process.</p></div>}
                  {simulationResult && (
                    <div className="simulation-results" aria-live="polite">
                      <div className="simulation-result-heading"><div><p className="eyebrow">SIMULATION COMPLETE / HYPOTHETICAL</p><h2>{simulationResult.scenario_summary}</h2></div><span className="simulation-badge">NOT A VERDICT</span></div>
                      <SimulationList title="What changes" items={simulationResult.what_changes} />
                      <SimulationList title="Assumptions affected" items={simulationResult.affected_assumptions} />
                      <SimulationList title="Possible consequences" items={simulationResult.possible_consequences} />
                      <SimulationList title="Evidence needed next" items={simulationResult.evidence_needed} />
                      <div className="simulation-recommendation"><span className="micro-label">REASSESSMENT RECOMMENDATION</span><p>{simulationResult.reassessment_recommendation}</p></div>
                      <div className="simulation-limit"><strong>Uncertainty and limits</strong><p>{simulationResult.confidence_limit}</p></div>
                      <p className="unverified-note">AI-generated scenario analysis · Hypothetical, not independently verified · Existing assessments remain unchanged</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {view === "report" && active && (
            <section className="report-page">
              <Back onClick={() => nav("investigations")} />
              <div className="report-heading">
                <div>
                  <p className="eyebrow">{active.id} / {active.category.toUpperCase()}</p>
                  <h1>{active.name}<span className="rust-dot">.</span></h1>
                  <p className="intro-copy">Evidence register and review record. AI analysis is preliminary and is not a verification verdict.</p>
                </div>
                <span className={`status-pill ${statusClass[active.status]}`}>{active.status}</span>
              </div>

              <div className="claim-panel">
                <span className="micro-label">CLAIM UNDER REVIEW</span>
                <blockquote>“{active.claim}”</blockquote>
                <span className="claim-footnote"><ShieldCheck size={14} /> Submitted wording · not a verified conclusion</span>
              </div>

              <section className="report-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">GOVERNANCE / TWO INDEPENDENT TESTS</p>
                    <h2>The Permission–Evidence Gap</h2>
                  </div>
                  <ShieldCheck size={20} />
                </div>

                <p className="muted-copy">
                  A claim can meet a wording guideline without being factually substantiated.
                  Evidence for a claim does not automatically mean its wording is permitted.
                  Record each assessment separately.
                </p>

                <div className="assumption-grid">
                  <div className="assumption-field">
                    <span>01 / Permission assessment</span>
                    <small>Is the wording permitted under the specific criteria being applied?</small>
                    <label>
                      Assessment status
                      <select
                        value={active.permissionStatus ?? "Not assessed"}
                        onChange={(e) => update({ permissionStatus: e.target.value as PermissionStatus })}
                      >
                        <option>Not assessed</option>
                        <option>Permitted</option>
                        <option>Restricted</option>
                        <option>Not permitted</option>
                        <option>Criteria needed</option>
                      </select>
                    </label>
                    <label>
                      Policy or review criteria
                      <textarea
                        rows={3}
                        value={active.permissionCriteria ?? ""}
                        onChange={(e) => update({ permissionCriteria: e.target.value })}
                        placeholder="Name the policy, internal guideline, or review criteria. Include the relevant section if known."
                      />
                    </label>
                    <p className="unverified-note">
                      No legal or policy compliance is implied without reviewing the applicable criteria.
                    </p>
                  </div>

                  <div className="assumption-field">
                    <span>02 / Evidence assessment</span>
                    <small>What does the recorded evidence establish about this exact claim?</small>
                    <label>
                      Assessment status
                      <select
                        value={active.evidenceStatus ?? "Unverified"}
                        onChange={(e) => update({ evidenceStatus: e.target.value as EvidenceStatus })}
                      >
                        <option>Supported</option>
                        <option>Contradicted</option>
                        <option>Unverified</option>
                        <option>Ambiguous</option>
                      </select>
                    </label>
                    <p className="muted-copy">
                      Supported: relevant evidence substantiates the claim within its scope. Contradicted:
                      relevant evidence conflicts with it. Unverified: sufficient verification has not been
                      established. Ambiguous: the evidence or claim has multiple plausible interpretations.
                    </p>
                    <div className="linked-evidence-picker">
                      <strong>Evidence linked to this assessment</strong>
                      <small>Select the evidence-register items that informed this status. Linking a source does not independently verify it.</small>
                      {active.evidence.length === 0 ? (
                        <p className="unverified-note">No evidence items are recorded yet. Add a source in the Evidence Register below, then return here to link it.</p>
                      ) : (
                        <div className="linked-evidence-options">
                          {active.evidence.map((item) => {
                            const selected = (active.assessmentEvidenceIds ?? []).includes(item.id);
                            return (
                              <label className="linked-evidence-option" key={item.id}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(e) => {
                                    const current = active.assessmentEvidenceIds ?? [];
                                    const next = e.target.checked
                                      ? [...current, item.id]
                                      : current.filter((id) => id !== item.id);
                                    update({ assessmentEvidenceIds: next });
                                  }}
                                />
                                <span>
                                  <strong>{item.title}</strong>
                                  <small>{item.stance}{item.publisher ? ` · ${item.publisher}` : ""} · {item.id}</small>
                                  {item.excerpt && <small>Excerpt: {item.excerpt}</small>}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {(active.assessmentEvidenceIds ?? []).length > 0 && (
                        <p className="unverified-note">{(active.assessmentEvidenceIds ?? []).length} evidence item(s) linked to this assessment.</p>
                      )}
                    </div>
                    <label>
                      Evidence assessment notes
                      <textarea
                        rows={3}
                        value={active.assessmentNotes ?? ""}
                        onChange={(e) => update({ assessmentNotes: e.target.value })}
                        placeholder="Explain the evidence, scope, limitations, and reasoning behind this status."
                      />
                    </label>
                  </div>
                </div>

                <div className="callout">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Separate assessments. No automatic verdict.</strong>
                    <p>
                      These statuses are recorded assessments, not independently verified findings.
                      Review the source material before assigning a final status.
                    </p>
                  </div>
                </div>
              </section>

              {/* Real Gemini-powered claim analysis */}
              <section className="report-section ai-claim-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">AI / PRELIMINARY ASSESSMENT</p>
                    <h2>Claim intelligence</h2>
                  </div>
                  <Sparkles size={20} />
                </div>
                <p className="muted-copy">
                  Uses Gemini to identify possible risks, assumptions and evidence gaps.
                  It does not independently verify claims or browse for sources.
                </p>
                <button className="primary-button" onClick={analyzeClaim} disabled={aiLoading}>
                  <Sparkles size={16} />
                  {aiLoading ? "Analysing claim..." : aiAnalysis ? "Run analysis again" : "Analyse claim with AI"}
                </button>

                {aiLoading && (
                  <div className="empty-evidence" role="status">
                    <Activity size={22} />
                    <h3>Analysing your claim</h3>
                    <p>Waiting for the AI service. This may take a few seconds.</p>
                  </div>
                )}

                {aiError && (
                  <div className="notice" role="alert">
                    <span>{aiError}</span>
                    <button onClick={() => setAiError("")} aria-label="Dismiss error"><X size={15} /></button>
                  </div>
                )}

                {aiAnalysis && (
                  <div className="ai-analysis-results" aria-live="polite">
                    <div className="callout">
                      <Sparkles size={18} />
                      <div>
                        <strong>Preliminary AI assessment</strong>
                        <p>{aiAnalysis.plain_language_meaning}</p>
                      </div>
                    </div>

                    {analysisSections.map((section) => (
                      <div className="ai-result-group" key={section.key}>
                        <h3>{section.title}</h3>
                        {aiAnalysis[section.key].length > 0 ? (
                          <ul>
                            {aiAnalysis[section.key].map((item, index) => <li key={`${section.key}-${index}`}>{item}</li>)}
                          </ul>
                        ) : (
                          <p className="muted-copy">No items returned for this section.</p>
                        )}
                      </div>
                    ))}

                    <div className="ai-uncertainty">
                      <h3>Uncertainty note</h3>
                      <p>{aiAnalysis.uncertainty_note}</p>
                    </div>
                    <p className="unverified-note">
                      AI-generated analysis · Not independently verified · Human review required
                    </p>
                  </div>
                )}
              </section>

              <div className="report-columns">
                <div>
                  <section className="report-section">
                    <div className="section-heading">
                      <div><p className="eyebrow">01 / EVIDENCE REGISTER</p><h2>Sources and observations</h2></div>
                      <span className="count-badge">{active.evidence.length} ITEMS</span>
                    </div>
                    {active.evidence.length === 0 ? (
                      <div className="empty-evidence">
                        <FileText size={24} /><h3>No evidence recorded yet.</h3>
                        <p>Add source links, excerpts, or observations. A URL alone is not proof that the claim is supported.</p>
                      </div>
                    ) : (
                      <div className="evidence-list">
                        {active.evidence.map((e) => (
                          <article className="evidence-item" key={e.id}>
                            <div className="evidence-item-top"><span className="evidence-kind">{e.stance}</span><span className="evidence-id">{e.id}</span></div>
                            <h3>{e.title}</h3>
                            {e.publisher && <p className="muted-copy">Publisher: {e.publisher}</p>}
                            {e.publicationDate && <p className="muted-copy">Publication date: {e.publicationDate}</p>}
                            {e.url && (
                              <a href={e.url} target="_blank" rel="noreferrer">
                                Open source <ArrowUpRight size={12} />
                              </a>
                            )}
                            {e.excerpt && (
                              <blockquote className="evidence-excerpt">
                                {e.excerpt}
                              </blockquote>
                            )}
                            {e.note && <p>{e.note}</p>}
                            <span className="unverified-note">User supplied · not independently validated</span>
                          </article>
                        ))}
                      </div>
                    )}
                    <div className="evidence-form">
                      <h3>Add an evidence item</h3>
                      <label>
                        Source title
                        <input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Report, paper, certification..." />
                      </label>
                      <label>
                        Publisher / organisation
                        <input value={ePublisher} onChange={(e) => setEPublisher(e.target.value)} placeholder="Laboratory, journal, regulator..." />
                      </label>
                      <label>
                        Publication date
                        <input type="date" value={ePublicationDate} onChange={(e) => setEPublicationDate(e.target.value)} />
                      </label>
                      <label>
                        Source URL
                        <input type="url" value={eUrl} onChange={(e) => setEUrl(e.target.value)} placeholder="https://..." />
                      </label>
                      <label>
                        Relevant excerpt
                        <textarea rows={3} value={eExcerpt} onChange={(e) => setEExcerpt(e.target.value)} placeholder="Paste the exact passage or result relevant to the claim..." />
                      </label>
                      <label>
                        Evidence notes
                        <textarea rows={3} value={eNote} onChange={(e) => setENote(e.target.value)} placeholder="Relevance, limitations, methodology, or observations..." />
                      </label>
                      <label>Relationship to claim
                        <select value={eStance} onChange={(e) => setEStance(e.target.value as Evidence["stance"])}>
                          <option>Supports</option><option>Contradicts</option><option>Context</option>
                        </select>
                      </label>
                      <button className="primary-button" onClick={addEvidence}><Plus size={15} /> Add evidence</button>
                    </div>
                  </section>

                  <section className="report-section">
                    <div className="section-heading"><div><p className="eyebrow">02 / ASSUMPTION AUDIT</p><h2>Known / Assumed / Unknown</h2></div></div>
                    <div className="assumption-grid">
                      {([
                        ["Known", "Facts currently documented", "known"],
                        ["Assumed", "Beliefs needing validation", "assumed"],
                        ["Unknown", "Open questions and evidence gaps", "unknown"]
                      ] as const).map(([title, hint, key]) => (
                        <label className="assumption-field" key={key}>
                          <span>{title}</span><small>{hint}</small>
                          <textarea rows={5} value={active[key]} onChange={(e) => update({ [key]: e.target.value })} placeholder="Add notes..." />
                        </label>
                      ))}
                    </div>
                  </section>
                </div>

                <aside>
                  <div className="review-panel">
                    <p className="eyebrow">03 / HUMAN REVIEW</p>
                    <h2>Record a decision.</h2>
                    <p className="muted-copy">Use this after reviewing the evidence. AI output is not an approval or rejection.</p>
                    <label>Review outcome
                      <select value={reviewDecision || active.decision} onChange={(e) => setReviewDecision(e.target.value)}>
                        <option value="">Choose an outcome</option>
                        <option value="Approve with substantiation">Approve with substantiation</option>
                        <option value="Revise claim wording">Revise claim wording</option>
                        <option value="Request more evidence">Request more evidence</option>
                        <option value="Do not use claim">Do not use claim</option>
                      </select>
                    </label>
                    <label>Review notes
                      <textarea rows={4} value={active.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Rationale, limitations, follow-up..." />
                    </label>
                    <button className="primary-button full-button" onClick={() => {
                      const decision = reviewDecision || active.decision;
                      if (!decision) {
                        setNotice("Choose a review outcome before saving.");
                        return;
                      }
                      update({ decision, status: "Reviewed" });
                      setReviewDecision(decision);
                      setNotice("Human review decision saved.");
                    }}>Save review decision <Check size={15} /></button>
                    {active.decision && (
                      <div className="saved-decision">
                        <BadgeCheck size={16} /><div><strong>Decision recorded</strong><p>{active.decision}</p></div>
                      </div>
                    )}
                  </div>

                  <div className="integrity-card">
                    <ShieldCheck size={19} />
                    <strong>Integrity note</strong>
                    <p>
                      Gemini provides preliminary claim analysis. Evidence is user-supplied;
                      automated source retrieval and citation validation are not connected.
                      Human review is required.
                    </p>
                  </div>
                  <button className="secondary-button full-button" onClick={() => {
                    setNotice("Use Save as PDF in the print dialog.");
                    window.print();
                  }}><FileText size={15} /> Print / Save report as PDF</button>
                </aside>
              </div>
            </section>
          )}

          {!["report", "court", "directions", "branddna", "interview"].includes(view) && (
            <footer className="page-footer">
              <span>TRUTHLAYER AI / EVIDENCE BEFORE ASSERTION</span>
              <span>ROUND 02 BUILD · LOCAL PROTOTYPE</span>
            </footer>
          )}
        </div>
      </main>
    </div>
  );
}

function SimulationList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="simulation-list-block">
      <h3>{title}</h3>
      {items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p className="muted-copy">No specific items identified for this section.</p>}
    </section>
  );
}

function NavButton({
  active, icon, children, onClick
}: {
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`nav-link ${active ? "active" : ""}`} onClick={onClick}>
      {icon}{children}
    </button>
  );
}

function Metric({
  label, value, detail, icon
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{label}</span>{icon}</div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>{detail}</small>
    </div>
  );
}

function InvestigationTable({
  records, onOpen, onViewAll
}: {
  records: RecordItem[];
  onOpen: (id: string) => void;
  onViewAll?: () => void;
}) {
  return (
    <section className="investigation-section">
      <div className="section-heading">
        <div><p className="eyebrow">REGISTER / LIVE WORK</p><h2>Investigation register</h2></div>
        {onViewAll && <button className="text-action" onClick={onViewAll}>View all <ArrowRight size={14} /></button>}
      </div>
      <div className="records-table">
        <div className="table-header"><span>INVESTIGATION</span><span>CATEGORY</span><span>STATUS</span><span>UPDATED</span><span /></div>
        {records.length === 0 ? (
          <div className="empty-table">No investigations found. Create one to get started.</div>
        ) : records.map((record) => (
          <button className="record-row" key={record.id} onClick={() => onOpen(record.id)}>
            <span className="record-title">
              <span className="record-icon"><FileText size={16} /></span>
              <span><strong>{record.name}</strong><small>{record.id} · {record.claim}</small></span>
            </span>
            <span className="record-category">{record.category}</span>
            <span><span className={`status-pill ${statusClass[record.status]}`}>{record.status}</span></span>
            <span className="record-date">{record.createdAt}</span>
            <ArrowUpRight size={15} className="row-arrow" />
          </button>
        ))}
      </div>
    </section>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return <button className="back-link" onClick={onClick}><ArrowLeft size={15} /> Back to workspace</button>;
}
