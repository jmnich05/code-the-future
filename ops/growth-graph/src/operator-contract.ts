export const OPERATOR_RESULT_SCHEMA_VERSION =
  "graph-operator.result.v1" as const;
export const OPERATOR_PROJECT_ID = "code-the-future" as const;

export const OPERATOR_COMMANDS = [
  "status",
  "run-now",
  "catch-up",
  "resume",
  "reviews",
  "explain-failure",
  "doctor",
] as const;

export type OperatorCommand = (typeof OPERATOR_COMMANDS)[number];
export type OperatorOutcome = "ok" | "noop" | "blocked" | "failed";
export type OperatorClassification =
  | "not_initialized"
  | "idle"
  | "running"
  | "interrupted_resumable"
  | "completed"
  | "partial"
  | "awaiting_review"
  | "duplicate_noop"
  | "recapture_required"
  | "missing_checkpoint"
  | "policy_drift"
  | "uncertain_external_action"
  | "unsupported_ledger"
  | "corrupt_state"
  | "failed_retryable"
  | "failed_terminal";

export type OperatorExitCode = 0 | 2 | 10 | 20 | 21 | 22 | 30 | 31 | 70;

export interface OperatorRunSummary {
  runId: string;
  workflowVersion: string;
  triggerKind: "manual" | "scheduled" | "resume" | "test";
  startedAt: string;
  completedAt: string | null;
  terminalStatus:
    | "running"
    | "awaiting_review"
    | "complete"
    | "partial"
    | "blocked"
    | "failed";
}

export interface OperatorPersistenceSummary {
  ledger: "missing" | "healthy" | "corrupt" | "unsupported";
  checkpoint: "missing" | "present" | "unknown";
  committed: boolean;
  readbackVerified: boolean;
}

export interface OperatorFreshnessSummary {
  state: "not_checked" | "fresh" | "stale" | "invalid";
  capturedAt: string | null;
  maxAgeHours: number | null;
  reason: string | null;
}

export interface OperatorReviewItem {
  reviewId: string;
  runId: string;
  kind: "proposal_review" | "external_action_approval";
  status: "awaiting_review";
  scopeHash: string;
  requestedAt: string;
  expiresAt: string | null;
  operatorCanExecute: false;
  payload?: Record<string, unknown>;
}

export interface OperatorFailure {
  category: string;
  node: string | null;
  retryable: boolean;
  fingerprint: string | null;
  message: string;
}

export interface OperatorResult {
  schemaVersion: typeof OPERATOR_RESULT_SCHEMA_VERSION;
  projectId: typeof OPERATOR_PROJECT_ID;
  command: OperatorCommand;
  generatedAt: string;
  outcome: OperatorOutcome;
  classification: OperatorClassification;
  run: OperatorRunSummary | null;
  persistence: OperatorPersistenceSummary;
  freshness: OperatorFreshnessSummary;
  reviews: {
    count: number;
    items: OperatorReviewItem[];
  };
  failure: OperatorFailure | null;
  externalActionStatus: "not_executed" | "unknown";
  nextSafeAction: string;
}

export const EMPTY_OPERATOR_PERSISTENCE: OperatorPersistenceSummary = {
  ledger: "missing",
  checkpoint: "missing",
  committed: false,
  readbackVerified: false,
};

export const UNCHECKED_FRESHNESS: OperatorFreshnessSummary = {
  state: "not_checked",
  capturedAt: null,
  maxAgeHours: null,
  reason: null,
};

export function operatorResult(
  input: Omit<
    OperatorResult,
    "schemaVersion" | "projectId" | "generatedAt"
  > & { generatedAt?: string },
): OperatorResult {
  return {
    schemaVersion: OPERATOR_RESULT_SCHEMA_VERSION,
    projectId: OPERATOR_PROJECT_ID,
    command: input.command,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outcome: input.outcome,
    classification: input.classification,
    run: input.run,
    persistence: input.persistence,
    freshness: input.freshness,
    reviews: input.reviews,
    failure: input.failure,
    externalActionStatus: input.externalActionStatus,
    nextSafeAction: input.nextSafeAction,
  };
}
