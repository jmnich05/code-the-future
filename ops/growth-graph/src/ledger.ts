import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import {
  assertNoSecrets,
  type CaptureIntakeResult,
  serializeArtifactJson,
} from "./artifacts.js";
import type {
  ApprovalPackage,
  EvalFinding,
  GraphError,
  GrowthLane,
  HumanReview,
  PortfolioAnalysis,
  StrategyProposal,
} from "./schema.js";
import { HumanReviewSchema } from "./schema.js";

export const LEDGER_SCHEMA_VERSION = 2 as const;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type LedgerWriteOutcome = "created" | "replayed";

export interface LedgerRunInput {
  runId: string;
  threadId: string;
  idempotencyKey: string;
  workflowName: string;
  policyHash: string;
  runtimeHash: string;
  captureBundleHash: string;
  startedAt: string;
  triggerKind: "manual" | "scheduled" | "resume" | "test";
}

export interface LedgerRunRecord extends LedgerRunInput {}

export interface BeginRunResult {
  outcome: LedgerWriteOutcome;
  run: LedgerRunRecord;
}

export interface LegacyRunCheckpointAuthority {
  runId: string;
  threadId: string;
  startedAt: string;
}

export interface LedgerEventInput {
  eventId: string;
  runId: string;
  idempotencyKey: string;
  type: string;
  node: string;
  attempt: number;
  createdAt: string;
  payload: JsonValue;
}

export interface LedgerEventRecord extends LedgerEventInput {}

export interface ModelCacheInput {
  cacheId: string;
  runId: string;
  idempotencyKey: string;
  node: string;
  requestHash: string;
  modelId: string;
  createdAt: string;
  output: JsonValue;
}

export interface ModelCacheRecord extends ModelCacheInput {}

export interface LedgerEvidenceInput {
  evidenceId: string;
  idempotencyKey: string;
  lane: GrowthLane;
  source: string;
  sha256: string;
  artifactPath: string;
  capturedAt: string;
  payload: JsonValue;
}

export interface LedgerEvidenceRecord extends LedgerEvidenceInput {
  runId: string;
}

export interface LedgerMetricInput {
  metricId: string;
  idempotencyKey: string;
  lane: GrowthLane;
  metricName: string;
  platform?: "instagram" | "facebook";
  value: number | null;
  unit: "count" | "rate" | "score";
  windowStart?: string;
  windowEnd?: string;
  complete: boolean;
  evidenceRefs: string[];
}

export interface LedgerMetricRecord extends LedgerMetricInput {
  runId: string;
}

export interface LedgerContactInput {
  contactId: string;
  idempotencyKey: string;
  identityFingerprint: string;
  recordId: string;
  organizationName: string;
  sourceUrl: string;
  destination?: string;
  qualificationScore: number;
  status: "qualified_candidate" | "existing" | "blocked";
  evidenceRefs: string[];
}

export interface LedgerContactRecord extends LedgerContactInput {
  runId: string;
}

export interface LedgerExperimentInput {
  experimentId: string;
  idempotencyKey: string;
  proposalId: string;
  lane: GrowthLane;
  hypothesis: string;
  controlledVariable: string;
  arm: string;
  primaryKpi: string;
  measurementWindowDays: number;
  status: "draft" | "quarantined";
  approvalHash?: string;
  externalActionStatus: "not_executed";
  payload: JsonValue;
}

export interface LedgerExperimentRecord extends LedgerExperimentInput {
  runId: string;
}

export interface LedgerEvalInput {
  evalId: string;
  idempotencyKey: string;
  proposalId: string;
  lane: GrowthLane;
  verdict: "pass" | "repair" | "quarantine";
  repairCount: number;
  defects: string[];
  evidenceRefs: string[];
}

export interface LedgerEvalRecord extends LedgerEvalInput {
  runId: string;
}

export interface LedgerReviewInput {
  reviewId: string;
  idempotencyKey: string;
  proposalId: string;
  lane: GrowthLane;
  reviewKind: "proposal_review" | "external_action_approval";
  status: "awaiting_review";
  approvalHash: string;
  approvalPackage: ApprovalPackage;
  requestedAt: string;
}

export interface LedgerReviewRecord extends LedgerReviewInput {
  runId: string;
}

export interface LedgerErrorInput {
  errorId: string;
  runId: string;
  idempotencyKey: string;
  fingerprint: string;
  node: string;
  category: string;
  attempt: number;
  retryable: boolean;
  message: string;
  evidenceRefs: string[];
  resolution?: string;
  createdAt: string;
}

export interface LedgerErrorRecord extends LedgerErrorInput {}

export interface LedgerOutboxInput {
  outboxId: string;
  idempotencyKey: string;
  lane: GrowthLane;
  kind: "social_draft" | "outreach_draft" | "seo_change_draft";
  contentHash: string;
  status: "draft";
  createdAt: string;
  payload: JsonValue;
}

export interface LedgerOutboxRecord extends LedgerOutboxInput {
  runId: string;
}

export interface PortfolioCommitInput {
  transactionId: string;
  runId: string;
  committedAt: string;
  terminalStatus: "awaiting_review" | "complete" | "partial" | "blocked" | "failed";
  nextSafeAction: string;
  evidence: LedgerEvidenceInput[];
  metrics: LedgerMetricInput[];
  contacts: LedgerContactInput[];
  experiments: LedgerExperimentInput[];
  evals: LedgerEvalInput[];
  reviews: LedgerReviewInput[];
  errors: LedgerErrorInput[];
  outbox: LedgerOutboxInput[];
}

export interface CommitCounts {
  evidence: number;
  metrics: number;
  contacts: number;
  experiments: number;
  evals: number;
  reviews: number;
  errors: number;
  outbox: number;
}

export interface CommitReadback {
  transactionId: string;
  runId: string;
  terminalStatus: PortfolioCommitInput["terminalStatus"];
  nextSafeAction: string;
  commitHash: string;
  contentHash: string;
  counts: CommitCounts;
}

export interface LedgerTransactionRecord extends CommitReadback {
  committedAt: string;
}

export interface LedgerRunSnapshot {
  run: LedgerRunRecord;
  events: LedgerEventRecord[];
  evidence: LedgerEvidenceRecord[];
  metrics: LedgerMetricRecord[];
  contacts: LedgerContactRecord[];
  experiments: LedgerExperimentRecord[];
  evals: LedgerEvalRecord[];
  reviews: LedgerReviewRecord[];
  errors: LedgerErrorRecord[];
  outbox: LedgerOutboxRecord[];
  modelCache: ModelCacheRecord[];
  transaction: LedgerTransactionRecord | null;
}

export type ShadowBoundaryViolationSource =
  | "consequential_event"
  | "outbox_status"
  | "experiment_external_action_status";

export class LedgerConflictError extends Error {
  override name = "LedgerConflictError";
}

