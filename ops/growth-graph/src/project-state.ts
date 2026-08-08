import { redactObserverValue } from "./observer.js";
import { writeOwnerOnlyFileAtomic } from "./state-io.js";

export interface ProjectStateLane {
  status: string;
  sourceCoverage: string;
  evidenceCount: number;
  baselineStatus: string;
  baselineSummary: string;
  maturityStatus: string;
  primaryKpi: string;
  decision: string;
  proposalStatus: string;
  evalStatus: string;
  reviewStatus: string;
  nextSafeAction: string;
}

export interface ProjectStateError {
  category: string;
  node: string;
  fingerprint: string;
  message: string;
  retryable: boolean;
  attempt: number;
}

export interface ProjectStateInput {
  runId: string;
  graphVersion: string;
  policyVersion: string;
  policyHash: string;
  evidenceMode: "real" | "synthetic" | "unknown";
  status: string;
  startedAt: string;
  completedAt?: string | null;
  objectiveWindow: {
    startsAt: string;
    endsAt: string;
  };
  lanes: Record<string, ProjectStateLane>;
  localPersistence: {
    committed: boolean;
    verified: boolean;
    transactionId?: string | null;
  };
  reviewCount: number;
  externalActionStatus: "not_executed";
  errors: ProjectStateError[];
  nextSafeAction: string;
}

function cell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "\\`")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function titleForLane(lane: string): string {
  const titles: Record<string, string> = {
    organic_social: "Organic Instagram and Facebook",
    contact_discovery: "Permission-safe contact discovery",
    search_console: "Google Search Console",
  };
  return titles[lane] ?? lane.replaceAll("_", " ");
}

export function renderProjectState(input: ProjectStateInput): string {
  const safe = redactObserverValue(input) as ProjectStateInput;
  const laneRows = Object.entries(safe.lanes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([lane, value]) =>
        `| ${cell(titleForLane(lane))} | ${cell(value.status)} | ${cell(value.sourceCoverage)} | ${value.evidenceCount} | ${cell(value.baselineStatus)} | ${cell(value.maturityStatus)} | ${cell(value.decision)} | ${cell(value.evalStatus)} | ${cell(value.reviewStatus)} |`,
    );
  const laneDetails = Object.entries(safe.lanes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([lane, value]) => `### ${cell(titleForLane(lane))}

- Primary KPI: ${cell(value.primaryKpi)}
- Baseline: ${cell(value.baselineSummary)}
- Proposal: ${cell(value.proposalStatus)}
- Next safe action: ${cell(value.nextSafeAction)}`,
    );
  const errorRows = safe.errors.map(
    (error) =>
      `| ${cell(error.node)} | ${cell(error.category)} | ${cell(error.fingerprint)} | ${error.attempt} | ${error.retryable ? "yes" : "no"} | ${cell(error.message)} |`,
  );

  return `# Code the Future Growth Graph — Project State

Generated projection. Canonical runtime state lives in the local SQLite ledger and LangGraph checkpoints.

${safe.evidenceMode === "synthetic" ? "**SYNTHETIC TEST EVIDENCE — NOT A REAL CODE THE FUTURE BASELINE OR ACTION PACKAGE.**" : safe.evidenceMode === "unknown" ? "**EVIDENCE MODE UNKNOWN — DO NOT TREAT THIS PROJECTION AS A REAL BASELINE.**" : "Evidence mode: **real approved capture**."}

## Current run

- Run: ${cell(safe.runId)}
- Status: **${cell(safe.status)}**
- Graph: ${cell(safe.graphVersion)}
- Policy: ${cell(safe.policyVersion)}
- Policy hash: ${cell(safe.policyHash)}
- Evidence mode: **${cell(safe.evidenceMode)}**
- Objective window: ${cell(safe.objectiveWindow.startsAt)} through ${cell(safe.objectiveWindow.endsAt)}
- Started: ${cell(safe.startedAt)}
- Completed: ${cell(safe.completedAt ?? "not completed")}
- Local transaction: ${safe.localPersistence.committed ? "committed" : "not committed"}
- Read-after-write: ${safe.localPersistence.verified ? "verified" : "not verified"}
- Review queue: ${safe.reviewCount}
- External actions: **${cell(safe.externalActionStatus)} — shadow mode**

## Growth lanes

| Lane | Status | Coverage | Evidence | Baseline | Maturity | Decision | Eval | Human review |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
${laneRows.length ? laneRows.join("\n") : "| None | not started | none | 0 | missing | unknown | observe_more | not run | not queued |"}

${laneDetails.join("\n\n") || "No lane analysis has been recorded."}

## Recorded errors

| Node | Category | Fingerprint | Attempt | Retryable | Message |
| --- | --- | --- | ---: | --- | --- |
${errorRows.length ? errorRows.join("\n") : "| - | - | - | - | - | None recorded |"}

## Authority boundary

This shadow workflow can inspect verified local evidence, calculate metrics, prepare local drafts, evaluate proposals, and queue exact items for human review. It cannot publish or schedule social posts, contact a person or group, spend money, change Search Console, merge code, or deploy the website.

## Next safe action

${cell(safe.nextSafeAction)}
`;
}

export async function writeProjectState(
  path: string,
  input: ProjectStateInput,
): Promise<string> {
  return writeOwnerOnlyFileAtomic(path, renderProjectState(input));
}
