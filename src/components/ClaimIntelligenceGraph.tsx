import { useMemo, useState } from "react";
import { Activity, AlertTriangle, BadgeCheck, FileText, FlaskConical, GitBranch, Lightbulb, ShieldCheck, CircleHelp } from "lucide-react";
import "./ClaimIntelligenceGraph.css";

type Evidence = {
  id: string; title: string; url: string; note: string;
  stance: "Supports" | "Contradicts" | "Context";
  publisher?: string; publicationDate?: string; excerpt?: string;
};
type RecordItem = {
  id: string; name: string; claim: string; category: string;
  status: string; evidence: Evidence[]; decision: string; notes: string;
  known: string; assumed: string; unknown: string;
  permissionStatus?: string; permissionCriteria?: string;
  evidenceStatus?: string; assessmentNotes?: string; assessmentEvidenceIds?: string[];
};
type Props = { records: RecordItem[]; selectedRecordId: string | null; onSelectRecord: (id: string) => void };
type GraphNode = { id: string; label: string; kind: string; status: string; detail: string; x: number; y: number; icon: string };

export default function ClaimIntelligenceGraph({ records, selectedRecordId, onSelectRecord }: Props) {
  const record = records.find((item) => item.id === selectedRecordId) ?? records[0] ?? null;
  const [selectedNodeId, setSelectedNodeId] = useState("claim");
  const [filter, setFilter] = useState("All nodes");

  const nodes = useMemo<GraphNode[]>(() => {
    if (!record) return [];
    const evidence = record.evidence ?? [];
    // Spread evidence cards across three columns so they do not overlap the
    // human-review node. The graph currently displays at most six evidence cards.
    const evidenceColumns = [7, 25, 61];
    const evidenceNodes: GraphNode[] = evidence.slice(0, 6).map((item, index) => {
      const column = index % evidenceColumns.length;
      const row = Math.floor(index / evidenceColumns.length);
      return {
        id: `evidence-${item.id}`,
        label: item.title || "Untitled evidence",
        kind: "Evidence",
        status: item.stance,
        detail: [
          item.publisher ? `Publisher: ${item.publisher}` : "Publisher not recorded",
          item.publicationDate ? `Date: ${item.publicationDate}` : "Publication date not recorded",
          item.excerpt ? `Excerpt: ${item.excerpt}` : "No excerpt recorded",
          item.note ? `Notes: ${item.note}` : "No evidence notes recorded",
          item.url ? `Source URL: ${item.url}` : "No source URL recorded",
          "User supplied; not independently validated."
        ].join("\n"),
        x: evidenceColumns[column],
        y: 15 + row * 22,
        icon: "evidence",
      };
    });
    const fixed: GraphNode[] = [
      { id: "claim", label: "Claim under review", kind: "Claim", status: "Submitted wording", detail: `“${record.claim}”\nInvestigation: ${record.id} · ${record.name}\nCategory: ${record.category}\nThis is the claim being examined, not a verified conclusion.`, x: 43, y: 46, icon: "claim" },
      { id: "known", label: "Known", kind: "Assumption audit", status: record.known?.trim() ? "Recorded" : "Not recorded", detail: record.known?.trim() || "No known facts have been recorded for this investigation yet.", x: 7, y: 52, icon: "known" },
      { id: "assumed", label: "Assumed", kind: "Assumption audit", status: record.assumed?.trim() ? "Needs validation" : "Not recorded", detail: record.assumed?.trim() || "No assumptions have been recorded for this investigation yet.", x: 25, y: 78, icon: "assumed" },
      { id: "unknown", label: "Unknown / gaps", kind: "Assumption audit", status: record.unknown?.trim() ? "Open questions" : "Not recorded", detail: record.unknown?.trim() || "No unknowns or evidence gaps have been recorded yet.", x: 61, y: 78, icon: "unknown" },
      { id: "permission", label: "Permission", kind: "Assessment", status: record.permissionStatus || "Not assessed", detail: `Permission status: ${record.permissionStatus || "Not assessed"}\nCriteria: ${record.permissionCriteria?.trim() || "No review criteria recorded."}\nThis assessment is independent of factual substantiation.`, x: 79, y: 52, icon: "permission" },
      { id: "assessment", label: "Evidence assessment", kind: "Assessment", status: record.evidenceStatus || "Unverified", detail: `Evidence status: ${record.evidenceStatus || "Unverified"}\nNotes: ${record.assessmentNotes?.trim() || "No assessment rationale recorded."}\nLinked evidence items: ${(record.assessmentEvidenceIds || []).length}\nA recorded status is not independent verification.`, x: 79, y: 20, icon: "assessment" },
      { id: "decision", label: "Human review", kind: "Decision", status: record.decision || "No decision recorded", detail: `Human review decision: ${record.decision || "No decision recorded"}\nReview notes: ${record.notes?.trim() || "No review notes recorded."}\nAI output and graph relationships do not replace human review.`, x: 43, y: 7, icon: "decision" },
    ];
    return [...fixed, ...evidenceNodes];
  }, [record]);

  const activeNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const visibleNodes = nodes.filter((node) => filter === "All nodes" || node.kind === filter);
  const edges = useMemo(() => {
    if (!record) return [] as { from: string; to: string; label: string }[];
    const out = [
      { from: "claim", to: "known", label: "documented context" },
      { from: "claim", to: "assumed", label: "requires testing" },
      { from: "claim", to: "unknown", label: "open questions" },
      { from: "claim", to: "permission", label: "wording criteria" },
      { from: "claim", to: "assessment", label: "substantiation" },
      { from: "claim", to: "decision", label: "human review" },
    ];
    (record.evidence || []).slice(0, 6).forEach((item) => out.push({ from: `evidence-${item.id}`, to: "claim", label: item.stance.toLowerCase() }));
    return out;
  }, [record]);

  if (!record) return <div className="graph-empty"><GitBranch size={30} /><h2>No investigations yet</h2><p>Create an investigation and add evidence to generate its intelligence graph.</p></div>;

  const position = (id: string) => nodes.find((node) => node.id === id) ?? nodes[0];
  const nodeColor = (node: GraphNode) => {
    if (node.kind === "Claim") return "claim";
    if (node.kind === "Evidence") return node.status === "Supports" ? "positive" : node.status === "Contradicts" ? "negative" : "context";
    if (node.status === "Not assessed" || node.status === "Not recorded" || node.status === "Unverified" || node.status === "No decision recorded") return "unresolved";
    if (node.status === "Contradicted" || node.status === "Not permitted") return "negative";
    if (node.status === "Supported" || node.status === "Permitted" || node.status === "Recorded") return "positive";
    return "context";
  };

  return <div className="claim-graph-workspace">
    <div className="claim-graph-toolbar">
      <label>Investigation<select value={record.id} onChange={(event) => { onSelectRecord(event.target.value); setSelectedNodeId("claim"); }}>
        {records.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}
      </select></label>
      <label>Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All nodes</option><option>Evidence</option><option>Assumption audit</option><option>Assessment</option><option>Decision</option></select></label>
      <div className="graph-summary"><span><b>{record.evidence.length}</b> evidence items</span><span><b>{(record.assessmentEvidenceIds || []).length}</b> linked to assessment</span></div>
    </div>

    <div className="claim-graph-main">
      <section className="claim-graph-stage" aria-label="Interactive claim relationship graph">
        <div className="graph-stage-top"><span className="eyebrow">RELATIONSHIP MAP / {record.id}</span><span className="graph-live-dot">LOCAL RECORD</span></div>
        <div className="graph-canvas">
          <svg className="graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {edges.map((edge) => { const a = position(edge.from); const b = position(edge.to); return <g key={`${edge.from}-${edge.to}`}><line x1={a.x + 5} y1={a.y + 4} x2={b.x + 5} y2={b.y + 4} className={`graph-edge-line ${edge.from.startsWith("evidence-") ? (record.evidence.find(e => `evidence-${e.id}` === edge.from)?.stance.toLowerCase() || "context") : "neutral"}`} /></g>; })}
          </svg>
          {visibleNodes.map((node) => <button key={node.id} type="button" className={`graph-node graph-node-${nodeColor(node)} ${selectedNodeId === node.id ? "graph-node-selected" : ""} graph-node-${node.icon}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => setSelectedNodeId(node.id)} title={`Inspect ${node.label}`}>
            <span className="graph-node-icon">{node.kind === "Claim" ? <ShieldCheck size={17} /> : node.kind === "Evidence" ? <FileText size={16} /> : node.kind === "Decision" ? <BadgeCheck size={16} /> : node.kind === "Assessment" ? <Activity size={16} /> : node.id === "assumed" ? <Lightbulb size={16} /> : node.id === "unknown" ? <CircleHelp size={16} /> : <FlaskConical size={16} />}</span>
            <span className="graph-node-label">{node.label}</span><span className="graph-node-status">{node.status}</span>
          </button>)}
          {record.evidence.length === 0 && <div className="graph-empty-hint"><AlertTriangle size={15} /> No evidence items recorded. The graph intentionally shows an evidence gap.</div>}
          {record.evidence.length > 6 && <div className="graph-more-evidence">Showing 6 of {record.evidence.length} evidence items. Use the evidence register to inspect the rest.</div>}
        </div>
        <div className="graph-legend"><span><i className="legend-dot positive" /> Supports / recorded</span><span><i className="legend-dot negative" /> Contradicts / conflicts</span><span><i className="legend-dot unresolved" /> Unresolved / not assessed</span><span><i className="legend-dot context" /> Context / other</span></div>
        <p className="graph-disclaimer">Relationships show how information is organised in this record. They do not prove causation, source reliability, or claim truth.</p>
      </section>

      <aside className="graph-inspector">
        <div className="graph-inspector-icon"><GitBranch size={19} /></div><p className="eyebrow">NODE INSPECTOR</p>
        {activeNode ? <><span className={`graph-kind-pill ${nodeColor(activeNode)}`}>{activeNode.kind}</span><h2>{activeNode.label}</h2><p className="graph-inspector-status">{activeNode.status}</p><div className="graph-detail-text">{activeNode.detail.split("\n").map((line, index) => <p key={index}>{line}</p>)}</div>
          {activeNode.kind === "Evidence" && record.evidence.find((item) => `evidence-${item.id}` === activeNode.id)?.url && <a className="graph-source-link" href={record.evidence.find((item) => `evidence-${item.id}` === activeNode.id)?.url} target="_blank" rel="noreferrer">Open recorded source ↗</a>}
        </> : <p>Select a node to inspect its details.</p>}
        <div className="graph-inspector-note"><ShieldCheck size={16} /><p>Recorded assessments remain independent. Selecting a node never changes the investigation or its human decision.</p></div>
      </aside>
    </div>
  </div>;
}