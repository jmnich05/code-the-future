import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  StrategyEvaluationSchema,
  AgentStrategyProposalSchema,
  type GrowthLane,
  type GrowthStrategist,
  type GrowthStrategyEvaluator,
  type LaneStrategyInput,
  type StrategyEvalDefect,
  type StrategyEvaluation,
  type AgentStrategyProposal,
  validateStrategyProposal,
} from "./assessor.js";
import {
  ArtifactConflictError,
  ArtifactPolicyError,
  SecretMaterialError,
  intakeCaptureBundle,
  type CaptureIntakeResult,
} from "./artifacts.js";
import { analyzeGrowthPortfolio } from "./domain.js";
import {
  GrowthLedger,
  buildPortfolioCommitInput,
  type CommitReadback,
  type LedgerOutboxInput,
} from "./ledger.js";
import {
  buildObserverProjection,
  redactObserverValue,
  writeObserverArtifacts,
  writeObserverProjection,
  type ObserverLaneState,
  type ObserverNodeStatus,
} from "./observer.js";
import { writeProjectState, type ProjectStateLane } from "./project-state.js";
import {
  GRAPH_STATE_SCHEMA_VERSION,
  APPROVAL_PACKAGE_SCHEMA_VERSION,
  CONSENT_REVOCATION_CHECK_MAX_AGE_MS,
  ApprovalPackageSchema,
  GrowthGraphStateSchema,
  HumanReviewSchema,
  approvalPackageHash,
  StrategyProposalSchema as CanonicalStrategyProposalSchema,
  type EvalFinding,
  type GraphError,
  type GrowthGraphState,
  type HumanReview,
  type LaneAnalysis,
  type ApprovalScope,
  type PortfolioAnalysis,
  type StrategyProposal,
} from "./schema.js";

export const GRAPH_VERSION = "growth_portfolio_shadow_v1";
export const POLICY_VERSION = "1.0.0";
export const PROMPT_VERSION = "ctf-growth-prompts-v2";
export const METRIC_DEFINITION_VERSION = "ctf-growth-metrics-v1";
export const TOOL_VERSION = "ctf-growth-tools-v1";
export const NODE_VERSION = "22";
export const MAXIMUM_PROVIDER_STARTS_PER_CALL = 3;
export const MAXIMUM_REPAIRS_PER_LANE = 2;

export type WorkflowStatus =
  | "queued"
  | "running"
  | "awaiting_review"
  | "complete"
  | "partial"
  | "duplicate_noop"
  | "blocked"
  | "failed";

export interface WorkflowErrorState {
  category: string;
  node: string;
  fingerprint: string;
  message: string;
  retryable: boolean;
  attempt: number;
}

export interface LaneWorkState {
  lane: GrowthLane;
  status:
    | "skipped"
    | "pending"
    | "strategy_ready"
    | "drafted"
    | "needs_repair"
    | "passed"
    | "quarantined"
    | "awaiting_review";
  strategyInput: LaneStrategyInput;
  strategy: AgentStrategyProposal | null;
  draft: StrategyProposal | null;
  evaluation: StrategyEvaluation | null;
  priorDefects: StrategyEvalDefect[];
  defectFingerprints: string[];
  repairCount: number;
}

export interface WorkflowPersistenceState {
  committed: boolean;
  verified: boolean;
  transactionId: string | null;
  readback: CommitReadback | null;
}

const GrowthWorkflowAnnotation = Annotation.Root({
  canonical: Annotation<GrowthGraphState>(),
  status: Annotation<WorkflowStatus>(),
  startedAt: Annotation<string>(),
  completedAt: Annotation<string | null>(),
  capturePath: Annotation<string>(),
  expectedCaptureSha256: Annotation<string>(),
  currentNode: Annotation<string>(),
  nodeStatuses: Annotation<Record<string, ObserverNodeStatus>>(),
  traversedEdges: Annotation<string[]>(),
  intake: Annotation<CaptureIntakeResult | null>(),
  analysis: Annotation<PortfolioAnalysis | null>(),
  laneWork: Annotation<Partial<Record<GrowthLane, LaneWorkState>>>(),
  currentLane: Annotation<GrowthLane | null>(),
  duplicateNoop: Annotation<boolean>(),
  duplicateInProgress: Annotation<boolean>(),
  persistence: Annotation<WorkflowPersistenceState>(),
  errors: Annotation<WorkflowErrorState[]>(),
  budget: Annotation<{
    modelStarts: number;
    toolCalls: number;
    repairAttempts: number;
    elapsedMs: number;
  }>(),
});

export type GrowthWorkflowState = typeof GrowthWorkflowAnnotation.State;

export interface GrowthWorkflowPaths {
  stateRoot: string;
  projectStatePath: string;
  observerDirectory: string;
}

export interface FailureInjection {
  (
    node: string,
    phase: "before" | "after",
    state: GrowthWorkflowState,
  ): void;
}

export interface GrowthWorkflowOptions {
  ledger: GrowthLedger;
  checkpointer: SqliteSaver;
  strategist: GrowthStrategist;
  evaluator: GrowthStrategyEvaluator;
  paths: GrowthWorkflowPaths;
  evidenceRoot: string;
  allowSyntheticEvidence?: boolean;
  now?: () => Date;
  modelTimeoutMs?: number;
  retryDelayMs?: number;
  failureInjection?: FailureInjection;
  policyManifestPaths?: string[];
  runtimeManifest?: JsonValue;
}

export interface InitialGrowthRunInput {
  runId: string;
  idempotencyKey: string;
  capturePath: string;
  expectedCaptureSha256: string;
  runtimeManifestHash?: string;
  triggerKind?: "manual" | "scheduled" | "resume" | "test";
  startedAt?: string;
  objectiveWindow?: { start: string; end: string };
  metricDefinitionVersion?: string;
  modelId?: string;
  promptVersion?: string;
  toolVersion?: string;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const LANE_ORDER: readonly GrowthLane[] = [
  "organic_social",
  "contact_discovery",
  "search_console",
] as const;

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function computeRuntimeManifestHash(
  paths: string[],
  runtimeManifest: JsonValue = {},
): Promise<string> {
  const digest = createHash("sha256");
  for (const path of [...paths].map((entry) => resolve(entry)).sort()) {
    digest.update(path);
    digest.update("\0");
    digest.update(await readFile(path));
    digest.update("\0");
  }
  digest.update("runtime-manifest\0");
  digest.update(canonicalJson(runtimeManifest));
  digest.update("\0");
  return digest.digest("hex");
}

export async function resolveConfinedCapturePath(
  allowedEvidenceRoot: string,
  capturePath: string,
): Promise<string> {
  const allowedRoot = await realpath(resolve(allowedEvidenceRoot));
  const candidate = await realpath(resolve(capturePath));
  const relativePath = relative(allowedRoot, candidate);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ArtifactPolicyError("Capture path escapes the allowed evidence root");
  }
  const stats = await lstat(candidate);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new ArtifactPolicyError("Capture path must resolve to a regular file");
  }
  return candidate;
}

export class ModelRetryBudgetExceededError extends Error {
  override name = "ModelRetryBudgetExceededError";
}

export class ModelCallTimeoutError extends Error {
  override name = "ModelCallTimeoutError";
}

export interface WorkflowFailureClass {
  category:
    | "transient_provider"
    | "transient_io"
    | "permanent_input"
    | "permanent_policy"
    | "unknown";
  retryable: boolean;
}

function errorChain(error: unknown): Array<Record<string, unknown>> {
  const chain: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();
  let current = error;
  while (
    current &&
    typeof current === "object" &&
    chain.length < 6 &&
    !seen.has(current)
  ) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    chain.push(record);
    current = record.cause;
  }
  return chain;
}

export function classifyWorkflowError(
  error: unknown,
  node = "unknown",
): WorkflowFailureClass {
  if (
    error instanceof ArtifactConflictError ||
    error instanceof ArtifactPolicyError ||
    error instanceof SecretMaterialError ||
    error instanceof ModelRetryBudgetExceededError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    return {
      category: node === "preflight" ? "permanent_policy" : "permanent_input",
      retryable: false,
    };
  }
  const chain = errorChain(error);
  const statuses = chain.map((record) =>
    Number(record.status ?? record.statusCode ?? record.httpStatus),
  );
  const codes = chain.map((record) => String(record.code ?? "").toUpperCase());
  const names = chain.flatMap((record) => {
    const constructorName = (record.constructor as { name?: unknown } | undefined)
      ?.name;
    return [String(record.name ?? ""), String(constructorName ?? "")];
  });
  if (
    error instanceof ModelCallTimeoutError ||
    names.some((name) =>
      ["AbortError", "APIConnectionError", "APIConnectionTimeoutError"].includes(
        name,
      ),
    ) ||
    statuses.some(
      (status) => status === 408 || status === 409 || status === 429 || status >= 500,
    ) ||
    codes.some((code) =>
      [
        "ETIMEDOUT",
        "ECONNRESET",
        "ECONNREFUSED",
        "EAI_AGAIN",
        "ENETUNREACH",
      ].includes(code),
    )
  ) {
    return { category: "transient_provider", retryable: true };
  }
  if (
    codes.some((code) => ["EBUSY", "EAGAIN", "EMFILE", "ENFILE"].includes(code))
  ) {
    return { category: "transient_io", retryable: true };
  }
  return { category: "unknown", retryable: false };
}

function errorMessage(error: unknown): string {
  return String(
    redactObserverValue(error instanceof Error ? error.message : String(error)),
  );
}

function finishNode(
  state: GrowthWorkflowState,
  node: string,
  update: Partial<GrowthWorkflowState> = {},
): Partial<GrowthWorkflowState> {
  const edge =
    state.currentNode && state.currentNode !== node
      ? `${state.currentNode}->${node}`
      : null;
  return {
    ...update,
    currentNode: node,
    nodeStatuses: { ...state.nodeStatuses, [node]: "passed" },
    traversedEdges:
      edge && !state.traversedEdges.includes(edge)
        ? [...state.traversedEdges, edge]
        : state.traversedEdges,
  };
}

