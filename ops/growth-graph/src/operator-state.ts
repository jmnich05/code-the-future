import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { preflightCaptureBundleReadOnly } from "./artifacts.js";
import {
  GrowthLedger,
  type LedgerReviewRecord,
  type LegacyRunCheckpointAuthority,
} from "./ledger.js";
import {
  normalizeScheduledSlot,
  scheduledIdempotencyKeyForSlot,
} from "./cli-policy.js";
import { redactObserverValue } from "./observer.js";
import {
  type OperatorClassification,
  type OperatorFailure,
  type OperatorPersistenceSummary,
  type OperatorReviewItem,
  type OperatorRunSummary,
} from "./operator-contract.js";
import {
  addProjectCalendarDays,
  projectCalendarDate,
  projectDateIsWithinWindow,
} from "./project-policy.js";
import {
  CURRENT_METRIC_DEFINITION_VERSION,
  CaptureBundleSchema,
  HumanReviewSchema,
  IsoInstantSchema,
  type GrowthCaptureBundle,
} from "./schema.js";
import {
  projectPersistedReviewForRuntime,
  GRAPH_VERSION,
} from "./workflow.js";

export const PROJECT_OBJECTIVE_WINDOW = {
  start: "2026-08-08",
  end: "2026-10-07",
} as const;
export const SUPPORTED_LEDGER_SCHEMA_VERSION = 2 as const;

function safeText(value: unknown): string {
  const redacted = redactObserverValue(value);
  return typeof redacted === "string" ? redacted : JSON.stringify(redacted);
}

type SqlRow = Record<string, unknown>;

export interface RawRun {
  runId: string;
  threadId: string;
  idempotencyKey: string;
  workflowVersion: string;
  policyHash: string;
  runtimeHash: string;
  captureBundleHash: string;
  startedAt: string;
  triggerKind: OperatorRunSummary["triggerKind"];
  transactionId: string | null;
  committedAt: string | null;
  completedAt: string | null;
  terminalStatus: OperatorRunSummary["terminalStatus"];
  nextSafeAction: string | null;
  readbackVerified: boolean;
  finalized: boolean;
  checkpointPresent: boolean;
}

export interface OperatorStateSnapshot {
  classification: OperatorClassification;
  persistence: OperatorPersistenceSummary;
  run: OperatorRunSummary | null;
  latestRun: RawRun | null;
  runs: RawRun[];
  incompleteRuns: RawRun[];
  reviews: OperatorReviewItem[];
  failure: OperatorFailure | null;
  failureByRunId?: Readonly<Record<string, OperatorFailure | null>>;
  nextSafeAction: string;
}

export interface CaptureAssessment {
  capturePath: string;
  captureSha256: string;
  bundle: GrowthCaptureBundle;
  evidenceRoot: string;
  evidenceMode: "real" | "synthetic";
  logicalRunAt: string;
  freshness: {
    state: "fresh" | "stale" | "invalid";
    capturedAt: string;
    maxAgeHours: number;
    reason: string | null;
  };
}

export async function inspectCaptureBinding(input: {
  capturePath: string;
  evidenceRoot: string;
}): Promise<{ capturePath: string; captureSha256: string }> {
  const requestedCapturePath = resolve(input.capturePath);
  const requestedStats = await lstat(requestedCapturePath);
  if (!requestedStats.isFile() || requestedStats.isSymbolicLink()) {
    throw new Error("Capture bundle must be a non-symlink regular file");
  }
  const evidenceRoot = await realpath(resolve(input.evidenceRoot));
  const capturePath = await realpath(requestedCapturePath);
  const escape = relative(evidenceRoot, capturePath);
  if (escape === ".." || escape.startsWith("../")) {
    throw new Error("Capture path escapes the allowed evidence root");
  }
  const stats = await lstat(capturePath);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > 16 * 1024 * 1024
  ) {
    throw new Error("Capture bundle must be a bounded regular file");
  }
  return { capturePath, captureSha256: sha256(await readFile(capturePath)) };
}

function stringField(row: SqlRow, name: string): string {
  const value = row[name];
  if (typeof value !== "string") throw new Error(`Invalid ${name}`);
  return value;
}