export class LedgerReadbackError extends Error {
  override name = "LedgerReadbackError";
}

type SqlRow = Record<string, unknown>;

function canonicalJson(value: JsonValue | object): string {
  const encoded = serializeArtifactJson(value).trimEnd();
  try {
    JSON.parse(encoded);
  } catch {
    throw new LedgerConflictError("Ledger payload must be JSON serializable");
  }
  return encoded;
}

function rowHash(value: unknown): string {
  return createHash("sha256").update(serializeArtifactJson(value)).digest("hex");
}

function parseJson(value: unknown): JsonValue {
  if (typeof value !== "string") throw new LedgerReadbackError("Expected JSON text");
  return JSON.parse(value) as JsonValue;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new LedgerReadbackError(`Expected ${field}`);
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new LedgerReadbackError(`Expected ${field}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function integerBoolean(value: unknown): boolean {
  return value === 1;
}

const APPEND_ONLY_TABLES = [
  "runs",
  "events",
  "evidence",
  "metric_snapshots",
  "contacts",
  "experiments",
  "evals",
  "reviews",
  "errors",
  "outbox",
  "model_cache",
  "transactions",
] as const;

const COMMIT_BOUND_TABLES: ReadonlyArray<{
  countKey: keyof CommitCounts;
  table: string;
}> = [
  { countKey: "evidence", table: "evidence" },
  { countKey: "metrics", table: "metric_snapshots" },
  { countKey: "contacts", table: "contacts" },
  { countKey: "experiments", table: "experiments" },
  { countKey: "evals", table: "evals" },
  { countKey: "reviews", table: "reviews" },
  { countKey: "errors", table: "errors" },
  { countKey: "outbox", table: "outbox" },
];

export class GrowthLedger {
  readonly databasePath: string;
  private readonly database: DatabaseSync;

  constructor(databasePath: string, options: { readOnly?: boolean } = {}) {
    this.databasePath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
    if (this.databasePath !== ":memory:" && !options.readOnly) {
      mkdirSync(dirname(this.databasePath), { recursive: true, mode: 0o700 });
    }
    this.database = options.readOnly
      ? new DatabaseSync(this.databasePath, { readOnly: true })
      : new DatabaseSync(this.databasePath);
    this.database.exec("PRAGMA foreign_keys = ON");
    if (!options.readOnly) {
      this.database.exec("PRAGMA journal_mode = WAL");
      this.database.exec("PRAGMA synchronous = FULL");
    }
    this.database.exec("PRAGMA busy_timeout = 5000");
    const versionRow = this.database.prepare("PRAGMA user_version").get() as SqlRow;
    const version = asNumber(versionRow.user_version, "ledger user_version");
    if (version > LEDGER_SCHEMA_VERSION) {
      this.database.close();
      throw new LedgerConflictError(
        `Ledger schema ${version} is newer than supported schema ${LEDGER_SCHEMA_VERSION}`,
      );
    }
    if (options.readOnly && version !== LEDGER_SCHEMA_VERSION) {
      this.database.close();
      throw new LedgerConflictError(`Unsupported ledger schema version: ${version}`);
    } else if (version === 0) {
      const tableCountRow = this.database
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .get() as SqlRow;
      if (asNumber(tableCountRow.count, "ledger table count") > 0) {
        this.database.close();
        throw new LedgerConflictError(
          "Unversioned non-empty ledger is incompatible; refusing an implicit migration",
        );
      }
      this.initialize();
      this.database.exec(`PRAGMA user_version = ${LEDGER_SCHEMA_VERSION}`);
    } else if (version === LEDGER_SCHEMA_VERSION) {
      if (!options.readOnly) this.initialize();
    } else {
      this.database.close();
      throw new LedgerConflictError(`Unsupported ledger schema version: ${version}`);
    }
    this.validateSchema();
    if (this.databasePath !== ":memory:" && !options.readOnly) {
      chmodSync(this.databasePath, 0o600);
    }
  }

  close(): void {
    this.database.close();
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        workflow_name TEXT NOT NULL,
        policy_hash TEXT NOT NULL,
        runtime_hash TEXT NOT NULL,
        capture_bundle_hash TEXT NOT NULL,
        started_at TEXT NOT NULL,
        trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual','scheduled','resume','test')),
        row_hash TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        node TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, event_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS evidence (
        evidence_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        lane TEXT NOT NULL,
        source TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        artifact_path TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, evidence_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS metric_snapshots (
        metric_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        lane TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        platform TEXT,
        value REAL,
        unit TEXT NOT NULL,
        window_start TEXT,
        window_end TEXT,
        complete INTEGER NOT NULL CHECK (complete IN (0,1)),
        evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, metric_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS contacts (
        contact_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        identity_fingerprint TEXT NOT NULL,
        record_id TEXT NOT NULL,
        organization_name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        destination TEXT,
        qualification_score REAL NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('qualified_candidate','existing','blocked')),
        evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, contact_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS experiments (
        experiment_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        lane TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        controlled_variable TEXT NOT NULL,
        arm TEXT NOT NULL,
        primary_kpi TEXT NOT NULL,
        measurement_window_days INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft','quarantined')),
        approval_hash TEXT,
        external_action_status TEXT NOT NULL CHECK (external_action_status = 'not_executed'),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, experiment_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS evals (
        eval_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        lane TEXT NOT NULL,
        verdict TEXT NOT NULL CHECK (verdict IN ('pass','repair','quarantine')),
        repair_count INTEGER NOT NULL CHECK (repair_count BETWEEN 0 AND 2),
        defects_json TEXT NOT NULL CHECK (json_valid(defects_json)),
        evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, eval_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS reviews (
        review_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        lane TEXT NOT NULL,
        review_kind TEXT NOT NULL CHECK (review_kind IN ('proposal_review','external_action_approval')),
        status TEXT NOT NULL CHECK (status = 'awaiting_review'),
        approval_hash TEXT NOT NULL,
        approval_package_json TEXT NOT NULL CHECK (json_valid(approval_package_json)),
        requested_at TEXT NOT NULL,
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, review_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS errors (
        error_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        node TEXT NOT NULL,
        category TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        retryable INTEGER NOT NULL CHECK (retryable IN (0,1)),
        message TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
        resolution TEXT,
        created_at TEXT NOT NULL,
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, error_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS outbox (
        outbox_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        lane TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('social_draft','outreach_draft','seo_change_draft')),
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status = 'draft'),
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, outbox_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS model_cache (
        cache_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        idempotency_key TEXT NOT NULL,
        node TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        output_json TEXT NOT NULL CHECK (json_valid(output_json)),
        row_hash TEXT NOT NULL,
        PRIMARY KEY (run_id, cache_id),
        UNIQUE (run_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id),
        committed_at TEXT NOT NULL,
        terminal_status TEXT NOT NULL CHECK (terminal_status IN ('awaiting_review','complete','partial','blocked','failed')),
        next_safe_action TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        counts_json TEXT NOT NULL CHECK (json_valid(counts_json)),
        row_hash TEXT NOT NULL
      ) STRICT;
    `);

    for (const table of APPEND_ONLY_TABLES) {
      this.database.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_reject_update
        BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS ${table}_reject_delete
        BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;
      `);
    }

    for (const { table } of COMMIT_BOUND_TABLES) {
      this.database.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_reject_post_commit_insert
        BEFORE INSERT ON ${table}
        WHEN EXISTS (
          SELECT 1 FROM transactions WHERE run_id = NEW.run_id
        )
        BEGIN
          SELECT RAISE(ABORT, '${table} is sealed after transaction commit');
        END;
      `);
    }
  }

  private validateSchema(): void {
    const required: Record<string, readonly string[]> = {
      runs: ["run_id", "idempotency_key", "row_hash"],
      events: ["event_id", "run_id", "idempotency_key", "payload_json", "row_hash"],
      evidence: ["evidence_id", "run_id", "sha256", "row_hash"],
      metric_snapshots: ["metric_id", "run_id", "row_hash"],
      contacts: ["contact_id", "identity_fingerprint", "row_hash"],
      experiments: ["experiment_id", "external_action_status", "row_hash"],
      evals: ["eval_id", "repair_count", "row_hash"],
      reviews: [
        "review_id",
        "review_kind",
        "approval_hash",
        "approval_package_json",
        "row_hash",
      ],
      errors: ["error_id", "fingerprint", "row_hash"],
      outbox: ["outbox_id", "status", "row_hash"],
      model_cache: ["cache_id", "request_hash", "output_json", "row_hash"],
      transactions: [
        "transaction_id",
        "commit_hash",
        "content_hash",
        "counts_json",
        "row_hash",
      ],
    };
    for (const [table, columns] of Object.entries(required)) {
      const present = new Set(
        (this.database.prepare(`PRAGMA table_info(${table})`).all() as SqlRow[]).map((row) =>
          asString(row.name, `${table} column`),
        ),
      );
      if (columns.some((column) => !present.has(column))) {
        this.database.close();
        throw new LedgerConflictError(`Ledger schema ${LEDGER_SCHEMA_VERSION} is incompatible`);
      }
    }
  }

  beginRun(input: LedgerRunInput): BeginRunResult {
    assertNoSecrets(input);
    const legacySemanticHash = rowHash({
      idempotencyKey: input.idempotencyKey,
      workflowName: input.workflowName,
      policyHash: input.policyHash,
      runtimeHash: input.runtimeHash,
      captureBundleHash: input.captureBundleHash,
      triggerKind: input.triggerKind,
    });
    const hash = rowHash(input);
    const result = this.database
      .prepare(`
        INSERT INTO runs (
          run_id, thread_id, idempotency_key, workflow_name, policy_hash,
          runtime_hash, capture_bundle_hash, started_at, trigger_kind, row_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `)
      .run(
        input.runId,
        input.threadId,
        input.idempotencyKey,
        input.workflowName,
        input.policyHash,
        input.runtimeHash,
        input.captureBundleHash,
        input.startedAt,
        input.triggerKind,
        hash,
      );
    const byIdempotency = this.database
      .prepare("SELECT * FROM runs WHERE idempotency_key = ?")
      .get(input.idempotencyKey) as SqlRow | undefined;
    if (byIdempotency) {
      const stored = this.mapRun(byIdempotency);
      const storedFullHash = rowHash(stored);
      const storedLegacyHash = rowHash({
        idempotencyKey: stored.idempotencyKey,
        workflowName: stored.workflowName,
        policyHash: stored.policyHash,
        runtimeHash: stored.runtimeHash,
        captureBundleHash: stored.captureBundleHash,
        triggerKind: stored.triggerKind,
      });
      if (
        byIdempotency.row_hash !== storedFullHash &&
        byIdempotency.row_hash !== storedLegacyHash
      ) {
        throw new LedgerReadbackError(
          "Stored run row hash does not match its canonical authority fields",
        );
      }
      const semanticIdentityMatches =
        input.idempotencyKey === stored.idempotencyKey &&
        input.workflowName === stored.workflowName &&
        input.policyHash === stored.policyHash &&
        input.runtimeHash === stored.runtimeHash &&
        input.captureBundleHash === stored.captureBundleHash &&
        input.triggerKind === stored.triggerKind;
      if (
        semanticIdentityMatches &&
        (byIdempotency.row_hash === storedFullHash ||
          byIdempotency.row_hash === legacySemanticHash)
      ) {
        return {
          outcome: result.changes === 1 ? "created" : "replayed",
          run: stored,
        };
      }
    }
    const byRunId = this.database.prepare("SELECT * FROM runs WHERE run_id = ?").get(input.runId) as
      | SqlRow
      | undefined;
    if (byRunId || byIdempotency) {
      throw new LedgerConflictError("Run idempotency key conflicts with different input");
    }
    throw new LedgerReadbackError("Inserted run did not read back");
  }

  appendEvent(input: LedgerEventInput): LedgerWriteOutcome {
    assertNoSecrets(input);
    return this.insertIdempotent(
      "events",
      "event_id",
      input.eventId,
      input.runId,
      input.idempotencyKey,
      input,
      ["event_type", "node", "attempt", "created_at", "payload_json"],
      [input.type, input.node, input.attempt, input.createdAt, canonicalJson(input.payload)],
    );
  }

  findEventByIdempotencyKey(runId: string, idempotencyKey: string): LedgerEventRecord | null {
    const row = this.database
      .prepare("SELECT * FROM events WHERE run_id = ? AND idempotency_key = ?")
      .get(runId, idempotencyKey) as SqlRow | undefined;
    return row ? this.mapEvent(row) : null;
  }

  countEvents(runId: string, type?: string): number {
    const row = type
      ? (this.database
          .prepare("SELECT count(*) AS count FROM events WHERE run_id = ? AND event_type = ?")
          .get(runId, type) as SqlRow)
      : (this.database
          .prepare("SELECT count(*) AS count FROM events WHERE run_id = ?")
          .get(runId) as SqlRow);
    return asNumber(row.count, "event count");
  }

  cacheModelOutput(input: ModelCacheInput): LedgerWriteOutcome {
    assertNoSecrets(input);
    return this.insertIdempotent(
      "model_cache",
      "cache_id",
      input.cacheId,
      input.runId,
      input.idempotencyKey,
      input,
      ["node", "request_hash", "model_id", "created_at", "output_json"],
      [input.node, input.requestHash, input.modelId, input.createdAt, canonicalJson(input.output)],
    );
  }

  readCachedModelOutput(runId: string, idempotencyKey: string): ModelCacheRecord | null {
    const row = this.database
      .prepare("SELECT * FROM model_cache WHERE run_id = ? AND idempotency_key = ?")
      .get(runId, idempotencyKey) as SqlRow | undefined;
    return row ? this.mapModelCache(row) : null;
  }

  recordError(input: LedgerErrorInput): LedgerWriteOutcome {
    assertNoSecrets(input);
    return this.insertError(input);
  }

  commitPortfolio(input: PortfolioCommitInput): CommitReadback {
    assertNoSecrets(input);
    if (input.errors.some((error) => error.runId !== input.runId)) {
      throw new LedgerConflictError("Every committed error must match the portfolio run");
    }
    const existing = this.readTransactionByRun(input.runId);
    const { committedAt: _nondeterministicCommitTime, ...semanticCommit } = input;
    const commitHash = rowHash(semanticCommit);
    if (existing) {
      if (existing.transactionId !== input.transactionId || existing.commitHash !== commitHash) {
        throw new LedgerConflictError("Run already has a different committed transaction");
      }
      this.assertReadback(input.runId, existing);
      return existing;
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const item of input.evidence) this.insertEvidence(input.runId, item);
      for (const item of input.metrics) this.insertMetric(input.runId, item);
      for (const item of input.contacts) this.insertContact(input.runId, item);
      for (const item of input.experiments) this.insertExperiment(input.runId, item);
      for (const item of input.evals) this.insertEval(input.runId, item);
      for (const item of input.reviews) this.insertReview(input.runId, item);
      for (const item of input.errors) this.insertError(item);
      for (const item of input.outbox) this.insertOutbox(input.runId, item);

      const counts = this.countsForRun(input.runId);
      const contentHash = this.contentHashForRun(input.runId);
      const transactionHash = rowHash({
        transactionId: input.transactionId,
        runId: input.runId,
        committedAt: input.committedAt,
        terminalStatus: input.terminalStatus,
        nextSafeAction: input.nextSafeAction,
        commitHash,
        contentHash,
        counts,
      });
      const result = this.database
        .prepare(`
          INSERT INTO transactions (
            transaction_id, run_id, committed_at, terminal_status,
            next_safe_action, commit_hash, content_hash, counts_json, row_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING
        `)
        .run(
          input.transactionId,
          input.runId,
          input.committedAt,
          input.terminalStatus,
          input.nextSafeAction,
          commitHash,
          contentHash,
          canonicalJson(counts),
          transactionHash,
        );
      if (result.changes !== 1) {
        throw new LedgerConflictError("Transaction identifier already exists");
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    const readback: CommitReadback = {
      transactionId: input.transactionId,
      runId: input.runId,
      terminalStatus: input.terminalStatus,
      nextSafeAction: input.nextSafeAction,
      commitHash,
      contentHash: this.contentHashForRun(input.runId),
      counts: this.countsForRun(input.runId),
    };
    this.assertReadback(input.runId, readback);
    return readback;
  }

  readRun(runId: string): LedgerRunSnapshot | null {
    const runRow = this.database.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as
      | SqlRow
      | undefined;
    if (!runRow) return null;
    return {
      run: this.mapRun(runRow),
      events: this.rows("events", runId).map((row) => this.mapEvent(row)),
      evidence: this.rows("evidence", runId).map((row) => this.mapEvidence(row)),
      metrics: this.rows("metric_snapshots", runId).map((row) => this.mapMetric(row)),
      contacts: this.rows("contacts", runId).map((row) => this.mapContact(row)),
      experiments: this.rows("experiments", runId).map((row) => this.mapExperiment(row)),
      evals: this.rows("evals", runId).map((row) => this.mapEval(row)),
      reviews: this.rows("reviews", runId).map((row) => this.mapReview(row)),
      errors: this.rows("errors", runId).map((row) => this.mapError(row)),
      outbox: this.rows("outbox", runId).map((row) => this.mapOutbox(row)),
      modelCache: this.rows("model_cache", runId).map((row) => this.mapModelCache(row)),
      transaction: this.readTransactionByRun(runId),
    };
  }

  assertReadback(runId: string, expected: CommitReadback): LedgerRunSnapshot {
    const snapshot = this.readRun(runId);
    if (!snapshot?.transaction) throw new LedgerReadbackError("Committed run is missing");
    const actual = snapshot.transaction;
    if (
      actual.transactionId !== expected.transactionId ||
      actual.commitHash !== expected.commitHash ||
      actual.contentHash !== expected.contentHash ||
      actual.terminalStatus !== expected.terminalStatus ||
      actual.nextSafeAction !== expected.nextSafeAction
    ) {
      throw new LedgerReadbackError("Committed transaction did not read back exactly");
    }
    const actualCounts = this.countsForRun(runId);
    if (
      rowHash(actual.counts) !== rowHash(expected.counts) ||
      rowHash(actualCounts) !== rowHash(expected.counts)
    ) {
      throw new LedgerReadbackError("Committed row counts did not read back exactly");
    }
    const actualContentHash = this.contentHashForRun(runId);
    if (actualContentHash !== actual.contentHash) {
      throw new LedgerReadbackError("Committed row content did not read back exactly");
    }
    return snapshot;
  }

  verifyCommittedRun(
    runId: string,
    legacyAuthority?: LegacyRunCheckpointAuthority,
  ): LedgerRunSnapshot {
    this.verifyRunAuthority(runId, legacyAuthority);
    const transaction = this.readTransactionByRun(runId);
    if (!transaction) throw new LedgerReadbackError("Committed run is missing");
    return this.assertReadback(runId, transaction);
  }

  verifyRunAuthority(
    runId: string,
    legacyAuthority?: LegacyRunCheckpointAuthority,
  ): LedgerRunSnapshot {
    const runRow = this.database
      .prepare("SELECT * FROM runs WHERE run_id = ?")
      .get(runId) as SqlRow | undefined;
    if (!runRow) throw new LedgerReadbackError("Run authority row is missing");
    const run = this.mapRun(runRow);
    const expectedLegacyRunHash = rowHash({
      idempotencyKey: run.idempotencyKey,
      workflowName: run.workflowName,
      policyHash: run.policyHash,
      runtimeHash: run.runtimeHash,
      captureBundleHash: run.captureBundleHash,
      triggerKind: run.triggerKind,
    });
    const expectedFullRunHash = rowHash(run);
    const storedRunHash = asString(runRow.row_hash, "runs row_hash");
    const legacyAuthorityMatches =
      storedRunHash === expectedLegacyRunHash &&
      legacyAuthority?.runId === run.runId &&
      legacyAuthority.threadId === run.threadId &&
      legacyAuthority.startedAt === run.startedAt;
    if (storedRunHash !== expectedFullRunHash && !legacyAuthorityMatches) {
      throw new LedgerReadbackError(
        "Stored run row hash does not match its canonical authority fields",
      );
    }

    for (const eventRow of this.rows("events", runId)) {
      if (
        asString(eventRow.row_hash, "events row_hash") !==
        rowHash(this.mapEvent(eventRow))
      ) {
        throw new LedgerReadbackError(
          "Stored event row hash does not match its canonical payload",
        );
      }
    }
    for (const cacheRow of this.rows("model_cache", runId)) {
      if (
        asString(cacheRow.row_hash, "model_cache row_hash") !==
        rowHash(this.mapModelCache(cacheRow))
      ) {
        throw new LedgerReadbackError(
          "Stored model-cache row hash does not match its canonical payload",
        );
      }
    }
    // This validates every commit-bound row hash even before a transaction is
    // present, so failure and review classification never trusts mutable bytes.
    this.contentHashForRun(runId);

    const transactionRow = this.database
      .prepare("SELECT * FROM transactions WHERE run_id = ?")
      .get(runId) as SqlRow | undefined;
    if (transactionRow) {
      const transaction = this.readTransactionByRun(runId);
      if (!transaction) {
        throw new LedgerReadbackError("Transaction authority row is unreadable");
      }
      const expectedTransactionHash = rowHash({
        transactionId: transaction.transactionId,
        runId: transaction.runId,
        committedAt: transaction.committedAt,
        terminalStatus: transaction.terminalStatus,
        nextSafeAction: transaction.nextSafeAction,
        commitHash: transaction.commitHash,
        contentHash: transaction.contentHash,
        counts: transaction.counts,
      });
      if (
        asString(transactionRow.row_hash, "transactions row_hash") !==
        expectedTransactionHash
      ) {
        throw new LedgerReadbackError(
          "Stored transaction row hash does not match its canonical payload",
        );
      }
    }
    const snapshot = this.readRun(runId);
    if (!snapshot) throw new LedgerReadbackError("Run authority readback is missing");
    return snapshot;
  }

  /**
   * Call only after verifyRunAuthority/verifyCommittedRun for the same run.
   * CTF v1 is a strict shadow runtime, so any consequential action marker is
   * an uncertainty boundary rather than proof that an action did or did not
   * finish.
   */
  findShadowBoundaryViolation(
    runId: string,
  ): ShadowBoundaryViolationSource | null {
    const consequentialPrefix =
      /^(?:external|delivery|message|application|ats|publish|send|merge|deploy)/iu;
    for (const row of this.rows("events", runId)) {
      const event = this.mapEvent(row);
      if (
        consequentialPrefix.test(event.type) ||
        consequentialPrefix.test(event.node)
      ) {
        return "consequential_event";
      }
    }
    for (const row of this.rows("outbox", runId)) {
      if (asString(row.status, "outbox status") !== "draft") {
        return "outbox_status";
      }
    }
    for (const row of this.rows("experiments", runId)) {
      if (
        asString(
          row.external_action_status,
          "experiment external_action_status",
        ) !== "not_executed"
      ) {
        return "experiment_external_action_status";
      }
    }
    return null;
  }

  listUncommittedRunIds(): string[] {
    return (
      this.database
        .prepare(`
          SELECT r.run_id
          FROM runs r
          LEFT JOIN transactions t ON t.run_id = r.run_id
          WHERE t.run_id IS NULL
          ORDER BY r.rowid
        `)
        .all() as SqlRow[]
    ).map((row) => asString(row.run_id, "run_id"));
  }

  listPendingReviews(): LedgerReviewRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM reviews WHERE status = 'awaiting_review' ORDER BY requested_at, review_id")
      .all() as SqlRow[];
    return rows.map((row) => this.mapReview(row));
  }

  private rows(table: string, runId: string): SqlRow[] {
    return this.database
      .prepare(`SELECT * FROM ${table} WHERE run_id = ? ORDER BY rowid`)
      .all(runId) as SqlRow[];
  }

  private countsForRun(runId: string): CommitCounts {
    const count = (table: string): number => {
      const row = this.database
        .prepare(`SELECT count(*) AS count FROM ${table} WHERE run_id = ?`)
        .get(runId) as SqlRow;
      return asNumber(row.count, `${table} count`);
    };
    const counts = {} as CommitCounts;
    for (const { countKey, table } of COMMIT_BOUND_TABLES) {
      counts[countKey] = count(table);
    }
    return counts;
  }

  private contentHashForRun(runId: string): string {
    const tables = COMMIT_BOUND_TABLES.map(({ table }) => ({
      table,
      rowHashes: (
        this.database
          .prepare(`SELECT * FROM ${table} WHERE run_id = ? ORDER BY row_hash, rowid`)
          .all(runId) as SqlRow[]
      ).map((row) => {
        const storedHash = asString(row.row_hash, `${table} row_hash`);
        const computedHash = this.commitBoundRowHash(table, row);
        if (storedHash !== computedHash) {
          throw new LedgerReadbackError(
            `Stored ${table} row hash does not match its canonical payload`,
          );
        }
        return storedHash;
      }),
    }));
    return rowHash(tables);
  }

  private commitBoundRowHash(table: string, row: SqlRow): string {
    switch (table) {
      case "evidence": {
        const { runId: _runId, ...input } = this.mapEvidence(row);
        return rowHash(input);
      }
      case "metric_snapshots": {
        const { runId: _runId, ...input } = this.mapMetric(row);
        return rowHash(input);
      }
      case "contacts": {
        const { runId: _runId, ...input } = this.mapContact(row);
        return rowHash(input);
      }
      case "experiments": {
        const approvalHash = optionalString(row.approval_hash);
        return rowHash({
          experimentId: asString(row.experiment_id, "experiment_id"),
          idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
          proposalId: asString(row.proposal_id, "proposal_id"),
          lane: asString(row.lane, "lane"),
          hypothesis: asString(row.hypothesis, "hypothesis"),
          controlledVariable: asString(
            row.controlled_variable,
            "controlled_variable",
          ),
          arm: asString(row.arm, "arm"),
          primaryKpi: asString(row.primary_kpi, "primary_kpi"),
          measurementWindowDays: asNumber(
            row.measurement_window_days,
            "measurement_window_days",
          ),
          status: asString(row.status, "status"),
          ...(approvalHash ? { approvalHash } : {}),
          externalActionStatus: asString(
            row.external_action_status,
            "external_action_status",
          ),
          payload: parseJson(row.payload_json),
        });
      }
      case "evals": {
        const { runId: _runId, ...input } = this.mapEval(row);
        return rowHash(input);
      }
      case "reviews": {
        const { runId: _runId, ...input } = this.mapReview(row);
        return rowHash(input);
      }
      case "errors":
        return rowHash(this.mapError(row));
      case "outbox": {
        return rowHash({
          outboxId: asString(row.outbox_id, "outbox_id"),
          idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
          lane: asString(row.lane, "lane"),
          kind: asString(row.kind, "kind"),
          contentHash: asString(row.content_hash, "content_hash"),
          status: asString(row.status, "status"),
          createdAt: asString(row.created_at, "created_at"),
          payload: parseJson(row.payload_json),
        });
      }
      default:
        throw new LedgerReadbackError(`Unsupported commit-bound table: ${table}`);
    }
  }

  private insertIdempotent(
    table: string,
    idColumn: string,
    id: string,
    runId: string,
    idempotencyKey: string,
    hashInput: unknown,
    columns: string[],
    values: SQLInputValue[],
  ): LedgerWriteOutcome {
    const hash = rowHash(hashInput);
    const allColumns = [idColumn, "run_id", "idempotency_key", ...columns, "row_hash"];
    const placeholders = allColumns.map(() => "?").join(", ");
    const result = this.database
      .prepare(
        `INSERT INTO ${table} (${allColumns.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      )
      .run(id, runId, idempotencyKey, ...values, hash);
    if (result.changes === 1) return "created";
    const row = this.database
      .prepare(
        `SELECT ${idColumn}, idempotency_key, row_hash FROM ${table} WHERE run_id = ? AND (${idColumn} = ? OR idempotency_key = ?)`,
      )
      .get(runId, id, idempotencyKey) as SqlRow | undefined;
    if (!row || row[idColumn] !== id || row.idempotency_key !== idempotencyKey || row.row_hash !== hash) {
      throw new LedgerConflictError(`${table} idempotency conflict`);
    }
    return "replayed";
  }

  private insertEvidence(runId: string, input: LedgerEvidenceInput): LedgerWriteOutcome {
    return this.insertIdempotent(
      "evidence",
      "evidence_id",
      input.evidenceId,
      runId,
      input.idempotencyKey,
      input,
      ["lane", "source", "sha256", "artifact_path", "captured_at", "payload_json"],
      [
        input.lane,
        input.source,
        input.sha256,
        input.artifactPath,
        input.capturedAt,
        canonicalJson(input.payload),
      ],
    );
  }

  private insertMetric(runId: string, input: LedgerMetricInput): LedgerWriteOutcome {
    return this.insertIdempotent(
      "metric_snapshots",
      "metric_id",
      input.metricId,
      runId,
      input.idempotencyKey,
      input,
      [
        "lane",
        "metric_name",
        "platform",
        "value",
        "unit",
        "window_start",
        "window_end",
        "complete",
        "evidence_refs_json",
      ],
      [
        input.lane,
        input.metricName,
        input.platform ?? null,
        input.value,
        input.unit,
        input.windowStart ?? null,
        input.windowEnd ?? null,
        input.complete ? 1 : 0,
        canonicalJson(input.evidenceRefs),
      ],
    );
  }

  private insertContact(runId: string, input: LedgerContactInput): LedgerWriteOutcome {
    return this.insertIdempotent(
      "contacts",
      "contact_id",
      input.contactId,
      runId,
      input.idempotencyKey,
      input,
      [
        "identity_fingerprint",
        "record_id",
        "organization_name",
        "source_url",
        "destination",
        "qualification_score",
        "status",
        "evidence_refs_json",
      ],
      [
        input.identityFingerprint,
        input.recordId,
        input.organizationName,
        input.sourceUrl,
        input.destination ?? null,
        input.qualificationScore,
        input.status,
        canonicalJson(input.evidenceRefs),
      ],
    );
  }

  private insertExperiment(runId: string, input: LedgerExperimentInput): LedgerWriteOutcome {
    return this.insertIdempotent(
      "experiments",
      "experiment_id",
      input.experimentId,
      runId,
      input.idempotencyKey,
      input,
      [
        "proposal_id",
        "lane",
        "hypothesis",
        "controlled_variable",
        "arm",
        "primary_kpi",
        "measurement_window_days",
        "status",
        "approval_hash",
        "external_action_status",
        "payload_json",
      ],
      [
        input.proposalId,
        input.lane,
        input.hypothesis,
        input.controlledVariable,
        input.arm,
        input.primaryKpi,
        input.measurementWindowDays,
        input.status,
        input.approvalHash ?? null,
        input.externalActionStatus,
        canonicalJson(input.payload),
      ],
    );
  }

  private insertEval(runId: string, input: LedgerEvalInput): LedgerWriteOutcome {
    return this.insertIdempotent(
      "evals",
      "eval_id",
      input.evalId,
      runId,
      input.idempotencyKey,
      input,
      ["proposal_id", "lane", "verdict", "repair_count", "defects_json", "evidence_refs_json"],
      [
        input.proposalId,
        input.lane,
        input.verdict,
        input.repairCount,
        canonicalJson(input.defects),
        canonicalJson(input.evidenceRefs),
      ],
    );
  }

  private insertReview(runId: string, input: LedgerReviewInput): LedgerWriteOutcome {
    HumanReviewSchema.parse({
      review_id: input.reviewId,
      proposal_id: input.proposalId,
      lane: input.lane,
      review_kind: input.reviewKind,
      status: input.status,
      approval_hash: input.approvalHash,
      approval_package: input.approvalPackage,
      requested_at: input.requestedAt,
    });
    return this.insertIdempotent(
      "reviews",
      "review_id",
      input.reviewId,
      runId,
      input.idempotencyKey,
      input,
      [
        "proposal_id",
        "lane",
        "review_kind",
        "status",
        "approval_hash",
        "approval_package_json",
        "requested_at",
      ],
      [
        input.proposalId,
        input.lane,
        input.reviewKind,
        input.status,
        input.approvalHash,
        canonicalJson(input.approvalPackage),
        input.requestedAt,
      ],
    );
  }

  private insertError(input: LedgerErrorInput): LedgerWriteOutcome {
    return this.insertIdempotent(
      "errors",
      "error_id",
      input.errorId,
      input.runId,
      input.idempotencyKey,
      input,
      [
        "fingerprint",
        "node",
        "category",
        "attempt",
        "retryable",
        "message",
        "evidence_refs_json",
        "resolution",
        "created_at",
      ],
      [
        input.fingerprint,
        input.node,
        input.category,
        input.attempt,
        input.retryable ? 1 : 0,
        input.message,
        canonicalJson(input.evidenceRefs),
        input.resolution ?? null,
        input.createdAt,
      ],
    );
  }

  private insertOutbox(runId: string, input: LedgerOutboxInput): LedgerWriteOutcome {
    return this.insertIdempotent(
      "outbox",
      "outbox_id",
      input.outboxId,
      runId,
      input.idempotencyKey,
      input,
      ["lane", "kind", "content_hash", "status", "created_at", "payload_json"],
      [
        input.lane,
        input.kind,
        input.contentHash,
        input.status,
        input.createdAt,
        canonicalJson(input.payload),
      ],
    );
  }

  private mapRun(row: SqlRow): LedgerRunRecord {
    return {
      runId: asString(row.run_id, "run_id"),
      threadId: asString(row.thread_id, "thread_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      workflowName: asString(row.workflow_name, "workflow_name"),
      policyHash: asString(row.policy_hash, "policy_hash"),
      runtimeHash: asString(row.runtime_hash, "runtime_hash"),
      captureBundleHash: asString(row.capture_bundle_hash, "capture_bundle_hash"),
      startedAt: asString(row.started_at, "started_at"),
      triggerKind: asString(row.trigger_kind, "trigger_kind") as LedgerRunInput["triggerKind"],
    };
  }

  private mapEvent(row: SqlRow): LedgerEventRecord {
    return {
      eventId: asString(row.event_id, "event_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      type: asString(row.event_type, "event_type"),
      node: asString(row.node, "node"),
      attempt: asNumber(row.attempt, "attempt"),
      createdAt: asString(row.created_at, "created_at"),
      payload: parseJson(row.payload_json),
    };
  }

  private mapModelCache(row: SqlRow): ModelCacheRecord {
    return {
      cacheId: asString(row.cache_id, "cache_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      node: asString(row.node, "node"),
      requestHash: asString(row.request_hash, "request_hash"),
      modelId: asString(row.model_id, "model_id"),
      createdAt: asString(row.created_at, "created_at"),
      output: parseJson(row.output_json),
    };
  }

  private mapEvidence(row: SqlRow): LedgerEvidenceRecord {
    return {
      evidenceId: asString(row.evidence_id, "evidence_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      lane: asString(row.lane, "lane") as GrowthLane,
      source: asString(row.source, "source"),
      sha256: asString(row.sha256, "sha256"),
      artifactPath: asString(row.artifact_path, "artifact_path"),
      capturedAt: asString(row.captured_at, "captured_at"),
      payload: parseJson(row.payload_json),
    };
  }

  private mapMetric(row: SqlRow): LedgerMetricRecord {
    const platform = optionalString(row.platform);
    const windowStart = optionalString(row.window_start);
    const windowEnd = optionalString(row.window_end);
    return {
      metricId: asString(row.metric_id, "metric_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      lane: asString(row.lane, "lane") as GrowthLane,
      metricName: asString(row.metric_name, "metric_name"),
      ...(platform ? { platform: platform as "instagram" | "facebook" } : {}),
      value: typeof row.value === "number" ? row.value : null,
      unit: asString(row.unit, "unit") as LedgerMetricInput["unit"],
      ...(windowStart ? { windowStart } : {}),
      ...(windowEnd ? { windowEnd } : {}),
      complete: integerBoolean(row.complete),
      evidenceRefs: parseJson(row.evidence_refs_json) as string[],
    };
  }

  private mapContact(row: SqlRow): LedgerContactRecord {
    const destination = optionalString(row.destination);
    return {
      contactId: asString(row.contact_id, "contact_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      identityFingerprint: asString(row.identity_fingerprint, "identity_fingerprint"),
      recordId: asString(row.record_id, "record_id"),
      organizationName: asString(row.organization_name, "organization_name"),
      sourceUrl: asString(row.source_url, "source_url"),
      ...(destination ? { destination } : {}),
      qualificationScore: asNumber(row.qualification_score, "qualification_score"),
      status: asString(row.status, "status") as LedgerContactInput["status"],
      evidenceRefs: parseJson(row.evidence_refs_json) as string[],
    };
  }

  private mapExperiment(row: SqlRow): LedgerExperimentRecord {
    const approvalHash = optionalString(row.approval_hash);
    return {
      experimentId: asString(row.experiment_id, "experiment_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      proposalId: asString(row.proposal_id, "proposal_id"),
      lane: asString(row.lane, "lane") as GrowthLane,
      hypothesis: asString(row.hypothesis, "hypothesis"),
      controlledVariable: asString(row.controlled_variable, "controlled_variable"),
      arm: asString(row.arm, "arm"),
      primaryKpi: asString(row.primary_kpi, "primary_kpi"),
      measurementWindowDays: asNumber(row.measurement_window_days, "measurement_window_days"),
      status: asString(row.status, "status") as LedgerExperimentInput["status"],
      ...(approvalHash ? { approvalHash } : {}),
      externalActionStatus: "not_executed",
      payload: parseJson(row.payload_json),
    };
  }

  private mapEval(row: SqlRow): LedgerEvalRecord {
    return {
      evalId: asString(row.eval_id, "eval_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      proposalId: asString(row.proposal_id, "proposal_id"),
      lane: asString(row.lane, "lane") as GrowthLane,
      verdict: asString(row.verdict, "verdict") as LedgerEvalInput["verdict"],
      repairCount: asNumber(row.repair_count, "repair_count"),
      defects: parseJson(row.defects_json) as string[],
      evidenceRefs: parseJson(row.evidence_refs_json) as string[],
    };
  }

  private mapReview(row: SqlRow): LedgerReviewRecord {
    const parsed = HumanReviewSchema.parse({
      review_id: asString(row.review_id, "review_id"),
      proposal_id: asString(row.proposal_id, "proposal_id"),
      lane: asString(row.lane, "lane"),
      review_kind: asString(row.review_kind, "review_kind"),
      status: "awaiting_review",
      approval_hash: asString(row.approval_hash, "approval_hash"),
      approval_package: parseJson(row.approval_package_json),
      requested_at: asString(row.requested_at, "requested_at"),
    });
    return {
      reviewId: asString(row.review_id, "review_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      proposalId: asString(row.proposal_id, "proposal_id"),
      lane: asString(row.lane, "lane") as GrowthLane,
      reviewKind: parsed.review_kind,
      status: "awaiting_review",
      approvalHash: asString(row.approval_hash, "approval_hash"),
      approvalPackage: parsed.approval_package,
      requestedAt: asString(row.requested_at, "requested_at"),
    };
  }

  private mapError(row: SqlRow): LedgerErrorRecord {
    const resolution = optionalString(row.resolution);
    return {
      errorId: asString(row.error_id, "error_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      fingerprint: asString(row.fingerprint, "fingerprint"),
      node: asString(row.node, "node"),
      category: asString(row.category, "category"),
      attempt: asNumber(row.attempt, "attempt"),
      retryable: integerBoolean(row.retryable),
      message: asString(row.message, "message"),
      evidenceRefs: parseJson(row.evidence_refs_json) as string[],
      ...(resolution ? { resolution } : {}),
      createdAt: asString(row.created_at, "created_at"),
    };
  }

  private mapOutbox(row: SqlRow): LedgerOutboxRecord {
    return {
      outboxId: asString(row.outbox_id, "outbox_id"),
      runId: asString(row.run_id, "run_id"),
      idempotencyKey: asString(row.idempotency_key, "idempotency_key"),
      lane: asString(row.lane, "lane") as GrowthLane,
      kind: asString(row.kind, "kind") as LedgerOutboxInput["kind"],
      contentHash: asString(row.content_hash, "content_hash"),
      status: "draft",
      createdAt: asString(row.created_at, "created_at"),
      payload: parseJson(row.payload_json),
    };
  }

  private readTransactionByRun(runId: string): LedgerTransactionRecord | null {
    const row = this.database
      .prepare("SELECT * FROM transactions WHERE run_id = ?")
      .get(runId) as SqlRow | undefined;
    if (!row) return null;
    return {
      transactionId: asString(row.transaction_id, "transaction_id"),
      runId: asString(row.run_id, "run_id"),
      committedAt: asString(row.committed_at, "committed_at"),
      terminalStatus: asString(
        row.terminal_status,
        "terminal_status",
      ) as PortfolioCommitInput["terminalStatus"],
      nextSafeAction: asString(row.next_safe_action, "next_safe_action"),
      commitHash: asString(row.commit_hash, "commit_hash"),
      contentHash: asString(row.content_hash, "content_hash"),
      counts: parseJson(row.counts_json) as unknown as CommitCounts,
    };
  }
}

export function buildPortfolioCommitInput(input: {
  transactionId: string;
  runId: string;
  committedAt: string;
  terminalStatus: PortfolioCommitInput["terminalStatus"];
  nextSafeAction: string;
  intake: CaptureIntakeResult;
  analysis: PortfolioAnalysis;
  proposals?: StrategyProposal[];
  evals?: EvalFinding[];
  reviews?: HumanReview[];
  errors?: GraphError[];
  outbox?: LedgerOutboxInput[];
}): PortfolioCommitInput {
  const proposals = input.proposals ?? [];
  const evals = input.evals ?? [];
  const reviews = input.reviews ?? [];
  const errors = input.errors ?? [];
  const reviewByProposal = new Map(reviews.map((review) => [review.proposal_id, review]));
  const evalByProposal = new Map(evals.map((evaluation) => [evaluation.proposal_id, evaluation]));
  const contacts: LedgerContactInput[] = input.analysis.lanes
    .flatMap((lane) => lane.opportunities)
    .filter((item) => item.kind === "contact_discovery")
    .map((item) => ({
      contactId: item.candidate_id,
      idempotencyKey: `contact:${item.candidate_id}`,
      identityFingerprint: item.identity_fingerprint,
      recordId: item.record_id,
      organizationName: item.organization_name,
      sourceUrl: item.source_url,
      ...(item.destination ? { destination: item.destination } : {}),
      qualificationScore: item.score,
      status: "qualified_candidate",
      evidenceRefs: item.evidence_refs,
    }));

  return {
    transactionId: input.transactionId,
    runId: input.runId,
    committedAt: input.committedAt,
    terminalStatus: input.terminalStatus,
    nextSafeAction: input.nextSafeAction,
    evidence: [
      ...input.intake.evidence.map((item) => ({
        evidenceId: item.artifact.evidence_id,
        idempotencyKey: `evidence:${item.artifact.evidence_id}`,
        lane: item.artifact.lane,
        source: item.artifact.source,
        sha256: item.immutableArtifact.sha256,
        artifactPath: item.immutableArtifact.path,
        capturedAt: item.artifact.captured_at,
        payload: item.artifact as unknown as JsonValue,
      })),
      ...input.intake.assetArtifacts.map((asset) => {
        const parent = input.intake.evidence.find(
          (item) => item.artifact.evidence_id === asset.evidenceId,
        );
        if (!parent) {
          throw new LedgerConflictError("Intaken social asset is missing its evidence parent");
        }
        return {
          evidenceId: `asset-evidence:${asset.assetId}`,
          idempotencyKey: `asset-evidence:${asset.assetId}`,
          lane: "organic_social" as const,
          source: "social_asset",
          sha256: asset.contentSha256,
          artifactPath: asset.immutableArtifact.path,
          capturedAt: parent.artifact.captured_at,
          payload: {
            asset_id: asset.assetId,
            byte_length: asset.byteLength,
            parent_evidence_id: asset.evidenceId,
          },
        };
      }),
    ],
    metrics: input.analysis.lanes.flatMap((lane) =>
      lane.metrics.map((item) => ({
        metricId: item.metric_id,
        idempotencyKey: `metric:${item.metric_id}`,
        lane: item.lane,
        metricName: item.metric_name,
        ...(item.platform ? { platform: item.platform } : {}),
        value: item.value,
        unit: item.unit,
        ...(item.window_start ? { windowStart: item.window_start } : {}),
        ...(item.window_end ? { windowEnd: item.window_end } : {}),
        complete: item.complete,
        evidenceRefs: item.evidence_refs,
      })),
    ),
    contacts,
    experiments: proposals.map((proposal) => {
      const evaluation = evalByProposal.get(proposal.proposal_id);
      const review = reviewByProposal.get(proposal.proposal_id);
      return {
        experimentId: proposal.proposal_id,
        idempotencyKey: `experiment:${proposal.proposal_id}`,
        proposalId: proposal.proposal_id,
        lane: proposal.lane,
        hypothesis: proposal.hypothesis,
        controlledVariable: proposal.controlled_variable,
        arm: proposal.arm,
        primaryKpi: proposal.primary_kpi,
        measurementWindowDays: proposal.measurement_window_days,
        status: evaluation?.verdict === "quarantine" ? "quarantined" : "draft",
        ...(review ? { approvalHash: review.approval_hash } : {}),
        externalActionStatus: "not_executed",
        payload: proposal as unknown as JsonValue,
      };
    }),
    evals: evals.map((evaluation) => ({
      evalId: evaluation.eval_id,
      idempotencyKey: `eval:${evaluation.eval_id}`,
      proposalId: evaluation.proposal_id,
      lane: evaluation.lane,
      verdict: evaluation.verdict,
      repairCount: evaluation.repair_count,
      defects: evaluation.defects,
      evidenceRefs: evaluation.evidence_refs,
    })),
    reviews: reviews.map((review) => ({
      reviewId: review.review_id,
      idempotencyKey: `review:${review.review_id}`,
      proposalId: review.proposal_id,
      lane: review.lane,
      reviewKind: review.review_kind,
      status: review.status,
      approvalHash: review.approval_hash,
      approvalPackage: review.approval_package,
      requestedAt: review.requested_at,
    })),
    errors: errors.map((error) => ({
      errorId: error.error_id,
      runId: input.runId,
      idempotencyKey: `error:${error.error_id}`,
      fingerprint: error.fingerprint,
      node: error.node,
      category: error.category,
      attempt: error.attempt,
      retryable: error.retryable,
      message: error.message,
      evidenceRefs: error.evidence_refs,
      ...(error.resolution ? { resolution: error.resolution } : {}),
      createdAt: input.committedAt,
    })),
    outbox: input.outbox ?? [],
  };
}