function canonicalUpdate(
  state: GrowthWorkflowState,
  update: Partial<GrowthGraphState>,
): GrowthGraphState {
  return GrowthGraphStateSchema.parse({ ...state.canonical, ...update });
}

function replaceLaneWork(
  state: GrowthWorkflowState,
  replacement: LaneWorkState,
): Partial<Record<GrowthLane, LaneWorkState>> {
  return { ...state.laneWork, [replacement.lane]: replacement };
}

function replaceProposal(
  proposals: StrategyProposal[],
  replacement: StrategyProposal,
): StrategyProposal[] {
  const withoutLane = proposals.filter((proposal) => proposal.lane !== replacement.lane);
  return [...withoutLane, replacement];
}

function currentLaneWork(state: GrowthWorkflowState): LaneWorkState {
  if (!state.currentLane) throw new Error("Current growth lane is missing");
  const work = state.laneWork[state.currentLane];
  if (!work) throw new Error(`Growth lane ${state.currentLane} is missing`);
  return work;
}

function currentLaneAnalysis(state: GrowthWorkflowState): LaneAnalysis {
  if (!state.currentLane || !state.analysis) {
    throw new Error("Current lane analysis is missing");
  }
  const analysis = state.analysis.lanes.find(
    (candidate) => candidate.lane === state.currentLane,
  );
  if (!analysis) throw new Error(`Analysis for ${state.currentLane} is missing`);
  return analysis;
}

function nextPendingLane(
  laneWork: Partial<Record<GrowthLane, LaneWorkState>>,
): GrowthLane | null {
  return (
    LANE_ORDER.find((lane) => laneWork[lane]?.status === "pending") ?? null
  );
}

function allowedVariables(lane: GrowthLane, analysis: LaneAnalysis): string[] {
  const defaults: Record<GrowthLane, string[]> = {
    organic_social: ["hook", "format", "call_to_action", "publishing_window"],
    contact_discovery: ["source_lane"],
    search_console: [
      "technical_indexing",
      "title_meta_alignment",
      "internal_linking",
      "local_proof",
      "enrollment_page_clarity",
    ],
  };
  const opportunityVariable = analysis.opportunities[0]?.controlled_variable;
  return [...new Set([...defaults[lane], ...(opportunityVariable ? [opportunityVariable] : [])])];
}

function primaryKpi(lane: GrowthLane, intake: CaptureIntakeResult): string {
  if (lane === "contact_discovery") return "approved_qualified_discovery_records_60d";
  if (lane === "search_console") return "nonbrand_parent_intent_gsc_clicks_28d";
  const sources = new Set(
    intake.evidence
      .filter((entry) => entry.artifact.lane === "organic_social")
      .map((entry) => entry.artifact.source),
  );
  if (sources.has("instagram_insights") && !sources.has("facebook_insights")) {
    return "organic_net_new_followers_60d_instagram";
  }
  if (sources.has("facebook_insights") && !sources.has("instagram_insights")) {
    return "organic_net_new_followers_60d_facebook";
  }
  return "organic_net_new_followers_60d_platform_separated";
}

function evidenceMode(
  intake: CaptureIntakeResult | null,
  reviews: HumanReview[] = [],
): "real" | "synthetic" | "unknown" {
  if (intake) {
    return intake.evidence.some(
      (entry) =>
        entry.artifact.producer.mode === "synthetic_fixture" ||
        entry.artifact.redaction_status === "synthetic",
    )
      ? "synthetic"
      : "real";
  }
  return reviews[0]?.approval_package.evidence_mode ?? "unknown";
}

