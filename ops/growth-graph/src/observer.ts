import { join } from "node:path";
import {
  assertSafeMutableFileTarget,
  prepareStateDirectory,
  writeOwnerOnlyFileAtomic,
} from "./state-io.js";

export type ObserverNodeStatus =
  | "waiting"
  | "running"
  | "passed"
  | "partial"
  | "awaiting_review"
  | "quarantined"
  | "blocked"
  | "failed"
  | "skipped";

export interface ObserverLaneState {
  status?: string;
  evidenceCount?: number;
  baselineStatus?: string;
  maturityStatus?: string;
  proposalStatus?: string;
  evalStatus?: string;
  reviewStatus?: string;
  sourceCoverage?: string;
}

export interface ObserverRunState {
  runId: string;
  graphVersion: string;
  policyVersion: string;
  evidenceMode?: "real" | "synthetic" | "unknown";
  status: string;
  currentNode?: string;
  startedAt: string;
  completedAt?: string | null;
  nodeStatuses?: Record<string, ObserverNodeStatus>;
  traversedEdges?: string[];
  lanes?: Record<string, ObserverLaneState>;
  evidenceCount?: number;
  proposalCount?: number;
  reviewCount?: number;
  errors?: Array<Record<string, unknown>>;
  evals?: Array<Record<string, unknown>>;
  budget?: {
    elapsedMs?: number;
    modelStarts?: number;
    toolCalls?: number;
    repairAttempts?: number;
  };
  [key: string]: unknown;
}

export interface ObserverProjection {
  schemaVersion: 1;
  generatedAt: string;
  readOnly: true;
  run: {
    runId: string;
    graphVersion: string;
    policyVersion: string;
    evidenceMode: "real" | "synthetic" | "unknown";
    status: string;
    currentNode: string | null;
    startedAt: string;
    completedAt: string | null;
    evidenceCount: number;
    proposalCount: number;
    reviewCount: number;
  };
  topology: Array<{
    id: string;
    label: string;
    status: ObserverNodeStatus;
    active: boolean;
  }>;
  edges: Array<{
    from: string;
    to: string;
    kind: "normal" | "repair" | "quarantine";
    active: boolean;
  }>;
  lanes: Record<string, Required<ObserverLaneState>>;
  errors: Array<Record<string, unknown>>;
  evals: Array<Record<string, unknown>>;
  budget: {
    elapsedMs: number;
    modelStarts: number;
    toolCalls: number;
    repairAttempts: number;
  };
}

export const OBSERVER_TOPOLOGY = [
  ["trigger", "Trigger and lock"],
  ["preflight", "Policy preflight"],
  ["capture", "Immutable capture"],
  ["validate", "Privacy and evidence"],
  ["data_analysis", "Data analysis"],
  ["llm_strategy", "LLM strategy"],
  ["action_draft", "Local action draft"],
  ["eval", "Independent eval"],
  ["bounded_repair", "Bounded repair"],
  ["human_review", "Human review queue"],
  ["commit", "Domain commit"],
  ["readback", "Readback oracle"],
  ["finalize", "State projections"],
  ["quarantine", "Quarantine"],
] as const;

export const OBSERVER_EDGES = [
  ["trigger", "preflight", "normal"],
  ["preflight", "capture", "normal"],
  ["capture", "validate", "normal"],
  ["validate", "data_analysis", "normal"],
  ["data_analysis", "llm_strategy", "normal"],
  ["llm_strategy", "action_draft", "normal"],
  ["action_draft", "eval", "normal"],
  ["eval", "bounded_repair", "repair"],
  ["bounded_repair", "eval", "repair"],
  ["eval", "human_review", "normal"],
  ["eval", "quarantine", "quarantine"],
  ["human_review", "commit", "normal"],
  ["quarantine", "commit", "normal"],
  ["commit", "readback", "normal"],
  ["readback", "finalize", "normal"],
] as const;

const sensitiveKey =
  /(?:api[_-]?key|authorization|password|secret|service[_-]?role|private[_-]?key|access[_-]?token|refresh[_-]?token|cookie|session|email|phone|street[_-]?address|child|learner|minor|guardian|parent[_-]?name)/i;
const secretLikeValue =
  /(?:\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
const contactLikeValue =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})/i;