function nullableString(row: SqlRow, name: string): string | null {
  const value = row[name];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid ${name}`);
  return value;
}

function numberField(row: SqlRow, name: string): number {
  const value = row[name];
  if (typeof value !== "number") throw new Error(`Invalid ${name}`);
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function regularFileState(
  path: string,
): Promise<"missing" | "regular" | "unsafe"> {
  try {
    const stats = await lstat(path);
    return stats.isFile() && !stats.isSymbolicLink() ? "regular" : "unsafe";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return "unsafe";
  }
}

function quickCheck(database: DatabaseSync): void {
  const rows = database.prepare("PRAGMA quick_check").all() as SqlRow[];
  if (
    rows.length !== 1 ||
    Object.values(rows[0] ?? {}).length !== 1 ||
    Object.values(rows[0] ?? {})[0] !== "ok"
  ) {
    throw new Error("SQLite quick_check failed");
  }
}

interface CheckpointRunAuthority {
  runId?: string;
  threadId?: string;
  idempotencyKey?: string;
  workflowVersion?: string;
  policyHash?: string;
  runtimeHash?: string;
  captureBundleHash?: string;
  startedAt?: string;
  triggerKind?: RawRun["triggerKind"];
}

function checkpointString(
  object: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!(key in object)) return undefined;
  const value = object[key];
  if (typeof value !== "string") {
    throw new Error(`Checkpoint ${key} must be a string`);
  }
  return value;
}

function checkpointState(path: string): {
  threads: Set<string>;
  finalizedThreads: Set<string>;
  completedAtByThread: Map<string, string>;
  authorityByThread: Map<string, CheckpointRunAuthority>;
} {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    quickCheck(database);
    const tables = new Set(
      (database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as SqlRow[]).map((row) => stringField(row, "name")),
    );
    if (!tables.has("checkpoints")) {
      throw new Error("Checkpoint table is missing");
    }
    const rows = database
      .prepare(`
        SELECT c.thread_id, c.type, CAST(c.checkpoint AS TEXT) AS checkpoint_json
        FROM checkpoints c
        WHERE c.checkpoint_ns = ''
          AND c.checkpoint_id = (
          SELECT MAX(latest.checkpoint_id)
          FROM checkpoints latest
          WHERE latest.thread_id = c.thread_id
            AND latest.checkpoint_ns = ''
        )
      `)
      .all() as SqlRow[];
    const threads = new Set<string>();
    const finalizedThreads = new Set<string>();
    const completedAtByThread = new Map<string, string>();
    const authorityByThread = new Map<string, CheckpointRunAuthority>();
    for (const row of rows) {
      const threadId = stringField(row, "thread_id");
      if (threads.has(threadId)) {
        throw new Error("Checkpoint thread has multiple latest main states");
      }
      threads.add(threadId);
      if (stringField(row, "type") !== "json") {
        throw new Error("Main checkpoint encoding is unsupported");
      }
      const parsed = JSON.parse(stringField(row, "checkpoint_json")) as {
        channel_values?: Record<string, unknown>;
      };
      const values = parsed.channel_values;
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new Error("Checkpoint channel values are missing");
      }
      const canonicalValue = values.canonical;
      if (
        canonicalValue !== undefined &&
        (!canonicalValue ||
          typeof canonicalValue !== "object" ||
          Array.isArray(canonicalValue))
      ) {
        throw new Error("Checkpoint canonical authority is invalid");
      }
      const persistence = values.persistence as
        | { verified?: unknown }
        | undefined;
      if (canonicalValue === undefined) {
        throw new Error("Main checkpoint is missing canonical run authority");
      }
      const canonical = (canonicalValue ?? {}) as Record<string, unknown>;
      const checkpointStartedAt = checkpointString(values, "startedAt");
      const expectedCapture = checkpointString(
        values,
        "expectedCaptureSha256",
      );
      const canonicalCapture = checkpointString(
        canonical,
        "capture_bundle_hash",
      );
      if (
        expectedCapture &&
        canonicalCapture &&
        expectedCapture !== canonicalCapture
      ) {
        throw new Error("Checkpoint capture authority is internally inconsistent");
      }
      const triggerKind = checkpointString(canonical, "trigger_kind");
      const graphVersion = checkpointString(canonical, "graph_version");
      const policyVersion = checkpointString(canonical, "policy_version");
      const runId = checkpointString(canonical, "run_id");
      const canonicalThreadId = checkpointString(canonical, "thread_id");
      if (!runId || !canonicalThreadId) {
        throw new Error("Main checkpoint lacks run and thread authority");
      }
      const idempotencyKey = checkpointString(canonical, "idempotency_key");
      const runtimeHash = checkpointString(
        canonical,
        "runtime_manifest_hash",
      );
      const captureAuthority = canonicalCapture ?? expectedCapture;
      if (
        !idempotencyKey ||
        !graphVersion ||
        !policyVersion ||
        !runtimeHash ||
        !canonicalCapture ||
        !expectedCapture ||
        !checkpointStartedAt ||
        !triggerKind
      ) {
        throw new Error("Main checkpoint authority is incomplete");
      }
      if (
        !["manual", "scheduled", "resume", "test"].includes(triggerKind)
      ) {
        throw new Error("Checkpoint trigger kind is invalid");
      }
      authorityByThread.set(threadId, {
        runId,
        threadId: canonicalThreadId,
        idempotencyKey,
        workflowVersion: graphVersion,
        policyHash: sha256(`${policyVersion}:${graphVersion}`),
        runtimeHash,
        captureBundleHash: canonicalCapture,
        startedAt: IsoInstantSchema.parse(checkpointStartedAt),
        triggerKind: triggerKind as RawRun["triggerKind"],
      });
      if (
        values.currentNode === "finalize" &&
        typeof values.completedAt === "string" &&
        persistence?.verified === true
      ) {
        finalizedThreads.add(threadId);
        completedAtByThread.set(
          threadId,
          IsoInstantSchema.parse(values.completedAt),
        );
      }
    }
    return {
      threads,
      finalizedThreads,
      completedAtByThread,
      authorityByThread,
    };
  } finally {
    database.close();
  }
}

export function runSummary(run: RawRun): OperatorRunSummary {
  return {
    runId: run.runId,
    workflowVersion: run.workflowVersion,
    triggerKind: run.triggerKind,
    startedAt: run.startedAt,
    completedAt: run.finalized ? run.completedAt : null,
    terminalStatus: run.terminalStatus,
  };
}

function readRuns(
  database: DatabaseSync,
  checkpointFinalizedThreads: ReadonlySet<string>,
  checkpointCompletedAt: ReadonlyMap<string, string>,
): RawRun[] {
  const rows = database
    .prepare(`
      SELECT
        r.run_id, r.thread_id, r.idempotency_key, r.workflow_name,
        r.policy_hash, r.runtime_hash, r.capture_bundle_hash,
        r.started_at, r.trigger_kind,
        t.transaction_id, t.committed_at, t.terminal_status, t.next_safe_action,
        (
          SELECT json_extract(final_event.payload_json, '$.completedAt')
          FROM events final_event
          WHERE final_event.run_id = r.run_id
            AND final_event.event_type = 'portfolio.finalized'
          ORDER BY final_event.rowid DESC LIMIT 1
        ) AS finalized_at,
        EXISTS (
          SELECT 1 FROM events e
          WHERE e.run_id = r.run_id
            AND e.event_type = 'portfolio.readback_verified'
        ) AS readback_verified,
        EXISTS (
          SELECT 1 FROM events e
          WHERE e.run_id = r.run_id
            AND e.event_type = 'portfolio.finalized'
        ) AS finalized
      FROM runs r
      LEFT JOIN transactions t ON t.run_id = r.run_id
      ORDER BY julianday(r.started_at) DESC, r.rowid DESC
    `)
    .all() as SqlRow[];
  return rows.map((row) => {
    const triggerKind = stringField(row, "trigger_kind");
    if (!["manual", "scheduled", "resume", "test"].includes(triggerKind)) {
      throw new Error("Invalid trigger kind in ledger");
    }
    const storedTerminal = nullableString(row, "terminal_status");
    const terminalStatus = storedTerminal ?? "running";
    if (
      ![
        "running",
        "awaiting_review",
        "complete",
        "partial",
        "blocked",
        "failed",
      ].includes(terminalStatus)
    ) {
      throw new Error("Invalid terminal status in ledger");
    }
    const startedAt = IsoInstantSchema.parse(stringField(row, "started_at"));
    const transactionId = nullableString(row, "transaction_id");
    const threadId = stringField(row, "thread_id");
    const eventCompletedAt = nullableString(row, "finalized_at");
    const completedAt = eventCompletedAt
      ? IsoInstantSchema.parse(eventCompletedAt)
      : checkpointCompletedAt.get(threadId) ?? null;
    return {
      runId: stringField(row, "run_id"),
      threadId,
      idempotencyKey: stringField(row, "idempotency_key"),
      workflowVersion: stringField(row, "workflow_name"),
      policyHash: stringField(row, "policy_hash"),
      runtimeHash: stringField(row, "runtime_hash"),
      captureBundleHash: stringField(row, "capture_bundle_hash"),
      startedAt,
      triggerKind: triggerKind as RawRun["triggerKind"],
      transactionId,
      committedAt: nullableString(row, "committed_at"),
      completedAt,
      terminalStatus: terminalStatus as RawRun["terminalStatus"],
      nextSafeAction: nullableString(row, "next_safe_action"),
      readbackVerified: numberField(row, "readback_verified") === 1,
      finalized:
        transactionId !== null &&
        (numberField(row, "finalized") === 1 ||
          checkpointFinalizedThreads.has(threadId)),
      checkpointPresent: false,
    };
  });
}

function readReviews(
  pendingReviews: LedgerReviewRecord[],
  projectedAt: string,
  options: { reviewId?: string; includeExactPayload?: boolean } = {},
): OperatorReviewItem[] {
  return pendingReviews
    .filter((record) => !options.reviewId || record.reviewId === options.reviewId)
    .map((record) => {
    const persisted = HumanReviewSchema.parse({
      review_id: record.reviewId,
      proposal_id: record.proposalId,
      lane: record.lane,
      review_kind: record.reviewKind,
      status: record.status,
      approval_hash: record.approvalHash,
      approval_package: record.approvalPackage,
      requested_at: record.requestedAt,
    });
    const projected = projectPersistedReviewForRuntime(
      persisted,
      projectedAt,
      PROJECT_OBJECTIVE_WINDOW,
    );
    const persistedPackage = persisted.approval_package;
    const persistedScope = persistedPackage.proposal.approval_scope;
    const scopeHash = persistedScope
      ? sha256(canonical(persistedScope))
      : persisted.approval_hash;
    const expiresAt =
      "approval_expires_at" in persistedPackage
        ? persistedPackage.approval_expires_at ?? null
        : null;
    const actionAuthority =
      persisted.review_kind !== "external_action_approval"
        ? ("proposal_review_only" as const)
        : projected.review_kind === "external_action_approval"
          ? ("awaiting_exact_human_approval" as const)
          : ("expired_or_legacy_downgraded" as const);
    return {
      reviewId: persisted.review_id,
      runId: record.runId,
      kind: projected.review_kind,
      status: "awaiting_review",
      scopeHash,
      requestedAt: persisted.requested_at,
      expiresAt,
      operatorCanExecute: false,
      payload: {
        lane: persisted.lane,
        proposalId: persisted.proposal_id,
        approvalHash: persisted.approval_hash,
        packageSchemaVersion: persistedPackage.schema_version,
        runtimeKind: projected.review_kind,
        proposalReadiness: projected.approval_package.proposal.readiness,
        draftContentSha256: persistedPackage.draft_content.content_sha256,
        actionAuthority,
        ...(options.includeExactPayload
          ? {
              persistedReviewKind: persisted.review_kind,
              persistedApprovalPackageAuditOnly: persisted.approval_package,
              runtimeProjectedApprovalPackage: projected.approval_package,
            }
          : {}),
      },
    };
    });
}

function readLatestFailure(
  database: DatabaseSync,
  runId: string | undefined,
): OperatorFailure | null {
  if (!runId) return null;
  const row = database
    .prepare(`
      SELECT category, node, retryable, fingerprint, message
      FROM errors WHERE run_id = ?
      ORDER BY julianday(created_at) DESC, rowid DESC LIMIT 1
    `)
    .get(runId) as SqlRow | undefined;
  if (!row) return null;
  return {
    category: stringField(row, "category"),
    node: stringField(row, "node"),
    retryable: numberField(row, "retryable") === 1,
    fingerprint: stringField(row, "fingerprint"),
    message: safeText(stringField(row, "message")),
  };
}

function legacyAuthorityForRun(
  run: RawRun,
  authority: CheckpointRunAuthority | undefined,
): LegacyRunCheckpointAuthority | undefined {
  if (!authority) return undefined;
  const comparisons: Array<[unknown, unknown, string]> = [
    [authority.runId, run.runId, "run ID"],
    [authority.threadId, run.threadId, "thread ID"],
    [authority.idempotencyKey, run.idempotencyKey, "idempotency key"],
    [authority.workflowVersion, run.workflowVersion, "graph version"],
    [authority.policyHash, run.policyHash, "policy hash"],
    [authority.runtimeHash, run.runtimeHash, "runtime hash"],
    [authority.captureBundleHash, run.captureBundleHash, "capture hash"],
    [authority.startedAt, run.startedAt, "started time"],
    [authority.triggerKind, run.triggerKind, "trigger kind"],
  ];
  for (const [checkpointValue, ledgerValue, label] of comparisons) {
    if (checkpointValue !== undefined && checkpointValue !== ledgerValue) {
      throw new Error(`Checkpoint ${label} does not match the canonical ledger`);
    }
  }
  if (!authority.runId || !authority.threadId || !authority.startedAt) {
    return undefined;
  }
  return {
    runId: authority.runId,
    threadId: authority.threadId,
    startedAt: authority.startedAt,
  };
}

function baseCorruptSnapshot(
  ledger: OperatorPersistenceSummary["ledger"],
  checkpoint: OperatorPersistenceSummary["checkpoint"],
  classification: "unsupported_ledger" | "corrupt_state",
  message: string,
): OperatorStateSnapshot {
  return {
    classification,
    persistence: {
      ledger,
      checkpoint,
      committed: false,
      readbackVerified: false,
    },
    run: null,
    latestRun: null,
    runs: [],
    incompleteRuns: [],
    reviews: [],
    failure: {
      category: classification,
      node: null,
      retryable: false,
      fingerprint: null,
      message,
    },
    nextSafeAction:
      "Inspect the local SQLite state manually; do not create or replay a run.",
  };
}

export async function inspectOperatorState(input: {
  stateRoot: string;
  now?: string;
  reviewId?: string;
  includeExactReviewPayload?: boolean;
}): Promise<OperatorStateSnapshot> {
  const now = IsoInstantSchema.parse(input.now ?? new Date().toISOString());
  const stateRoot = resolve(input.stateRoot);
  const ledgerPath = resolve(stateRoot, "ledger.sqlite");
  const checkpointPath = resolve(stateRoot, "checkpoints.sqlite");
  const ledgerFile = await regularFileState(ledgerPath);
  const checkpointFile = await regularFileState(checkpointPath);

  if (ledgerFile === "unsafe" || checkpointFile === "unsafe") {
    return baseCorruptSnapshot(
      ledgerFile === "unsafe" ? "corrupt" : "missing",
      checkpointFile === "regular" ? "present" : "unknown",
      "corrupt_state",
      "A state database path is not a regular non-symlink file.",
    );
  }
  if (ledgerFile === "missing") {
    if (checkpointFile === "regular") {
      return baseCorruptSnapshot(
        "missing",
        "present",
        "corrupt_state",
        "An orphan checkpoint database exists without its canonical ledger.",
      );
    }
    return {
      classification: "not_initialized",
      persistence: {
        ledger: "missing",
        checkpoint: "missing",
        committed: false,
        readbackVerified: false,
      },
      run: null,
      latestRun: null,
      runs: [],
      incompleteRuns: [],
      reviews: [],
      failure: null,
      nextSafeAction:
        "Provide a fresh immutable capture bundle to run-now or catch-up; the operator will not collect evidence.",
    };
  }

  let threads = new Set<string>();
  let checkpointFinalizedThreads = new Set<string>();
  let checkpointCompletedAt = new Map<string, string>();
  let checkpointAuthorityByThread = new Map<
    string,
    CheckpointRunAuthority
  >();
  if (checkpointFile === "regular") {
    try {
      const checkpoint = checkpointState(checkpointPath);
      threads = checkpoint.threads;
      checkpointFinalizedThreads = checkpoint.finalizedThreads;
      checkpointCompletedAt = checkpoint.completedAtByThread;
      checkpointAuthorityByThread = checkpoint.authorityByThread;
    } catch {
      return baseCorruptSnapshot(
        "healthy",
        "unknown",
        "corrupt_state",
        "The checkpoint database failed its read-only integrity check.",
      );
    }
  }

  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(ledgerPath, { readOnly: true });
    quickCheck(database);
    const version = (
      database.prepare("PRAGMA user_version").get() as SqlRow
    ).user_version;
    if (version !== SUPPORTED_LEDGER_SCHEMA_VERSION) {
      return baseCorruptSnapshot(
        "unsupported",
        checkpointFile === "regular" ? "present" : "missing",
        "unsupported_ledger",
        `Ledger schema ${String(version)} is audit-only and unsupported by this operator.`,
      );
    }
    const runs = readRuns(
      database,
      checkpointFinalizedThreads,
      checkpointCompletedAt,
    );
    const runThreads = new Set(runs.map((run) => run.threadId));
    const orphanCheckpointThreads = [...threads].filter(
      (threadId) => !runThreads.has(threadId),
    );
    if (orphanCheckpointThreads.length > 0) {
      return baseCorruptSnapshot(
        "corrupt",
        "present",
        "corrupt_state",
        "Checkpoint state exists for a thread absent from the canonical ledger.",
      );
    }
    for (const run of runs) {
      run.checkpointPresent = threads.has(run.threadId);
      legacyAuthorityForRun(
        run,
        checkpointAuthorityByThread.get(run.threadId),
      );
    }
    const verifier = new GrowthLedger(ledgerPath, { readOnly: true });
    let pendingReviews: LedgerReviewRecord[] = [];
    let shadowBoundaryRun: RawRun | null = null;
    try {
      for (const run of runs) {
        const legacyAuthority = legacyAuthorityForRun(
          run,
          checkpointAuthorityByThread.get(run.threadId),
        );
        if (run.transactionId) {
          verifier.verifyCommittedRun(run.runId, legacyAuthority);
          run.readbackVerified = true;
        } else {
          verifier.verifyRunAuthority(run.runId, legacyAuthority);
        }
        if (
          !shadowBoundaryRun &&
          verifier.findShadowBoundaryViolation(run.runId)
        ) {
          shadowBoundaryRun = run;
        }
      }
      pendingReviews = verifier.listPendingReviews();
    } finally {
      verifier.close();
    }
    const reviews = readReviews(pendingReviews, now, {
      ...(input.reviewId ? { reviewId: input.reviewId } : {}),
      includeExactPayload: Boolean(input.includeExactReviewPayload),
    });
    const failureByRunId = Object.fromEntries(
      runs.map((run) => [run.runId, readLatestFailure(database!, run.runId)]),
    );
    if (runs.length === 0) {
      return {
        classification: "idle",
        persistence: {
          ledger: "healthy",
          checkpoint: checkpointFile === "regular" ? "present" : "missing",
          committed: false,
          readbackVerified: false,
        },
        run: null,
        latestRun: null,
        runs,
        incompleteRuns: [],
        reviews,
        failure: null,
        failureByRunId,
        nextSafeAction:
          "Provide a fresh immutable capture bundle; no run is currently owned.",
      };
    }

    const incompleteRuns = runs.filter((run) => !run.finalized);
    if (shadowBoundaryRun) {
      return {
        classification: "uncertain_external_action",
        persistence: {
          ledger: "healthy",
          checkpoint: threads.has(shadowBoundaryRun.threadId)
            ? "present"
            : "missing",
          committed: Boolean(shadowBoundaryRun.transactionId),
          readbackVerified: shadowBoundaryRun.readbackVerified,
        },
        run: runSummary(shadowBoundaryRun),
        latestRun: runs[0]!,
        runs,
        incompleteRuns,
        reviews,
        failureByRunId,
        failure: {
          category: "uncertain_external_action",
          node: null,
          retryable: false,
          fingerprint: null,
          message:
            "A hash-verified ledger marker claims a consequential external-action boundary in this strict shadow runtime.",
        },
        nextSafeAction:
          "Inspect and reconcile the marked run outside the operator. Do not resume, replay, publish, send, merge, deploy, or infer completion.",
      };
    }
    if (incompleteRuns.length > 1) {
      const latest = incompleteRuns[0]!;
      return {
        classification: "corrupt_state",
        persistence: {
          ledger: "corrupt",
          checkpoint: threads.size > 0 ? "present" : "missing",
          committed: Boolean(latest.transactionId),
          readbackVerified: latest.readbackVerified,
        },
        run: runSummary(latest),
        latestRun: runs[0]!,
        runs,
        incompleteRuns,
        reviews,
        failureByRunId,
        failure: {
          category: "multiple_incomplete_runs",
          node: null,
          retryable: false,
          fingerprint: null,
          message: "Multiple unfinalized ledger runs require manual reconciliation.",
        },
        nextSafeAction:
          "Inspect every unfinalized run and checkpoint; do not choose one automatically.",
      };
    }

    if (incompleteRuns.length === 1) {
      const incomplete = incompleteRuns[0]!;
      const hasCheckpoint = threads.has(incomplete.threadId);
      const failure = readLatestFailure(database, incomplete.runId);
      if (!hasCheckpoint) {
        return {
          classification: "missing_checkpoint",
          persistence: {
            ledger: "healthy",
            checkpoint: checkpointFile === "regular" ? "missing" : "missing",
            committed: Boolean(incomplete.transactionId),
            readbackVerified: incomplete.readbackVerified,
          },
          run: runSummary(incomplete),
          latestRun: runs[0]!,
          runs,
          incompleteRuns,
          reviews,
          failureByRunId,
          failure:
            failure ?? {
              category: "missing_checkpoint",
              node: null,
              retryable: false,
              fingerprint: null,
              message: "The ledger owns an unfinished run but no checkpoint exists.",
            },
          nextSafeAction:
            "Repair or reconcile the exact ledger run manually; never create a replacement run with a new key.",
        };
      }
      if (failure && !failure.retryable && !incomplete.transactionId) {
        return {
          classification: "failed_terminal",
          persistence: {
            ledger: "healthy",
            checkpoint: "present",
            committed: false,
            readbackVerified: false,
          },
          run: runSummary(incomplete),
          latestRun: runs[0]!,
          runs,
          incompleteRuns,
          reviews,
          failureByRunId,
          failure,
          nextSafeAction:
            "Repair the permanent input or policy defect and prepare a new immutable cycle; do not resume this failed run.",
        };
      }
      return {
        classification: "interrupted_resumable",
        persistence: {
          ledger: "healthy",
          checkpoint: "present",
          committed: Boolean(incomplete.transactionId),
          readbackVerified: incomplete.readbackVerified,
        },
        run: runSummary(incomplete),
        latestRun: runs[0]!,
        runs,
        incompleteRuns,
        reviews,
        failureByRunId,
        failure,
        nextSafeAction: `Resume exact run ${incomplete.runId}; do not supply a capture or create a new run.`,
      };
    }

    const latest = runs[0]!;
    const classification: OperatorClassification =
      latest.terminalStatus === "awaiting_review"
        ? "awaiting_review"
        : latest.terminalStatus === "partial"
          ? "partial"
          : latest.terminalStatus === "complete"
            ? "completed"
            : latest.terminalStatus === "failed" ||
                latest.terminalStatus === "blocked"
              ? "failed_terminal"
              : "completed";
    return {
      classification,
      persistence: {
        ledger: "healthy",
        checkpoint: threads.has(latest.threadId) ? "present" : "missing",
        committed: Boolean(latest.transactionId),
        readbackVerified: latest.readbackVerified,
      },
      run: runSummary(latest),
      latestRun: latest,
      runs,
      incompleteRuns,
      reviews,
      failureByRunId,
      failure: readLatestFailure(database, latest.runId),
      nextSafeAction:
        latest.terminalStatus === "awaiting_review" || reviews.length > 0
          ? "Inspect the hash-bound review summaries. This operator cannot approve or execute them."
          : latest.nextSafeAction ??
            "Inspect the verified local result; no external action occurred.",
    };
  } catch (error) {
    return baseCorruptSnapshot(
      "corrupt",
      checkpointFile === "regular" ? "present" : "missing",
      "corrupt_state",
      safeText(error instanceof Error ? error.message : String(error)),
    );
  } finally {
    database?.close();
  }
}

function completeSource(
  bundle: GrowthCaptureBundle,
  lane: GrowthCaptureBundle["source_runs"][number]["lane"],
  source: GrowthCaptureBundle["source_runs"][number]["source"],
): boolean {
  return bundle.source_runs.some(
    (run) =>
      run.lane === lane &&
      run.source === source &&
      run.status === "verified_complete" &&
      run.data_state === "complete",
  );
}

function recentDeclarations(
  bundle: GrowthCaptureBundle,
  lane: GrowthCaptureBundle["evidence"][number]["lane"],
  source: GrowthCaptureBundle["evidence"][number]["source"],
  runAtMs: number,
  maxAgeHours: number,
): boolean {
  return bundle.evidence.some((evidence) => {
    const age = runAtMs - Date.parse(evidence.captured_at);
    return (
      evidence.lane === lane &&
      evidence.source === source &&
      evidence.data_state === "complete" &&
      age >= 0 &&
      age <= maxAgeHours * 60 * 60 * 1_000
    );
  });
}

function captureFreshness(
  bundle: GrowthCaptureBundle,
  logicalRunAt: string,
): CaptureAssessment["freshness"] {
  const runAtMs = Date.parse(logicalRunAt);
  const createdAtMs = Date.parse(bundle.created_at);
  const reasons: string[] = [];
  if (createdAtMs > runAtMs) reasons.push("capture bundle is future-dated");
  if (runAtMs - createdAtMs > 24 * 60 * 60 * 1_000) {
    reasons.push("capture bundle is older than the 24-hour operator window");
  }
  const runDate = projectCalendarDate(logicalRunAt);
  if (
    bundle.objective_window.start !== PROJECT_OBJECTIVE_WINDOW.start ||
    bundle.objective_window.end !== PROJECT_OBJECTIVE_WINDOW.end
  ) {
    reasons.push("capture objective window differs from the fixed project window");
  }
  if (!projectDateIsWithinWindow(runDate, PROJECT_OBJECTIVE_WINDOW)) {
    reasons.push("actual execution time is outside the fixed project objective window");
  }
  if (!projectDateIsWithinWindow(runDate, bundle.objective_window)) {
    reasons.push("actual execution time is outside the bundle objective window");
  }
  if (bundle.metric_definition_version !== CURRENT_METRIC_DEFINITION_VERSION) {
    reasons.push("legacy metric definitions are read-only and require recapture");
  }

  if (
    bundle.evidence.some(
      (item) =>
        item.lane === "organic_social" &&
        item.source === "instagram_insights" &&
        item.data_state === "complete",
    ) &&
    (!completeSource(bundle, "organic_social", "instagram_insights") ||
      !recentDeclarations(
        bundle,
        "organic_social",
        "instagram_insights",
        runAtMs,
        24,
      ))
  ) {
    reasons.push("Instagram evidence is missing, partial, or stale");
  }
  if (
    bundle.evidence.some(
      (item) =>
        item.lane === "organic_social" &&
        item.source === "facebook_insights" &&
        item.data_state === "complete",
    ) &&
    (!completeSource(bundle, "organic_social", "facebook_insights") ||
      !recentDeclarations(
        bundle,
        "organic_social",
        "facebook_insights",
        runAtMs,
        24,
      ))
  ) {
    reasons.push("Facebook evidence is missing, partial, or stale");
  }
  if (
    bundle.evidence.some(
      (item) =>
        item.lane === "contact_discovery" && item.source === "public_web",
    ) &&
    (!completeSource(bundle, "contact_discovery", "public_web") ||
      !recentDeclarations(
        bundle,
        "contact_discovery",
        "public_web",
        runAtMs,
        168,
      ))
  ) {
    reasons.push("public contact evidence is missing, partial, or older than seven days");
  }
  if (
    bundle.evidence.some(
      (item) =>
        item.lane === "contact_discovery" &&
        item.source === "contact_history" &&
        item.data_state === "complete",
    ) &&
    (!completeSource(bundle, "contact_discovery", "contact_history") ||
      !recentDeclarations(
        bundle,
        "contact_discovery",
        "contact_history",
        runAtMs,
        24,
      ))
  ) {
    reasons.push("contact history is missing, partial, or older than 24 hours");
  }
  const matureEnd = addProjectCalendarDays(runDate, -3);
  const currentGscDeclaration = bundle.evidence.some(
    (evidence) =>
      evidence.lane === "search_console" &&
      evidence.source === "search_console" &&
      evidence.data_state === "complete" &&
      evidence.fresh_through !== undefined &&
      evidence.fresh_through >= matureEnd &&
      runAtMs - Date.parse(evidence.captured_at) >= 0 &&
      runAtMs - Date.parse(evidence.captured_at) <= 24 * 60 * 60 * 1_000,
  );
  if (
    bundle.evidence.some(
      (item) =>
        item.lane === "search_console" &&
        item.source === "search_console" &&
        item.data_state === "complete",
    ) &&
    (!completeSource(bundle, "search_console", "search_console") ||
      !currentGscDeclaration)
  ) {
    reasons.push("Search Console evidence does not cover the current mature window");
  }
  if (
    bundle.evidence.some(
      (item) =>
        item.lane === "search_console" &&
        item.source === "site_inventory" &&
        item.data_state === "complete",
    ) &&
    (!completeSource(bundle, "search_console", "site_inventory") ||
      !recentDeclarations(
        bundle,
        "search_console",
        "site_inventory",
        runAtMs,
        24,
      ))
  ) {
    reasons.push("site inventory evidence is missing, partial, or stale");
  }

  return {
    state: reasons.length === 0 ? "fresh" : "stale",
    capturedAt: bundle.created_at,
    maxAgeHours: 24,
    reason: reasons.length === 0 ? null : `Recapture required: ${reasons.join("; ")}.`,
  };
}

export async function assessCaptureForOperator(input: {
  capturePath: string;
  evidenceRoot: string;
  expectedSha256?: string;
  allowSyntheticEvidence?: boolean;
  syntheticRunAt?: string;
  now?: string;
}): Promise<CaptureAssessment> {
  const now = IsoInstantSchema.parse(input.now ?? new Date().toISOString());
  if (input.syntheticRunAt && !input.allowSyntheticEvidence) {
    throw new Error("--run-at is restricted to explicit synthetic evidence");
  }
  const logicalRunAt = input.syntheticRunAt
    ? IsoInstantSchema.parse(input.syntheticRunAt)
    : now;
  const evidenceRoot = await realpath(resolve(input.evidenceRoot));
  const capturePath = await realpath(resolve(input.capturePath));
  const escape = relative(evidenceRoot, capturePath);
  if (escape === ".." || escape.startsWith("../")) {
    throw new Error("Capture path escapes the allowed evidence root");
  }
  const prepared = await preflightCaptureBundleReadOnly({
    captureBundlePath: capturePath,
    allowedEvidenceRoot: evidenceRoot,
    runAt: logicalRunAt,
    allowSyntheticEvidence: Boolean(input.allowSyntheticEvidence),
    requireCurrentMetricDefinition: true,
    ...(input.expectedSha256
      ? { expectedCaptureSha256: input.expectedSha256 }
      : {}),
  });
  const bundle = prepared.bundle;
  return {
    capturePath,
    captureSha256: prepared.bundleSha256,
    bundle,
    evidenceRoot,
    evidenceMode: prepared.evidenceMode,
    logicalRunAt,
    freshness: captureFreshness(bundle, logicalRunAt),
  };
}

export function manualIdempotencyKey(
  captureSha256: string,
  actualRunAt: string,
): string {
  return `manual:${captureSha256}:${projectCalendarDate(actualRunAt)}`;
}

export function normalizeCatchUpSlot(slot: string): string {
  return normalizeScheduledSlot(slot);
}

export function scheduledIdempotencyKey(slot: string): string {
  return scheduledIdempotencyKeyForSlot(
    "code-the-future",
    GRAPH_VERSION,
    slot,
  );
}

export function deterministicOperatorRunId(idempotencyKey: string): string {
  return `growth-operator-${sha256(idempotencyKey).slice(0, 32)}`;
}

export function findRunByIdempotencyKey(
  snapshot: OperatorStateSnapshot,
  idempotencyKey: string,
): RawRun | undefined {
  return snapshot.runs.find((run) => run.idempotencyKey === idempotencyKey);
}

function terminalClassification(run: RawRun): OperatorClassification {
  if (!run.finalized) {
    return run.checkpointPresent
      ? "interrupted_resumable"
      : "missing_checkpoint";
  }
  if (run.terminalStatus === "awaiting_review") return "awaiting_review";
  if (run.terminalStatus === "partial") return "partial";
  if (run.terminalStatus === "complete") return "completed";
  return "failed_terminal";
}

export function focusSnapshotOnRun(
  snapshot: OperatorStateSnapshot,
  runId: string,
): OperatorStateSnapshot {
  if (snapshot.classification === "uncertain_external_action") {
    return snapshot;
  }
  const run = snapshot.runs.find((candidate) => candidate.runId === runId);
  if (!run) return snapshot;
  const failure = snapshot.failureByRunId?.[runId] ?? null;
  const classification =
    !run.finalized && failure && !failure.retryable && !run.transactionId
      ? "failed_terminal"
      : terminalClassification(run);
  return {
    ...snapshot,
    classification,
    persistence: {
      ledger: snapshot.persistence.ledger,
      checkpoint: run.checkpointPresent ? "present" : "missing",
      committed: Boolean(run.transactionId),
      readbackVerified: run.readbackVerified,
    },
    run: runSummary(run),
    latestRun: run,
    failure,
    nextSafeAction:
      classification === "failed_terminal" && !run.transactionId
        ? "Repair the permanent input or policy defect; do not resume this failed run."
        : run.terminalStatus === "awaiting_review"
        ? "Inspect this run's hash-bound review package; do not replay it."
        : run.nextSafeAction ??
          "Inspect this exact verified run; no external action occurred.",
  };
}