function buildLaneStrategyInput(
  analysis: LaneAnalysis,
  intake: CaptureIntakeResult,
): LaneStrategyInput {
  const opportunity = analysis.opportunities[0];
  const evidence = analysis.evidence_refs.flatMap((evidenceId) => {
    const item = intake.evidence.find(
      (candidate) => candidate.declaration.evidence_id === evidenceId,
    );
    if (!item) return [];
    const supportedMetrics = analysis.metrics
      .filter((metric) => metric.evidence_refs.includes(evidenceId))
      .map(
        (metric) =>
          `${metric.metric_name}=${metric.value ?? "missing"} ${metric.unit}; complete=${metric.complete}`,
      );
    return [
      {
        id: evidenceId,
        kind: item.artifact.source,
        source: item.artifact.producer.mode,
        observedAt: item.artifact.captured_at,
        summary: [
          `Source ${item.artifact.source}; data_state=${item.artifact.data_state}.`,
          ...supportedMetrics,
          opportunity?.evidence_refs.includes(evidenceId)
            ? `Opportunity: ${opportunity.summary}`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    ];
  });
  return {
    analysisId: `analysis-${analysis.lane}`,
    lane: analysis.lane,
    eligibility:
      analysis.status === "eligible"
        ? "eligible"
        : analysis.status === "quarantined"
          ? "quarantined"
          : "observe_more",
    primaryKpi: primaryKpi(analysis.lane, intake),
    recommendedDecision: analysis.decision,
    allowedControlledVariables: allowedVariables(analysis.lane, analysis),
    baselineSummary: analysis.metrics.length
      ? analysis.metrics
          .map(
            (metric) =>
              `${metric.platform ? `${metric.platform} ` : ""}${metric.metric_name}: ${metric.value ?? "missing"} (${metric.complete ? "complete" : "incomplete"})`,
          )
          .join("; ")
      : "No trustworthy baseline metric is available.",
    opportunitySummary: opportunity?.summary ?? "No eligible opportunity candidate.",
    sourceCoverageSummary: analysis.source_coverage,
    maturitySummary:
      analysis.status === "observe_more"
        ? "Evidence is not mature enough for a promoted learning."
        : analysis.issues.join("; ") || "Deterministic maturity checks passed.",
    guardrails: analysis.issues,
    evidence,
  };
}

export function createActionDraft(
  runId: string,
  input: LaneStrategyInput,
  strategy: AgentStrategyProposal,
  analysis: LaneAnalysis,
  intake: CaptureIntakeResult,
  draftedAt: string,
): StrategyProposal {
  const evidenceRefs = [
    ...new Set(
      [...strategy.rationale, ...strategy.risks].map((claim) => claim.evidenceId),
    ),
  ];
  const measurementWindowDays: Record<GrowthLane, number> = {
    organic_social: 3,
    contact_discovery: 7,
    search_console: 28,
  };
  const proposalId = `proposal-${hash(
      canonicalJson({
        runId,
        lane: strategy.lane,
        hypothesis: strategy.hypothesis,
        controlledVariable: strategy.controlledVariable,
        arm: strategy.proposedArm,
      }),
    ).slice(0, 24)}`;
  const opportunity = analysis.opportunities[0];
  const scheduledAt = new Date(Date.parse(draftedAt) + 24 * 60 * 60 * 1_000).toISOString();
  let approvalScope: ApprovalScope | undefined;
  if (opportunity?.kind === "social_experiment") {
    const intakenEvidence = intake.evidence
      .filter((entry) => opportunity.evidence_refs.includes(entry.artifact.evidence_id))
      .find(
        (entry) =>
          entry.artifact.lane === "organic_social" &&
          entry.artifact.platform === opportunity.platform &&
          entry.artifact.account_id === opportunity.account_id,
      );
    const artifact = intakenEvidence?.artifact;
    const anchorPost =
      artifact?.lane === "organic_social"
        ? artifact.payload.posts.find(
            (post) => post.post_id === opportunity.anchor_post_id,
          )
        : undefined;
    type SocialApprovalAsset = Extract<
      ApprovalScope,
      { lane: "organic_social" }
    >["asset_artifacts"][number];
    const assetArtifacts = anchorPost?.asset_refs.flatMap<SocialApprovalAsset>((assetId) => {
      if (artifact?.lane !== "organic_social" || !intakenEvidence) return [];
      const asset = artifact.payload.assets.find(
        (candidate) => candidate.asset_id === assetId,
      );
      const intakenAsset = intake.assetArtifacts.find(
        (candidate) =>
          candidate.evidenceId === artifact.evidence_id &&
          candidate.assetId === assetId,
      );
      if (
        !asset ||
        !intakenAsset ||
        intakenAsset.contentSha256 !== asset.content_sha256 ||
        intakenAsset.byteLength !== asset.byte_length
      ) {
        return [];
      }
      const base = {
        asset_id: asset.asset_id,
        evidence_id: artifact.evidence_id,
        evidence_sha256: intakenEvidence.immutableArtifact.sha256,
        content_sha256: asset.content_sha256,
        byte_length: asset.byte_length,
        subject_classification: asset.subject_classification,
        media_kinds: [...asset.media_kinds].sort(),
      };
      if (asset.subject_classification === "no_person") {
        return [
          {
            ...base,
            authorization: {
              authorization_basis: "none_needed" as const,
              subject_basis: "none_needed" as const,
            },
          },
        ];
      }
      const requiredBasis =
        asset.subject_classification === "adult_only" ? "adult" : "guardian";
      const checkAtMs = Date.parse(draftedAt);
      const publishingAtMs = Date.parse(scheduledAt);
      const consent = asset.consent_refs
        .map((consentId) =>
          artifact.payload.consents.find(
            (candidate) =>
              candidate.consent_id === consentId &&
              candidate.asset_id === asset.asset_id,
          ),
        )
        .filter((candidate) => candidate !== undefined)
        .sort((left, right) => left.consent_id.localeCompare(right.consent_id))
        .find(
          (candidate) =>
            candidate.subject_basis === requiredBasis &&
            candidate.allowed_channels.includes(opportunity.platform) &&
            asset.media_kinds.every((kind) => candidate.allowed_media.includes(kind)) &&
            Date.parse(candidate.granted_at) <= checkAtMs &&
            Date.parse(candidate.revocation_checked_at) <= checkAtMs &&
            checkAtMs - Date.parse(candidate.revocation_checked_at) <=
              CONSENT_REVOCATION_CHECK_MAX_AGE_MS &&
            (!candidate.expires_at || Date.parse(candidate.expires_at) > publishingAtMs) &&
            (!candidate.revoked_at || Date.parse(candidate.revoked_at) > publishingAtMs),
      );
      if (!consent) return [];
      const authorization: SocialApprovalAsset["authorization"] =
        consent.subject_basis === "adult"
          ? {
              authorization_basis: "consent_registry",
              subject_basis: "adult",
              consent_id: consent.consent_id,
              allowed_channels: [...consent.allowed_channels].sort(),
              allowed_media: [...consent.allowed_media].sort(),
              consent_reference_hash: hash(consent.evidence_reference),
              granted_at: consent.granted_at,
              ...(consent.expires_at ? { expires_at: consent.expires_at } : {}),
              ...(consent.revoked_at ? { revoked_at: consent.revoked_at } : {}),
              non_revoked_checked_at: consent.revocation_checked_at,
              authorization_evaluated_at: draftedAt,
            }
          : {
              authorization_basis: "consent_registry",
              subject_basis: "guardian",
              consent_id: consent.consent_id,
              allowed_channels: [...consent.allowed_channels].sort(),
              allowed_media: [...consent.allowed_media].sort(),
              consent_reference_hash: hash(consent.evidence_reference),
              granted_at: consent.granted_at,
              ...(consent.expires_at ? { expires_at: consent.expires_at } : {}),
              ...(consent.revoked_at ? { revoked_at: consent.revoked_at } : {}),
              non_revoked_checked_at: consent.revocation_checked_at,
              authorization_evaluated_at: draftedAt,
            };
      return [
        {
          ...base,
          authorization,
        },
      ];
    });
    if (
      anchorPost &&
      assetArtifacts &&
      assetArtifacts.length === anchorPost.asset_refs.length
    ) {
      const utm = `utm_source=${opportunity.platform}&utm_medium=organic_social&utm_campaign=ctf_growth_60d&utm_content=${proposalId}`;
      approvalScope = {
        lane: "organic_social",
        platform: opportunity.platform,
        account_id: opportunity.account_id,
        action: "publish",
        content_hash: hash(
          canonicalJson({
            draftContent: strategy.draftContent,
            callToAction: strategy.callToAction,
            audience: strategy.audience,
            assetArtifacts: assetArtifacts as unknown as JsonValue,
            utm,
            publishingAt: scheduledAt,
          }),
        ),
        copy_hash: hash(strategy.draftContent),
        asset_ids: anchorPost.asset_refs,
        asset_artifacts: assetArtifacts,
        call_to_action: strategy.callToAction,
        utm,
        audience: strategy.audience,
        publishing_at: scheduledAt,
        budget_usd: 0,
      };
    }
  } else if (opportunity?.kind === "contact_discovery" && opportunity.destination) {
    const intakenEvidence = intake.evidence
      .filter((entry) => opportunity.evidence_refs.includes(entry.artifact.evidence_id))
      .find((entry) => entry.artifact.lane === "contact_discovery");
    const artifact = intakenEvidence?.artifact;
    const record =
      artifact?.lane === "contact_discovery"
        ? artifact.payload.records.find(
            (candidate) => candidate.record_id === opportunity.record_id,
          )
        : undefined;
    const groupAdminRecord =
      record?.source_type === "public_group_admin" ||
      record?.subject_type === "public_group_admin";
    const groupRulesArtifact = record
      ? intake.groupRulesArtifacts.find(
          (candidate) =>
            candidate.evidenceId === artifact?.evidence_id &&
            candidate.recordId === record.record_id,
        )
      : undefined;
    const explicitlyRequestsGroupPost =
      record?.source_type === "public_group_admin" &&
      record.subject_type === "public_group_admin" &&
      record.permission_basis === "public_group_admin_channel" &&
      strategy.requiredApprovals.includes("join_or_post_group") &&
      record.group_rules_captured &&
      opportunity.group_rules_captured &&
      Boolean(record.group_rules_url) &&
      record.group_rules_url === opportunity.group_rules_url &&
      record.public_contact_channel === opportunity.destination &&
      Boolean(record.group_rules_content_sha256) &&
      record.group_rules_content_sha256 === groupRulesArtifact?.contentSha256 &&
      record.group_rules_content_sha256 ===
        groupRulesArtifact?.immutableArtifact.sha256 &&
      record.group_rules_byte_length === groupRulesArtifact?.byteLength &&
      record.group_rules_captured_at === groupRulesArtifact?.capturedAt &&
      record.group_rules_url === groupRulesArtifact?.sourceUrl;
    const action = groupAdminRecord
      ? explicitlyRequestsGroupPost
        ? "group_post"
        : undefined
      : /(?:^mailto:|@)/u.test(opportunity.destination)
          ? "email"
          : /^https?:\/\//u.test(opportunity.destination)
            ? "contact_form"
            : "direct_message";
    if (action) {
      approvalScope = {
        lane: "contact_discovery",
        action,
        destination: opportunity.destination,
        source_url: opportunity.source_url,
        identity_fingerprint: opportunity.identity_fingerprint,
        draft_hash: hash(strategy.draftContent),
        audience: strategy.audience,
        send_at: scheduledAt,
        ...(action === "group_post" && record?.group_rules_url
          ? {
              group_rules_url: record.group_rules_url,
              group_rules_artifact: {
                parent_evidence_id: artifact!.evidence_id,
                record_id: record.record_id,
                source_url: record.group_rules_url,
                immutable_sha256: groupRulesArtifact!.immutableArtifact.sha256,
                byte_length: groupRulesArtifact!.byteLength,
                captured_at: groupRulesArtifact!.capturedAt,
              },
            }
          : {}),
      };
    }
  } else if (opportunity?.kind === "seo_experiment") {
    // A model-written change specification is not a Git diff. Shadow v1 has no
    // production editor, so Search Console work remains a local draft until a
    // separately produced immutable diff artifact can supply the change hash.
    approvalScope = undefined;
  }

  return CanonicalStrategyProposalSchema.parse({
    proposal_id: proposalId,
    lane: strategy.lane,
    hypothesis: strategy.hypothesis,
    controlled_variable: strategy.controlledVariable,
    arm: strategy.proposedArm,
    primary_kpi: input.primaryKpi,
    measurement_window_days: measurementWindowDays[strategy.lane],
    evidence_refs: evidenceRefs,
    readiness: approvalScope ? "approval_ready" : "not_approval_ready",
    ...(approvalScope ? { approval_scope: approvalScope } : {}),
    external_action_status: "not_executed",
  });
}

function validateApprovalPackage(work: LaneWorkState): StrategyEvaluation {
  if (!work.strategy || !work.draft) {
    return {
      status: "quarantine",
      defects: [
        {
          code: "missing_approval",
          message: "A model strategy and deterministic action package are required",
          target: "approval",
        },
      ],
    };
  }
  // A passed local proposal is always reviewable. Only a package that claims
  // readiness for an external action must carry the exact approval boundary.
  if (work.draft.readiness !== "approval_ready") {
    return { status: "pass", defects: [] };
  }
  if (!work.draft.approval_scope) {
    return {
      status: "quarantine",
      defects: [
        {
          code: "missing_approval",
          message: "Approval-ready proposal is missing its exact action scope",
          target: "approval",
        },
      ],
    };
  }
  const required = new Set(work.strategy.requiredApprovals);
  const scope = work.draft.approval_scope;
  const missing: string[] = [];
  if (scope.lane === "organic_social") {
    const platformApproval =
      scope.platform === "instagram" ? "publish_instagram" : "publish_facebook";
    if (!required.has(platformApproval)) missing.push(platformApproval);
  } else if (scope.lane === "contact_discovery") {
    if (!required.has("send_outreach")) missing.push("send_outreach");
    if (scope.action === "group_post" && !required.has("join_or_post_group")) {
      missing.push("join_or_post_group");
    }
  } else {
    if (!required.has("merge_website_change")) missing.push("merge_website_change");
    if (!required.has("deploy_website_change")) missing.push("deploy_website_change");
  }
  return missing.length === 0
    ? { status: "pass", defects: [] }
    : {
        status: "repair",
        defects: missing.map((approval) => ({
          code: "missing_approval" as const,
          message: `Exact action package is missing required boundary ${approval}`,
          target: "approval" as const,
        })),
      };
}

export function createInitialGrowthRun(
  input: InitialGrowthRunInput,
  now = new Date(),
): GrowthWorkflowState {
  const startedAt = input.startedAt ?? now.toISOString();
  const canonical = GrowthGraphStateSchema.parse({
    schema_version: GRAPH_STATE_SCHEMA_VERSION,
    graph_version: GRAPH_VERSION,
    policy_version: POLICY_VERSION,
    prompt_version: input.promptVersion ?? PROMPT_VERSION,
    model_id: input.modelId ?? "injected-or-unspecified",
    tool_version: input.toolVersion ?? TOOL_VERSION,
    node_version: process.version,
    run_id: input.runId,
    thread_id: input.runId,
    idempotency_key: input.idempotencyKey,
    trigger_kind: input.triggerKind ?? "manual",
    objective_window: input.objectiveWindow ?? {
      start: "2026-08-08",
      end: "2026-10-07",
    },
    metric_definition_version:
      input.metricDefinitionVersion ?? METRIC_DEFINITION_VERSION,
    runtime_manifest_hash:
      input.runtimeManifestHash ??
      hash(`${GRAPH_VERSION}:${POLICY_VERSION}:${PROMPT_VERSION}:${TOOL_VERSION}`),
    capture_bundle_hash: input.expectedCaptureSha256,
    immutable_evidence: [],
    lane_analyses: [],
    proposals: [],
    evals: [],
    reviews: [],
    errors: [],
    repair_count: 0,
    model_calls: 0,
    tool_calls: 0,
    readback_verified: false,
    terminal_status: "running",
    next_safe_action: "Run the shadow graph against the immutable capture bundle.",
  });
  return {
    canonical,
    status: "queued",
    startedAt,
    completedAt: null,
    capturePath: resolve(input.capturePath),
    expectedCaptureSha256: input.expectedCaptureSha256,
    currentNode: "trigger",
    nodeStatuses: {},
    traversedEdges: [],
    intake: null,
    analysis: null,
    laneWork: {},
    currentLane: null,
    duplicateNoop: false,
    duplicateInProgress: false,
    persistence: {
      committed: false,
      verified: false,
      transactionId: null,
      readback: null,
    },
    errors: [],
    budget: {
      modelStarts: 0,
      toolCalls: 0,
      repairAttempts: 0,
      elapsedMs: 0,
    },
  };
}

export function createGrowthWorkflow(options: GrowthWorkflowOptions) {
  const now = options.now ?? (() => new Date());
  const modelTimeoutMs = Math.max(
    1_000,
    Math.min(60_000, Math.trunc(options.modelTimeoutMs ?? 45_000)),
  );
  const retryDelayMs = Math.max(
    0,
    Math.min(5_000, Math.trunc(options.retryDelayMs ?? 250)),
  );

  function event(
    state: GrowthWorkflowState,
    node: string,
    type: string,
    payload: JsonValue = {},
    attempt = 0,
  ): void {
    const idempotencyKey = `${state.canonical.run_id}:${node}:${type}:${hash(
      canonicalJson(payload),
    ).slice(0, 20)}`;
    options.ledger.appendEvent({
      eventId: `event-${hash(idempotencyKey).slice(0, 24)}`,
      runId: state.canonical.run_id,
      idempotencyKey,
      type,
      node,
      attempt,
      createdAt: state.startedAt,
      payload,
    });
  }

  function recordWorkflowError(
    state: GrowthWorkflowState,
    node: string,
    error: unknown,
    attempt: number,
    retryableOverride?: boolean,
    evidenceRefs: string[] = [],
    scope = state.currentLane ?? "portfolio",
  ): GraphError {
    const failure = classifyWorkflowError(error, node);
    const message = errorMessage(error);
    const fingerprint = hash(
      `${node}:${scope}:${error instanceof Error ? error.name : "Error"}:${message}`,
    );
    const graphError: GraphError = {
      error_id: `error-${fingerprint.slice(0, 24)}-${attempt}`,
      fingerprint,
      node,
      category: failure.category,
      attempt,
      retryable: retryableOverride ?? failure.retryable,
      message,
      evidence_refs: evidenceRefs,
    };
    const idempotencyKey = `error:${graphError.error_id}`;
    options.ledger.recordError({
      errorId: graphError.error_id,
      runId: state.canonical.run_id,
      idempotencyKey,
      fingerprint: graphError.fingerprint,
      node: graphError.node,
      category: graphError.category,
      attempt: graphError.attempt,
      retryable: graphError.retryable,
      message: graphError.message,
      evidenceRefs: graphError.evidence_refs,
      createdAt: state.startedAt,
    });
    return graphError;
  }

  function guarded(
    node: string,
    work: (
      state: GrowthWorkflowState,
    ) => Promise<Partial<GrowthWorkflowState>> | Partial<GrowthWorkflowState>,
  ) {
    return async (
      state: GrowthWorkflowState,
    ): Promise<Partial<GrowthWorkflowState>> => {
      try {
        options.failureInjection?.(node, "before", state);
        const update = await work(state);
        options.failureInjection?.(node, "after", { ...state, ...update });
        return update;
      } catch (error) {
        const alreadyLogged = Boolean(
          error &&
            typeof error === "object" &&
            (error as { ledgerLogged?: boolean }).ledgerLogged,
        );
        if (!alreadyLogged && state.canonical?.run_id) {
          const committed = options.ledger.readRun(
            state.canonical.run_id,
          )?.transaction;
          if (committed) {
            // The terminal transaction binds canonical row counts. A crash in
            // commit readback or projection must remain observable without
            // mutating those committed tables and invalidating exact replay.
            const failure = classifyWorkflowError(error, node);
            const message = errorMessage(error);
            const fingerprint = hash(
              `${node}:post_commit:${
                error instanceof Error ? error.name : "Error"
              }:${message}`,
            );
            const idempotencyKey = `post-commit-error:${node}:${fingerprint}`;
            options.ledger.appendEvent({
              eventId: `event-${hash(idempotencyKey).slice(0, 24)}`,
              runId: state.canonical.run_id,
              idempotencyKey,
              type: "workflow.post_commit_error",
              node,
              attempt: 1,
              createdAt: state.startedAt,
              payload: {
                category: failure.category,
                fingerprint,
                message,
                retryable: failure.retryable,
                transactionId: committed.transactionId,
              },
            });
          } else {
            recordWorkflowError(state, node, error, 1);
          }
        }
        throw error;
      }
    };
  }

  async function cachedModelCall<T>(input: {
    state: GrowthWorkflowState;
    node: "llm_strategy" | "eval" | "bounded_repair";
    cacheKey: string;
    request: JsonValue;
    parse: (value: unknown) => T;
    invoke: (signal: AbortSignal) => Promise<T>;
  }): Promise<T> {
    const outputKey = `${input.cacheKey}:output`;
    const cached = options.ledger.readCachedModelOutput(
      input.state.canonical.run_id,
      outputKey,
    );
    if (cached) return input.parse(cached.output);

    let priorStarts = 0;
    for (
      let attempt = 1;
      attempt <= MAXIMUM_PROVIDER_STARTS_PER_CALL;
      attempt += 1
    ) {
      if (
        options.ledger.findEventByIdempotencyKey(
          input.state.canonical.run_id,
          `${input.cacheKey}:attempt:${attempt}`,
        )
      ) {
        priorStarts = attempt;
      }
    }
    if (priorStarts >= MAXIMUM_PROVIDER_STARTS_PER_CALL) {
      throw new ModelRetryBudgetExceededError(
        `${input.node} exhausted its ${MAXIMUM_PROVIDER_STARTS_PER_CALL}-start provider budget`,
      );
    }

    const requestHash = hash(canonicalJson(input.request));
    for (
      let attempt = priorStarts + 1;
      attempt <= MAXIMUM_PROVIDER_STARTS_PER_CALL;
      attempt += 1
    ) {
      const attemptKey = `${input.cacheKey}:attempt:${attempt}`;
      options.ledger.appendEvent({
        eventId: `event-${hash(attemptKey).slice(0, 24)}`,
        runId: input.state.canonical.run_id,
        idempotencyKey: attemptKey,
        type: "model.call.started",
        node: input.node,
        attempt,
        createdAt: input.state.startedAt,
        payload: { cacheKey: input.cacheKey, requestHash },
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), modelTimeoutMs);
      try {
        const output = input.parse(await input.invoke(controller.signal));
        options.ledger.cacheModelOutput({
          cacheId: `cache-${hash(outputKey).slice(0, 24)}`,
          runId: input.state.canonical.run_id,
          idempotencyKey: outputKey,
          node: input.node,
          requestHash,
          modelId: input.state.canonical.model_id,
          createdAt: input.state.startedAt,
          output: output as JsonValue,
        });
        options.ledger.appendEvent({
          eventId: `event-${hash(`${outputKey}:completed`).slice(0, 24)}`,
          runId: input.state.canonical.run_id,
          idempotencyKey: `${outputKey}:completed`,
          type: "model.call.completed",
          node: input.node,
          attempt,
          createdAt: input.state.startedAt,
          payload: { cacheKey: input.cacheKey, requestHash },
        });
        return output;
      } catch (caught) {
        const error = controller.signal.aborted
          ? new ModelCallTimeoutError(
              `${input.node} exceeded its ${modelTimeoutMs}ms model timeout`,
              { cause: caught },
            )
          : caught;
        const failure = classifyWorkflowError(error, input.node);
        const finalAttempt =
          attempt >= MAXIMUM_PROVIDER_STARTS_PER_CALL || !failure.retryable;
        recordWorkflowError(
          input.state,
          input.node,
          error,
          attempt,
          failure.retryable && !finalAttempt,
          [],
          input.cacheKey,
        );
        if (finalAttempt) {
          const thrown = error instanceof Error ? error : new Error(String(error));
          Object.defineProperty(thrown, "ledgerLogged", { value: true });
          throw thrown;
        }
        if (retryDelayMs > 0) {
          await new Promise<void>((resolveDelay) =>
            setTimeout(resolveDelay, retryDelayMs * attempt),
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ModelRetryBudgetExceededError("Unreachable model retry state");
  }

  const trigger = guarded("trigger", (state) => {
    const result = options.ledger.beginRun({
      runId: state.canonical.run_id,
      threadId: state.canonical.thread_id,
      idempotencyKey: state.canonical.idempotency_key,
      workflowName: GRAPH_VERSION,
      policyHash: hash(`${POLICY_VERSION}:${GRAPH_VERSION}`),
      runtimeHash: state.canonical.runtime_manifest_hash,
      captureBundleHash: state.expectedCaptureSha256,
      startedAt: state.startedAt,
      triggerKind: state.canonical.trigger_kind,
    });
    if (result.outcome === "replayed") {
      const snapshot = options.ledger.readRun(result.run.runId);
      const existingTransaction = snapshot?.transaction ?? null;
      // beginRun is intentionally durable before the first LangGraph checkpoint.
      // If the process dies in that narrow window, the same run must continue;
      // only a different run that reuses the semantic idempotency key is a
      // duplicate no-op. A committed same-run replay is also terminal and can be
      // rehydrated through the duplicate projection below.
      if (
        result.run.runId === state.canonical.run_id &&
        !existingTransaction
      ) {
        event(state, "trigger", "run.resumed_before_checkpoint", {
          triggerKind: result.run.triggerKind,
        });
        return finishNode(state, "trigger", {
          duplicateNoop: false,
          status: "running",
          startedAt: result.run.startedAt,
          canonical: canonicalUpdate(state, {
            run_id: result.run.runId,
            thread_id: result.run.threadId,
            trigger_kind: result.run.triggerKind,
            runtime_manifest_hash: result.run.runtimeHash,
            capture_bundle_hash: result.run.captureBundleHash,
          }),
        });
      }
      if (!existingTransaction) {
        return finishNode(state, "trigger", {
          duplicateNoop: true,
          duplicateInProgress: true,
          status: "blocked",
          startedAt: result.run.startedAt,
          canonical: canonicalUpdate(state, {
            run_id: result.run.runId,
            thread_id: result.run.threadId,
            trigger_kind: result.run.triggerKind,
            runtime_manifest_hash: result.run.runtimeHash,
            capture_bundle_hash: result.run.captureBundleHash,
            terminal_status: "running",
            next_safe_action: `Run ${result.run.runId} already owns this idempotency key and is still in progress. Resume that run; no duplicate run or external action was created.`,
          }),
        });
      }
      const verifiedTransaction = options.ledger.assertReadback(
        result.run.runId,
        existingTransaction,
      ).transaction;
      if (!verifiedTransaction) {
        throw new Error("Committed duplicate transaction failed canonical readback");
      }
      const proposals = (snapshot?.experiments ?? []).map((experiment) =>
        CanonicalStrategyProposalSchema.parse(experiment.payload),
      );
      const evals = (snapshot?.evals ?? []).map((evaluation) => ({
        eval_id: evaluation.evalId,
        proposal_id: evaluation.proposalId,
        lane: evaluation.lane,
        verdict: evaluation.verdict,
        defects: evaluation.defects,
        repair_count: evaluation.repairCount,
        evidence_refs: evaluation.evidenceRefs,
      }));
      const reviews = (snapshot?.reviews ?? []).map((review) =>
        HumanReviewSchema.parse({
          review_id: review.reviewId,
          proposal_id: review.proposalId,
          lane: review.lane,
          review_kind: review.reviewKind,
          status: review.status,
          approval_hash: review.approvalHash,
          approval_package: review.approvalPackage,
          requested_at: review.requestedAt,
        }),
      );
      const errors = (snapshot?.errors ?? []).map((error) => ({
        error_id: error.errorId,
        fingerprint: error.fingerprint,
        node: error.node,
        category: error.category,
        attempt: error.attempt,
        retryable: error.retryable,
        message: error.message,
        evidence_refs: error.evidenceRefs,
        ...(error.resolution ? { resolution: error.resolution } : {}),
      }));
      return finishNode(state, "trigger", {
        duplicateNoop: true,
        duplicateInProgress: false,
        status: "duplicate_noop",
        startedAt: result.run.startedAt,
        canonical: canonicalUpdate(state, {
          run_id: result.run.runId,
          thread_id: result.run.threadId,
          trigger_kind: result.run.triggerKind,
          runtime_manifest_hash: result.run.runtimeHash,
          capture_bundle_hash: result.run.captureBundleHash,
          proposals,
          evals,
          reviews,
          errors,
          model_calls:
            snapshot?.events.filter((entry) => entry.type === "model.call.started")
              .length ?? 0,
          transaction_id: existingTransaction.transactionId,
          readback_verified: true,
          terminal_status: existingTransaction.terminalStatus,
          next_safe_action: `Duplicate trigger resolved to existing run ${result.run.runId}; no new run or external action was created.`,
        }),
        persistence: {
          committed: true,
          verified: true,
          transactionId: existingTransaction.transactionId,
          readback: existingTransaction,
        },
      });
    }
    event(state, "trigger", "run.started", {
      triggerKind: state.canonical.trigger_kind,
    });
    return finishNode(state, "trigger", { status: "running" });
  });

  const preflight = guarded("preflight", async (state) => {
    GrowthGraphStateSchema.parse(state.canonical);
    const confinedCapturePath = await resolveConfinedCapturePath(
      options.evidenceRoot,
      state.capturePath,
    );
    if (options.policyManifestPaths?.length) {
      const currentHash = await computeRuntimeManifestHash(
        options.policyManifestPaths,
        options.runtimeManifest ?? {},
      );
      if (currentHash !== state.canonical.runtime_manifest_hash) {
        throw new ArtifactPolicyError(
          "Runtime policy, prompt, model, or tool manifest differs from the run",
        );
      }
    }
    event(state, "preflight", "preflight.passed", {
      graphVersion: state.canonical.graph_version,
      policyVersion: state.canonical.policy_version,
      promptVersion: state.canonical.prompt_version,
      modelId: state.canonical.model_id,
      runtimeManifestHash: state.canonical.runtime_manifest_hash,
    });
    return finishNode(state, "preflight", { capturePath: confinedCapturePath });
  });

  const capture = guarded("capture", async (state) => {
    const intake = await intakeCaptureBundle({
      captureBundlePath: state.capturePath,
      allowedEvidenceRoot: options.evidenceRoot,
      runArtifactRoot: join(
        resolve(options.paths.stateRoot),
        "runs",
        state.canonical.run_id,
      ),
      runAt: state.startedAt,
      allowSyntheticEvidence: options.allowSyntheticEvidence === true,
    });
    if (intake.bundleArtifact.sha256 !== state.expectedCaptureSha256) {
      throw new ArtifactConflictError(
        "Immutable capture artifact differs from the preflight bytes",
      );
    }
    const immutableEvidence = [
      intake.bundleArtifact,
      ...intake.evidence.map((entry) => entry.immutableArtifact),
    ];
    event(state, "capture", "capture.intaken", {
      bundleId: intake.bundle.bundle_id,
      intakeHash: intake.intakeHash,
      evidenceCount: intake.evidence.length,
    });
    return finishNode(state, "capture", {
      intake,
      canonical: canonicalUpdate(state, {
        capture_bundle_hash: intake.bundleArtifact.sha256,
        immutable_evidence: immutableEvidence,
        tool_calls: state.canonical.tool_calls + 1,
      }),
      budget: { ...state.budget, toolCalls: state.budget.toolCalls + 1 },
    });
  });

  const validate = guarded("validate", (state) => {
    if (!state.intake) throw new Error("Immutable capture intake is missing");
    const { bundle } = state.intake;
    if (
      bundle.objective_window.start !== state.canonical.objective_window.start ||
      bundle.objective_window.end !== state.canonical.objective_window.end
    ) {
      throw new ArtifactPolicyError(
        "Capture objective window does not match the run objective window",
      );
    }
    if (
      bundle.metric_definition_version !==
      state.canonical.metric_definition_version
    ) {
      throw new ArtifactPolicyError(
        "Capture metric-definition version does not match the run",
      );
    }
    const artifactIds = new Set(
      state.intake.evidence.map((entry) => entry.artifact.evidence_id),
    );
    if (artifactIds.size !== bundle.evidence.length) {
      throw new ArtifactConflictError(
        "Validated evidence count does not match capture declarations",
      );
    }
    event(state, "validate", "capture.validated", {
      sourceRunCount: bundle.source_runs.length,
      evidenceCount: bundle.evidence.length,
      lanes: [...new Set(bundle.evidence.map((entry) => entry.lane))],
    });
    return finishNode(state, "validate");
  });

  const dataAnalysis = guarded("data_analysis", (state) => {
    if (!state.intake) throw new Error("Validated capture intake is missing");
    const analysis = analyzeGrowthPortfolio({
      bundle: state.intake.bundle,
      evidence: state.intake.evidence.map((entry) => entry.artifact),
      runAt: state.startedAt,
    });
    const laneWork = Object.fromEntries(
      analysis.lanes.map((lane) => {
        const strategyInput = buildLaneStrategyInput(lane, state.intake!);
        const eligible =
          lane.status === "eligible" && lane.opportunities.length === 1;
        return [
          lane.lane,
          {
            lane: lane.lane,
            status:
              lane.status === "quarantined"
                ? "quarantined"
                : eligible
                  ? "pending"
                  : "skipped",
            strategyInput,
            strategy: null,
            draft: null,
            evaluation: null,
            priorDefects: [],
            defectFingerprints: [],
            repairCount: 0,
          } satisfies LaneWorkState,
        ];
      }),
    ) as Partial<Record<GrowthLane, LaneWorkState>>;
    const currentLane = nextPendingLane(laneWork);
    event(state, "data_analysis", "portfolio.analyzed", {
      overallStatus: analysis.overall_status,
      lanes: analysis.lanes.map((lane) => ({
        lane: lane.lane,
        status: lane.status,
        decision: lane.decision,
        opportunityCount: lane.opportunities.length,
      })),
    });
    return finishNode(state, "data_analysis", {
      analysis,
      laneWork,
      currentLane,
      canonical: canonicalUpdate(state, {
        lane_analyses: [...analysis.lanes],
        tool_calls: state.canonical.tool_calls + 1,
      }),
      budget: { ...state.budget, toolCalls: state.budget.toolCalls + 1 },
    });
  });

  const llmStrategy = guarded("llm_strategy", async (state) => {
    const work = currentLaneWork(state);
    const attempt = work.repairCount + 1;
    const request = {
      input: work.strategyInput,
      priorDefects: work.priorDefects,
      attempt,
    } as unknown as JsonValue;
    const strategy = await cachedModelCall({
      state,
      node: "llm_strategy",
      cacheKey: `${state.canonical.run_id}:strategy:${work.lane}:repair:${work.repairCount}`,
      request,
      parse: (value) => AgentStrategyProposalSchema.parse(value),
      invoke: (signal) =>
        options.strategist({
          input: work.strategyInput,
          priorDefects: work.priorDefects,
          attempt,
          signal,
        }),
    });
    const replacement: LaneWorkState = {
      ...work,
      strategy,
      status: "strategy_ready",
    };
    const modelCalls = options.ledger.countEvents(
      state.canonical.run_id,
      "model.call.started",
    );
    event(state, "llm_strategy", "strategy.proposed", {
      lane: work.lane,
      attempt,
      decision: strategy.decision,
      controlledVariable: strategy.controlledVariable,
    });
    return finishNode(state, "llm_strategy", {
      laneWork: replaceLaneWork(state, replacement),
      canonical: canonicalUpdate(state, { model_calls: modelCalls }),
      budget: { ...state.budget, modelStarts: modelCalls },
    });
  });

  const actionDraft = guarded("action_draft", (state) => {
    const work = currentLaneWork(state);
    if (!work.strategy) throw new Error("Agent strategy output is missing");
    const draft = createActionDraft(
      state.canonical.run_id,
      work.strategyInput,
      work.strategy,
      currentLaneAnalysis(state),
      state.intake!,
      state.startedAt,
    );
    const replacement: LaneWorkState = {
      ...work,
      draft,
      status: "drafted",
    };
    event(state, "action_draft", "draft.created", {
      proposalId: draft.proposal_id,
      lane: draft.lane,
      externalActionStatus: draft.external_action_status,
    });
    return finishNode(state, "action_draft", {
      laneWork: replaceLaneWork(state, replacement),
      canonical: canonicalUpdate(state, {
        proposals: replaceProposal(state.canonical.proposals, draft),
        tool_calls: state.canonical.tool_calls + 1,
      }),
      budget: { ...state.budget, toolCalls: state.budget.toolCalls + 1 },
    });
  });

  const evaluate = guarded("eval", async (state) => {
    const work = currentLaneWork(state);
    if (!work.strategy || !work.draft) {
      throw new Error("Strategy and deterministic draft are required for eval");
    }
    const strategyValidation = validateStrategyProposal(
      work.strategyInput,
      work.strategy,
    );
    const approvalValidation = validateApprovalPackage(work);
    const deterministic: StrategyEvaluation = {
      status:
        approvalValidation.status === "quarantine" ||
        strategyValidation.status === "quarantine"
          ? "quarantine"
          : strategyValidation.status === "pass" &&
              approvalValidation.status === "pass"
            ? "pass"
            : "repair",
      defects: [
        ...strategyValidation.defects,
        ...approvalValidation.defects,
      ],
    };
    const evaluation =
      deterministic.status === "pass"
        ? await cachedModelCall({
            state,
            node: "eval",
            cacheKey: `${state.canonical.run_id}:eval:${work.lane}:repair:${work.repairCount}`,
            request: {
              input: work.strategyInput,
              proposal: work.strategy,
            } as unknown as JsonValue,
            parse: (value) => StrategyEvaluationSchema.parse(value),
            invoke: (signal) =>
              options.evaluator(work.strategyInput, work.strategy!, { signal }),
          })
        : deterministic;
    const defectFingerprints = evaluation.defects.map((defect) =>
      hash(`${defect.code}:${defect.target}`),
    );
    const repeatedDefect = defectFingerprints.some((fingerprint) =>
      work.defectFingerprints.includes(fingerprint),
    );
    const mustQuarantine =
      evaluation.status === "quarantine" ||
      repeatedDefect ||
      (evaluation.status === "repair" &&
        work.repairCount >= MAXIMUM_REPAIRS_PER_LANE);
    const status: LaneWorkState["status"] =
      evaluation.status === "pass"
        ? "passed"
        : mustQuarantine
          ? "quarantined"
          : "needs_repair";
    const replacement: LaneWorkState = {
      ...work,
      evaluation: mustQuarantine
        ? { ...evaluation, status: "quarantine" }
        : evaluation,
      status,
      priorDefects: evaluation.defects,
      defectFingerprints: [
        ...new Set([...work.defectFingerprints, ...defectFingerprints]),
      ],
    };
    const evalId = `eval-${hash(
      `${state.canonical.run_id}:${work.draft.proposal_id}:${work.repairCount}:${
        replacement.evaluation?.status ?? evaluation.status
      }`,
    ).slice(0, 24)}`;
    const finding: EvalFinding = {
      eval_id: evalId,
      proposal_id: work.draft.proposal_id,
      lane: work.lane,
      verdict: replacement.evaluation?.status ?? evaluation.status,
      defects: evaluation.defects.map(
        (defect) => `${defect.code}:${defect.target}:${defect.message}`,
      ),
      repair_count: work.repairCount,
      evidence_refs: work.draft.evidence_refs,
    };
    const modelCalls = options.ledger.countEvents(
      state.canonical.run_id,
      "model.call.started",
    );
    event(state, "eval", "proposal.evaluated", {
      evalId,
      lane: work.lane,
      verdict: finding.verdict,
      defectCount: finding.defects.length,
      repeatedDefect,
    });
    return finishNode(state, "eval", {
      laneWork: replaceLaneWork(state, replacement),
      canonical: canonicalUpdate(state, {
        evals: state.canonical.evals.some((entry) => entry.eval_id === evalId)
          ? state.canonical.evals
          : [...state.canonical.evals, finding],
        model_calls: modelCalls,
      }),
      budget: { ...state.budget, modelStarts: modelCalls },
    });
  });

  const boundedRepair = guarded("bounded_repair", async (state) => {
    const work = currentLaneWork(state);
    if (work.status !== "needs_repair") {
      throw new Error("Bounded repair requires a targeted evaluator defect");
    }
    if (work.repairCount >= MAXIMUM_REPAIRS_PER_LANE) {
      throw new Error("Bounded repair count exceeded policy");
    }
    const repairCount = work.repairCount + 1;
    const request = {
      input: work.strategyInput,
      priorDefects: work.priorDefects,
      attempt: repairCount + 1,
    } as unknown as JsonValue;
    const strategy = await cachedModelCall({
      state,
      node: "bounded_repair",
      cacheKey: `${state.canonical.run_id}:strategy:${work.lane}:repair:${repairCount}`,
      request,
      parse: (value) => AgentStrategyProposalSchema.parse(value),
      invoke: (signal) =>
        options.strategist({
          input: work.strategyInput,
          priorDefects: work.priorDefects,
          attempt: repairCount + 1,
          signal,
        }),
    });
    const draft = createActionDraft(
      state.canonical.run_id,
      work.strategyInput,
      strategy,
      currentLaneAnalysis(state),
      state.intake!,
      state.startedAt,
    );
    const replacement: LaneWorkState = {
      ...work,
      strategy,
      draft,
      evaluation: null,
      repairCount,
      status: "drafted",
    };
    const modelCalls = options.ledger.countEvents(
      state.canonical.run_id,
      "model.call.started",
    );
    event(state, "bounded_repair", "proposal.repaired", {
      lane: work.lane,
      proposalId: draft.proposal_id,
      repairCount,
      targetedDefects: work.priorDefects.map((defect) => defect.code),
    });
    return finishNode(state, "bounded_repair", {
      laneWork: replaceLaneWork(state, replacement),
      canonical: canonicalUpdate(state, {
        proposals: replaceProposal(state.canonical.proposals, draft),
        repair_count: state.canonical.repair_count + 1,
        model_calls: modelCalls,
        tool_calls: state.canonical.tool_calls + 1,
      }),
      budget: {
        ...state.budget,
        modelStarts: modelCalls,
        repairAttempts: state.budget.repairAttempts + 1,
        toolCalls: state.budget.toolCalls + 1,
      },
    });
  });

  const humanReview = guarded("human_review", (state) => {
    const work = currentLaneWork(state);
    if (
      work.status !== "passed" ||
      !work.draft ||
      !work.strategy
    ) {
      throw new Error("Human review requires a passed local draft");
    }
    const reviewKind =
      work.draft.readiness === "approval_ready" && work.draft.approval_scope
        ? "external_action_approval"
        : "proposal_review";
    const draftKind =
      work.lane === "organic_social"
        ? "social_copy"
        : work.lane === "contact_discovery"
          ? "contact_outreach"
          : "seo_change_spec";
    const draftContentHash = hash(work.strategy.draftContent);
    const approvalPackage = ApprovalPackageSchema.parse({
      schema_version: APPROVAL_PACKAGE_SCHEMA_VERSION,
      evidence_mode: evidenceMode(state.intake) === "synthetic" ? "synthetic" : "real",
      review_kind: reviewKind,
      proposal: work.draft,
      draft_content: {
        kind: draftKind,
        content: work.strategy.draftContent,
        content_sha256: draftContentHash,
        redaction_status:
          evidenceMode(state.intake) === "synthetic" ? "synthetic" : "redacted",
      },
      maturity_rule: {
        minimum_age_hours: work.lane === "organic_social" ? 72 : 0,
        minimum_comparable_executions_per_arm:
          work.lane === "organic_social" ? 3 : 1,
        measurement_window_days: work.draft.measurement_window_days,
      },
      comparison_rule: {
        primary_kpi: work.draft.primary_kpi,
        baseline_reference: `baseline-${hash(work.strategyInput.baselineSummary).slice(0, 24)}`,
        evidence_refs: work.draft.evidence_refs,
      },
      stop_rules: [work.strategy.stopRule],
      scale_rules: [work.strategy.scaleRule],
      required_approvals:
        reviewKind === "proposal_review"
          ? ["proposal_review"]
          : [
              work.lane === "organic_social"
                ? "publish"
                : work.lane === "contact_discovery"
                  ? "send"
                  : "merge_deploy",
            ],
      external_action_status: "not_executed",
    });
    const approvalHash = approvalPackageHash(approvalPackage);
    const review: HumanReview = HumanReviewSchema.parse({
      review_id: `review-${hash(work.draft.proposal_id).slice(0, 24)}`,
      proposal_id: work.draft.proposal_id,
      lane: work.lane,
      review_kind: reviewKind,
      status: "awaiting_review",
      approval_hash: approvalHash,
      approval_package: approvalPackage,
      requested_at: state.startedAt,
    });
    const replacement: LaneWorkState = {
      ...work,
      status: "awaiting_review",
    };
    const laneWork = replaceLaneWork(state, replacement);
    const currentLane = nextPendingLane(laneWork);
    event(state, "human_review", "review.awaiting", {
      reviewId: review.review_id,
      proposalId: review.proposal_id,
      lane: review.lane,
      reviewKind: review.review_kind,
      externalActionStatus: "not_executed",
    });
    return finishNode(state, "human_review", {
      laneWork,
      currentLane,
      canonical: canonicalUpdate(state, {
        reviews: state.canonical.reviews.some(
          (entry) => entry.review_id === review.review_id,
        )
          ? state.canonical.reviews
          : [...state.canonical.reviews, review],
        terminal_status: "awaiting_review",
        next_safe_action:
          "Inspect the exact local proposal and approval hash; no external action has occurred.",
      }),
    });
  });

  const quarantine = guarded("quarantine", (state) => {
    const work = currentLaneWork(state);
    const replacement: LaneWorkState = { ...work, status: "quarantined" };
    const laneWork = replaceLaneWork(state, replacement);
    const currentLane = nextPendingLane(laneWork);
    event(state, "quarantine", "proposal.quarantined", {
      lane: work.lane,
      proposalId: work.draft?.proposal_id ?? null,
      defects: work.evaluation?.defects.map((defect) => defect.code) ?? [],
    });
    return finishNode(state, "quarantine", { laneWork, currentLane });
  });

  function terminalOutcome(state: GrowthWorkflowState): {
    terminalStatus: "awaiting_review" | "complete" | "partial";
    workflowStatus: WorkflowStatus;
    nextSafeAction: string;
  } {
    const hasQuarantine = Object.values(state.laneWork).some(
      (work) => work?.status === "quarantined",
    );
    if (hasQuarantine || state.analysis?.overall_status !== "eligible") {
      const pendingReviews = state.canonical.reviews.length;
      return {
        terminalStatus: "partial",
        workflowStatus: "partial",
        nextSafeAction:
          pendingReviews > 0
            ? `Inspect ${pendingReviews} hash-bound review package${pendingReviews === 1 ? "" : "s"}, and repair the quarantined or incomplete lanes before a new immutable shadow capture. No external action has occurred.`
            : "Repair the recorded evidence, baseline, maturity, privacy, or exact-package gaps, then run a new immutable shadow capture.",
      };
    }
    if (state.canonical.reviews.length > 0) {
      return {
        terminalStatus: "awaiting_review",
        workflowStatus: "awaiting_review",
        nextSafeAction:
          "Inspect each hashed proposal-review package. Awaiting review is not approval and no external action has occurred.",
      };
    }
    return {
      terminalStatus: "complete",
      workflowStatus: "complete",
      nextSafeAction:
        "Review the verified local analysis; no external action is pending.",
    };
  }

  function canonicalErrorsFromLedger(state: GrowthWorkflowState): GraphError[] {
    const snapshot = options.ledger.readRun(state.canonical.run_id);
    const ledgerErrors = snapshot?.errors ?? [];
    const merged = new Map(
      state.canonical.errors.map((error) => [error.error_id, error]),
    );
    for (const error of ledgerErrors) {
      merged.set(error.errorId, {
        error_id: error.errorId,
        fingerprint: error.fingerprint,
        node: error.node,
        category: error.category,
        attempt: error.attempt,
        retryable: error.retryable,
        message: error.message,
        evidence_refs: error.evidenceRefs,
        ...(error.resolution ? { resolution: error.resolution } : {}),
      });
    }
    return [...merged.values()].sort((left, right) =>
      left.error_id.localeCompare(right.error_id),
    );
  }

  function outboxDrafts(state: GrowthWorkflowState): LedgerOutboxInput[] {
    return state.canonical.proposals
      .filter((proposal) =>
        state.canonical.reviews.some(
          (review) => review.proposal_id === proposal.proposal_id,
        ),
      )
      .map((proposal) => {
      const kind: LedgerOutboxInput["kind"] =
        proposal.lane === "organic_social"
          ? "social_draft"
          : proposal.lane === "contact_discovery"
            ? "outreach_draft"
            : "seo_change_draft";
      const review = state.canonical.reviews.find(
        (candidate) => candidate.proposal_id === proposal.proposal_id,
      );
      const exactDraftContent =
        review?.approval_package.draft_content.content ??
        state.laneWork[proposal.lane]?.strategy?.draftContent;
      const contentHash = exactDraftContent
        ? hash(exactDraftContent)
        : hash(canonicalJson(proposal as unknown as JsonValue));
      const payload = {
        proposal,
        ...(review
          ? {
              review: {
                review_id: review.review_id,
                review_kind: review.review_kind,
                approval_hash: review.approval_hash,
                approval_package: review.approval_package,
              },
            }
          : exactDraftContent
            ? {
                draft_content: {
                  content: exactDraftContent,
                  content_sha256: contentHash,
                },
              }
            : {}),
      };
      return {
        outboxId: `outbox-${hash(proposal.proposal_id).slice(0, 24)}`,
        idempotencyKey: `outbox:${proposal.proposal_id}`,
        lane: proposal.lane,
        kind,
        contentHash,
        status: "draft",
        createdAt: state.startedAt,
        payload: payload as unknown as JsonValue,
      };
      });
  }

  const commit = guarded("commit", (state) => {
    if (!state.intake || !state.analysis) {
      throw new Error("Capture intake and portfolio analysis are required for commit");
    }
    const outcome = terminalOutcome(state);
    const errors = canonicalErrorsFromLedger(state);
    const transactionId = `transaction-${hash(
      `${state.canonical.run_id}:${GRAPH_VERSION}:portfolio`,
    ).slice(0, 24)}`;
    const commitInput = buildPortfolioCommitInput({
      transactionId,
      runId: state.canonical.run_id,
      committedAt: state.startedAt,
      terminalStatus: outcome.terminalStatus,
      nextSafeAction: outcome.nextSafeAction,
      intake: state.intake,
      analysis: state.analysis,
      proposals: state.canonical.proposals,
      evals: state.canonical.evals,
      reviews: state.canonical.reviews,
      errors,
      outbox: outboxDrafts(state),
    });
    const readback = options.ledger.commitPortfolio(commitInput);
    event(state, "commit", "portfolio.committed", {
      transactionId,
      commitHash: readback.commitHash,
      counts: readback.counts as unknown as JsonValue,
    });
    return finishNode(state, "commit", {
      status: outcome.workflowStatus,
      canonical: canonicalUpdate(state, {
        errors,
        transaction_id: transactionId,
        terminal_status: outcome.terminalStatus,
        next_safe_action: outcome.nextSafeAction,
      }),
      persistence: {
        committed: true,
        verified: false,
        transactionId,
        readback,
      },
    });
  });

  const readback = guarded("readback", (state) => {
    if (!state.persistence.readback || !state.persistence.transactionId) {
      throw new Error("Committed transaction readback is missing");
    }
    const snapshot = options.ledger.assertReadback(
      state.canonical.run_id,
      state.persistence.readback,
    );
    if (
      snapshot.transaction?.transactionId !== state.persistence.transactionId ||
      snapshot.reviews.some(
        (review) =>
          approvalPackageHash(review.approvalPackage) !== review.approvalHash,
      )
    ) {
      throw new Error("Canonical transaction or review-package readback failed");
    }
    event(state, "readback", "portfolio.readback_verified", {
      transactionId: state.persistence.transactionId,
      commitHash: state.persistence.readback.commitHash,
      reviewPackageCount: snapshot.reviews.length,
    });
    return finishNode(state, "readback", {
      canonical: canonicalUpdate(state, { readback_verified: true }),
      persistence: { ...state.persistence, verified: true },
    });
  });

  function laneProjection(
    state: GrowthWorkflowState,
  ): Record<GrowthLane, ProjectStateLane> {
    return Object.fromEntries(
      LANE_ORDER.map((lane) => {
        const analysis = state.analysis?.lanes.find((entry) => entry.lane === lane);
        const work = state.laneWork[lane];
        return [
          lane,
          {
            status:
              analysis?.status === "quarantined"
                ? "quarantined"
                : work?.status ?? analysis?.status ?? "not_started",
            sourceCoverage: analysis?.source_coverage ?? "missing",
            evidenceCount: analysis?.evidence_refs.length ?? 0,
            baselineStatus:
              analysis?.metrics.length && analysis.metrics.every((metric) => metric.complete)
                ? "complete"
                : "gap",
            baselineSummary:
              work?.strategyInput.baselineSummary ??
              analysis?.issues.join("; ") ??
              "No baseline has been recorded.",
            maturityStatus:
              analysis?.status === "eligible" ? "mature" : "not_mature_or_incomplete",
            primaryKpi:
              work?.strategyInput.primaryKpi ??
              analysis?.metrics[0]?.metric_name ??
              "not_available",
            decision: analysis?.decision ?? "observe_more",
            proposalStatus:
              work?.status === "quarantined" ||
              analysis?.status === "quarantined"
                ? "quarantined:not_reviewable"
                : work?.draft
                  ? `${work.draft.readiness}:${work.draft.external_action_status}`
                  : "none",
            evalStatus: work?.evaluation?.status ?? "not_run",
            reviewStatus: state.canonical.reviews.some(
              (review) => review.lane === lane,
            )
              ? "awaiting_review"
              : "not_queued",
            nextSafeAction:
              work?.status === "quarantined" || analysis?.status === "quarantined"
                ? work?.evaluation?.defects[0]?.message ??
                  analysis?.issues[0] ??
                  "Inspect the quarantined evidence or proposal; it is not reviewable."
                : work?.status === "awaiting_review"
                ? "Inspect the hash-bound review package; this is not approval."
                : analysis?.issues[0] ?? "No lane action is pending.",
          } satisfies ProjectStateLane,
        ];
      }),
    ) as Record<GrowthLane, ProjectStateLane>;
  }

  function observerLanes(
    state: GrowthWorkflowState,
  ): Record<GrowthLane, ObserverLaneState> {
    const projected = laneProjection(state);
    return Object.fromEntries(
      LANE_ORDER.map((lane) => [
        lane,
        {
          status: projected[lane].status,
          evidenceCount: projected[lane].evidenceCount,
          baselineStatus: projected[lane].baselineStatus,
          maturityStatus: projected[lane].maturityStatus,
          proposalStatus: projected[lane].proposalStatus,
          evalStatus: projected[lane].evalStatus,
          reviewStatus: projected[lane].reviewStatus,
          sourceCoverage: projected[lane].sourceCoverage,
        },
      ]),
    ) as Record<GrowthLane, ObserverLaneState>;
  }

  const finalize = guarded("finalize", async (state) => {
    if (!state.duplicateNoop && !state.persistence.verified) {
      throw new Error("Final completion requires verified canonical readback");
    }
    const completedAt = now().toISOString();
    if (state.duplicateNoop) {
      if (!state.duplicateInProgress && !state.persistence.verified) {
        throw new Error("A committed duplicate no-op requires verified canonical readback");
      }
      // A duplicate trigger must never overwrite the original run's accurate
      // state/canvas with a partially rehydrated projection. The caller still
      // receives a terminal duplicate/no-op or blocked/in-progress result.
      return finishNode(state, "finalize", {
        status: state.duplicateInProgress ? "blocked" : "duplicate_noop",
        completedAt,
        budget: {
          ...state.budget,
          elapsedMs: Date.parse(completedAt) - Date.parse(state.startedAt),
        },
      });
    }
    const errors = canonicalErrorsFromLedger(state).map((error) => ({
      category: error.category,
      node: error.node,
      fingerprint: error.fingerprint,
      message: error.message,
      retryable: error.retryable,
      attempt: error.attempt,
    }));
    const status = state.status;
    const nodeStatuses = {
      ...state.nodeStatuses,
      finalize: "passed" as const,
    };
    const traversedEdges =
      state.currentNode === "finalize"
        ? state.traversedEdges
        : [
            ...new Set([
              ...state.traversedEdges,
              `${state.currentNode}->finalize`,
            ]),
          ];
    await writeProjectState(options.paths.projectStatePath, {
      runId: state.canonical.run_id,
      graphVersion: state.canonical.graph_version,
      policyVersion: state.canonical.policy_version,
      policyHash: state.canonical.runtime_manifest_hash,
      evidenceMode: evidenceMode(state.intake, state.canonical.reviews),
      status,
      startedAt: state.startedAt,
      completedAt,
      objectiveWindow: {
        startsAt: state.canonical.objective_window.start,
        endsAt: state.canonical.objective_window.end,
      },
      lanes: laneProjection(state),
      localPersistence: {
        committed: state.persistence.committed,
        verified: state.persistence.verified,
        transactionId: state.persistence.transactionId,
      },
      reviewCount: state.canonical.reviews.length,
      externalActionStatus: "not_executed",
      errors,
      nextSafeAction: state.canonical.next_safe_action,
    });
    const projection = buildObserverProjection(
      {
        runId: state.canonical.run_id,
        graphVersion: state.canonical.graph_version,
        policyVersion: state.canonical.policy_version,
        evidenceMode: evidenceMode(state.intake, state.canonical.reviews),
        status,
        currentNode: "finalize",
        startedAt: state.startedAt,
        completedAt,
        nodeStatuses,
        traversedEdges,
        lanes: observerLanes(state),
        evidenceCount: state.intake?.evidence.length ?? 0,
        proposalCount: state.canonical.proposals.length,
        reviewCount: state.canonical.reviews.length,
        errors,
        evals: state.canonical.evals as unknown as Array<Record<string, unknown>>,
        budget: {
          ...state.budget,
          elapsedMs: Date.parse(completedAt) - Date.parse(state.startedAt),
        },
      },
      completedAt,
    );
    await writeObserverProjection(options.paths.observerDirectory, projection);
    return finishNode(state, "finalize", {
      status,
      completedAt,
      errors,
      nodeStatuses,
      traversedEdges,
      budget: {
        ...state.budget,
        elapsedMs: Date.parse(completedAt) - Date.parse(state.startedAt),
      },
    });
  });

  return new StateGraph(GrowthWorkflowAnnotation)
    .addNode("trigger", trigger)
    .addNode("preflight", preflight)
    .addNode("capture", capture)
    .addNode("validate", validate)
    .addNode("data_analysis", dataAnalysis)
    .addNode("llm_strategy", llmStrategy)
    .addNode("action_draft", actionDraft)
    .addNode("eval", evaluate)
    .addNode("bounded_repair", boundedRepair)
    .addNode("human_review", humanReview)
    .addNode("quarantine", quarantine)
    .addNode("commit", commit)
    .addNode("readback", readback)
    .addNode("finalize", finalize)
    .addEdge(START, "trigger")
    .addConditionalEdges(
      "trigger",
      (state) => (state.duplicateNoop ? "duplicate" : "continue"),
      { duplicate: "finalize", continue: "preflight" },
    )
    .addEdge("preflight", "capture")
    .addEdge("capture", "validate")
    .addEdge("validate", "data_analysis")
    .addConditionalEdges(
      "data_analysis",
      (state) => (state.currentLane ? "strategy" : "commit"),
      { strategy: "llm_strategy", commit: "commit" },
    )
    .addEdge("llm_strategy", "action_draft")
    .addEdge("action_draft", "eval")
    .addConditionalEdges(
      "eval",
      (state) => {
        const work = currentLaneWork(state);
        return work.status === "passed"
          ? "review"
          : work.status === "needs_repair"
            ? "repair"
            : "quarantine";
      },
      {
        review: "human_review",
        repair: "bounded_repair",
        quarantine: "quarantine",
      },
    )
    .addEdge("bounded_repair", "eval")
    .addConditionalEdges(
      "human_review",
      (state) => (state.currentLane ? "strategy" : "commit"),
      { strategy: "llm_strategy", commit: "commit" },
    )
    .addConditionalEdges(
      "quarantine",
      (state) => (state.currentLane ? "strategy" : "commit"),
      { strategy: "llm_strategy", commit: "commit" },
    )
    .addEdge("commit", "readback")
    .addEdge("readback", "finalize")
    .addEdge("finalize", END)
    .compile({ checkpointer: options.checkpointer });
}

export async function writeGrowthFailureProjections(
  state: GrowthWorkflowState,
  options: Pick<GrowthWorkflowOptions, "ledger" | "paths">,
): Promise<void> {
  const snapshot = options.ledger.readRun(state.canonical.run_id);
  const errors = (snapshot?.errors ?? []).map((error) => ({
    category: error.category,
    node: error.node,
    fingerprint: error.fingerprint,
    message: error.message,
    retryable: error.retryable,
    attempt: error.attempt,
  }));
  const lastError = errors.at(-1);
  const failedNode = lastError?.node ?? state.currentNode;
  const nextSafeAction = lastError?.retryable
    ? `Inspect the ${failedNode} error and resume this run within its recorded retry budget.`
    : `Fix the permanent ${failedNode} input or policy defect, then start a new immutable run.`;
  const lanes = Object.fromEntries(
    LANE_ORDER.map((lane) => [
      lane,
      {
        status: state.laneWork[lane]?.status ?? "not_started",
        sourceCoverage:
          state.analysis?.lanes.find((entry) => entry.lane === lane)
            ?.source_coverage ?? "missing",
        evidenceCount:
          state.analysis?.lanes.find((entry) => entry.lane === lane)?.evidence_refs
            .length ?? 0,
        baselineStatus: "unknown",
        baselineSummary: "Run did not reach a verified terminal projection.",
        maturityStatus: "unknown",
        primaryKpi:
          state.laneWork[lane]?.strategyInput.primaryKpi ?? "not_available",
        decision:
          state.analysis?.lanes.find((entry) => entry.lane === lane)?.decision ??
          "observe_more",
        proposalStatus: state.laneWork[lane]?.draft?.readiness ?? "none",
        evalStatus: state.laneWork[lane]?.evaluation?.status ?? "not_run",
        reviewStatus: "not_verified",
        nextSafeAction,
      } satisfies ProjectStateLane,
    ]),
  ) as Record<GrowthLane, ProjectStateLane>;
  await writeProjectState(options.paths.projectStatePath, {
    runId: state.canonical.run_id,
    graphVersion: state.canonical.graph_version,
    policyVersion: state.canonical.policy_version,
    policyHash: state.canonical.runtime_manifest_hash,
    evidenceMode: evidenceMode(state.intake, state.canonical.reviews),
    status: lastError?.retryable ? "failed_pending_resume" : "failed",
    startedAt: state.startedAt,
    completedAt: snapshot?.transaction?.committedAt ?? null,
    objectiveWindow: {
      startsAt: state.canonical.objective_window.start,
      endsAt: state.canonical.objective_window.end,
    },
    lanes,
    localPersistence: {
      committed: Boolean(snapshot?.transaction),
      verified: state.persistence.verified,
      transactionId: snapshot?.transaction?.transactionId ?? null,
    },
    reviewCount: snapshot?.reviews.length ?? 0,
    externalActionStatus: "not_executed",
    errors,
    nextSafeAction,
  });
  await writeObserverArtifacts(
    {
      runId: state.canonical.run_id,
      graphVersion: state.canonical.graph_version,
      policyVersion: state.canonical.policy_version,
      evidenceMode: evidenceMode(state.intake, state.canonical.reviews),
      status: lastError?.retryable ? "failed_pending_resume" : "failed",
      currentNode: failedNode,
      startedAt: state.startedAt,
      completedAt: snapshot?.transaction?.committedAt ?? null,
      nodeStatuses: {
        ...state.nodeStatuses,
        [failedNode]: "failed",
      },
      lanes: Object.fromEntries(
        Object.entries(lanes).map(([lane, value]) => [
          lane,
          {
            status: value.status,
            evidenceCount: value.evidenceCount,
            baselineStatus: value.baselineStatus,
            maturityStatus: value.maturityStatus,
            proposalStatus: value.proposalStatus,
            evalStatus: value.evalStatus,
            reviewStatus: value.reviewStatus,
            sourceCoverage: value.sourceCoverage,
          },
        ]),
      ),
      evidenceCount: state.intake?.evidence.length ?? 0,
      proposalCount: state.canonical.proposals.length,
      reviewCount: snapshot?.reviews.length ?? 0,
      errors,
      evals: state.canonical.evals as unknown as Array<Record<string, unknown>>,
      budget: state.budget,
    },
    options.paths.observerDirectory,
  );
}