export function redactObserverValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return secretLikeValue.test(value) || contactLikeValue.test(value)
      ? "[REDACTED]"
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactObserverValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactObserverValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export function buildObserverProjection(
  state: ObserverRunState,
  generatedAt = new Date().toISOString(),
): ObserverProjection {
  const statuses = state.nodeStatuses ?? {};
  const currentIndex = OBSERVER_TOPOLOGY.findIndex(
    ([id]) => id === state.currentNode,
  );
  const topology = OBSERVER_TOPOLOGY.map(([id, label], index) => ({
    id,
    label,
    status:
      statuses[id] ??
      (id === state.currentNode
        ? "running"
        : currentIndex >= 0 && index < currentIndex && id !== "quarantine"
          ? "passed"
          : "waiting"),
    active: id === state.currentNode,
  }));
  const traversedEdges = new Set(state.traversedEdges ?? []);
  const hasExplicitHistory = state.traversedEdges !== undefined;
  const passed = new Set(
    topology
      .filter((node) => node.active || node.status === "passed")
      .map((node) => node.id),
  );

  const lanes = Object.fromEntries(
    Object.entries(state.lanes ?? {}).map(([lane, value]) => [
      lane,
      {
        status: value.status ?? "not_started",
        evidenceCount: value.evidenceCount ?? 0,
        baselineStatus: value.baselineStatus ?? "missing",
        maturityStatus: value.maturityStatus ?? "unknown",
        proposalStatus: value.proposalStatus ?? "none",
        evalStatus: value.evalStatus ?? "not_run",
        reviewStatus: value.reviewStatus ?? "not_queued",
        sourceCoverage: value.sourceCoverage ?? "not_captured",
      },
    ]),
  );

  return redactObserverValue({
    schemaVersion: 1,
    generatedAt,
    readOnly: true,
    run: {
      runId: state.runId,
      graphVersion: state.graphVersion,
      policyVersion: state.policyVersion,
      evidenceMode: state.evidenceMode ?? "unknown",
      status: state.status,
      currentNode: state.currentNode ?? null,
      startedAt: state.startedAt,
      completedAt: state.completedAt ?? null,
      evidenceCount: state.evidenceCount ?? 0,
      proposalCount: state.proposalCount ?? 0,
      reviewCount: state.reviewCount ?? 0,
    },
    topology,
    edges: OBSERVER_EDGES.map(([from, to, kind]) => ({
      from,
      to,
      kind,
      active: hasExplicitHistory
        ? traversedEdges.has(`${from}->${to}`)
        : passed.has(from) && passed.has(to),
    })),
    lanes,
    errors: state.errors ?? [],
    evals: state.evals ?? [],
    budget: {
      elapsedMs: state.budget?.elapsedMs ?? 0,
      modelStarts: state.budget?.modelStarts ?? 0,
      toolCalls: state.budget?.toolCalls ?? 0,
      repairAttempts: state.budget?.repairAttempts ?? 0,
    },
  }) as ObserverProjection;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const statusColor: Record<ObserverNodeStatus, string> = {
  waiting: "#26324f",
  running: "#ffcd57",
  passed: "#49d6c8",
  partial: "#ff9b57",
  awaiting_review: "#b89cff",
  quarantined: "#ff6b86",
  blocked: "#ff8f70",
  failed: "#ff5577",
  skipped: "#52607f",
};

export function renderObserverHtml(projection: ObserverProjection): string {
  const width = 1180;
  const nodeWidth = 236;
  const nodeHeight = 56;
  const columns = [64, 472, 880];
  const rowGap = 92;
  const positions = new Map<string, { x: number; y: number }>();
  projection.topology.forEach((node, index) => {
    positions.set(node.id, {
      x: columns[index % columns.length]!,
      y: 52 + Math.floor(index / columns.length) * rowGap,
    });
  });

  const edgeSvg = projection.edges
    .map((edge) => {
      const from = positions.get(edge.from)!;
      const to = positions.get(edge.to)!;
      const activeColor =
        edge.kind === "repair"
          ? "#ffcd57"
          : edge.kind === "quarantine"
            ? "#ff6b86"
            : "#49d6c8";
      return `<line x1="${from.x + nodeWidth / 2}" y1="${from.y + nodeHeight / 2}" x2="${to.x + nodeWidth / 2}" y2="${to.y + nodeHeight / 2}" stroke="${edge.active ? activeColor : "#34415f"}" stroke-width="${edge.active ? 4 : 2}"${edge.kind === "normal" ? "" : ' stroke-dasharray="9 7"'} />`;
    })
    .join("\n");
  const nodeSvg = projection.topology
    .map((node) => {
      const position = positions.get(node.id)!;
      const text = ["running", "partial", "awaiting_review"].includes(node.status)
        ? "#101526"
        : "#f5f7ff";
      return `<g><rect x="${position.x}" y="${position.y}" width="${nodeWidth}" height="${nodeHeight}" rx="12" fill="${statusColor[node.status]}" stroke="${node.active ? "#ffffff" : "#667394"}" stroke-width="${node.active ? 4 : 1}" /><text x="${position.x + 14}" y="${position.y + 24}" font-size="15" font-weight="750" fill="${text}">${escapeHtml(node.label)}</text><text x="${position.x + 14}" y="${position.y + 44}" font-size="12" fill="${text}">${escapeHtml(node.status)}</text></g>`;
    })
    .join("\n");
  const laneRows = Object.entries(projection.lanes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([lane, value]) =>
        `<tr><td>${escapeHtml(lane.replaceAll("_", " "))}</td><td>${escapeHtml(value.status)}</td><td>${escapeHtml(value.sourceCoverage)}</td><td>${escapeHtml(value.baselineStatus)}</td><td>${escapeHtml(value.maturityStatus)}</td><td>${escapeHtml(value.proposalStatus)}</td><td>${escapeHtml(value.evalStatus)}</td><td>${escapeHtml(value.reviewStatus)}</td></tr>`,
    )
    .join("\n");
  const errors = projection.errors.length
    ? projection.errors
        .map((error) => `<li><code>${escapeHtml(JSON.stringify(error))}</code></li>`)
        .join("\n")
    : "<li>None recorded</li>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Code the Future growth graph observer</title>
<style>
:root{color-scheme:dark;--ink:#f4f7ff;--muted:#aab5d1;--page:#0d1324;--card:#151e35;--line:#2d3958;--cyan:#49d6c8;--yellow:#ffcd57}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#202c52 0,var(--page) 42%);color:var(--ink);font:15px/1.48 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.page{max-width:1260px;margin:0 auto;padding:36px}.eyebrow{color:var(--cyan);font-weight:800;letter-spacing:.11em;text-transform:uppercase}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{background:color-mix(in srgb,var(--card) 94%,transparent);border:1px solid var(--line);border-radius:16px;padding:17px}.metric{font-size:25px;font-weight:800}.muted{color:var(--muted)}svg{display:block;width:100%;height:auto;background:#111a30;border:1px solid var(--line);border-radius:16px;margin:20px 0}table{width:100%;border-collapse:collapse;background:transparent}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}th{color:var(--yellow)}code{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.page{padding:20px}.table-wrap{overflow-x:auto}}
</style>
</head>
<body><main class="page">
<div class="eyebrow">${projection.run.evidenceMode === "synthetic" ? "Synthetic test evidence — not a real baseline" : projection.run.evidenceMode === "unknown" ? "Evidence mode unknown — inspection only" : "Read-only inspection · real approved capture"}</div>
<h1>Code the Future growth graph</h1>
<p class="muted">Run ${escapeHtml(projection.run.runId)} · ${escapeHtml(projection.run.evidenceMode)} evidence · generated ${escapeHtml(projection.generatedAt)}</p>
<section class="grid" aria-label="Run summary">
<div class="card"><div class="muted">Status</div><div class="metric">${escapeHtml(projection.run.status)}</div></div>
<div class="card"><div class="muted">Current node</div><div class="metric">${escapeHtml(projection.run.currentNode ?? "—")}</div></div>
<div class="card"><div class="muted">Local proposals</div><div class="metric">${projection.run.proposalCount}</div></div>
<div class="card"><div class="muted">Review queue</div><div class="metric">${projection.run.reviewCount}</div></div>
</section>
<svg viewBox="0 0 ${width} ${62 + Math.ceil(projection.topology.length / columns.length) * rowGap}" role="img" aria-label="Graph nodes and current execution state">${edgeSvg}${nodeSvg}</svg>
<section class="card"><h2>Growth lanes</h2><div class="table-wrap"><table><thead><tr><th>Lane</th><th>Status</th><th>Coverage</th><th>Baseline</th><th>Maturity</th><th>Proposal</th><th>Eval</th><th>Review</th></tr></thead><tbody>${laneRows}</tbody></table></div></section>
<section class="card"><h2>Recorded budget</h2><p>${projection.budget.elapsedMs} ms · ${projection.budget.modelStarts} model starts · ${projection.budget.toolCalls} local tool calls · ${projection.budget.repairAttempts} repairs</p></section>
<section class="card"><h2>Recorded errors</h2><ul>${errors}</ul></section>
</main></body></html>`;
}

export async function writeObserverProjection(
  outputDirectory: string,
  projection: ObserverProjection,
): Promise<void> {
  const safeOutputDirectory = await prepareStateDirectory(outputDirectory, {
    ownerOnly: true,
  });
  const jsonPath = join(safeOutputDirectory, "latest.json");
  const htmlPath = join(safeOutputDirectory, "index.html");
  await Promise.all([
    assertSafeMutableFileTarget(jsonPath),
    assertSafeMutableFileTarget(htmlPath),
  ]);
  await Promise.all([
    writeOwnerOnlyFileAtomic(
      jsonPath,
      `${JSON.stringify(projection, null, 2)}\n`,
    ),
    writeOwnerOnlyFileAtomic(htmlPath, renderObserverHtml(projection)),
  ]);
}

export async function writeObserverArtifacts(
  state: ObserverRunState,
  outputDirectory: string,
): Promise<ObserverProjection> {
  const projection = buildObserverProjection(state);
  await writeObserverProjection(outputDirectory, projection);
  return projection;
}
