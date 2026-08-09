import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { SecretMaterialError } from "../src/artifacts.js";
import {
  GrowthLedger,
  LedgerConflictError,
  type LedgerRunInput,
  type PortfolioCommitInput,
} from "../src/ledger.js";
import {
  APPROVAL_PACKAGE_SCHEMA_VERSION,
  ApprovalPackageSchema,
  HumanReviewSchema,
  approvalPackageHash,
} from "../src/schema.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const startedAt = "2026-08-08T16:00:00-04:00";

function runInput(overrides: Partial<LedgerRunInput> = {}): LedgerRunInput {
  return {
    runId: "run:one",
    threadId: "thread:one",
    idempotencyKey: "trigger:2026-08-08",
    workflowName: "growth_portfolio_shadow_v1",
    policyHash: HASH_A,
    runtimeHash: HASH_B,
    captureBundleHash: HASH_A,
    startedAt,
    triggerKind: "scheduled",
    ...overrides,
  };
}

function emptyCommit(runId = "run:one"): PortfolioCommitInput {
  return {
    transactionId: `transaction:${runId}`,
    runId,
    committedAt: "2026-08-08T16:05:00-04:00",
    terminalStatus: "partial",
    nextSafeAction: "Inspect local gaps; no external action has occurred.",
    evidence: [],
    metrics: [],
    contacts: [],
    experiments: [],
    evals: [],
    reviews: [],
    errors: [],
    outbox: [],
  };
}

test("duplicate semantic trigger is a no-op and returns the original run", () => {
  const ledger = new GrowthLedger(":memory:");
  try {
    const first = ledger.beginRun(runInput());
    const replay = ledger.beginRun(
      runInput({
        runId: "run:new-generated-id",
        threadId: "thread:new-generated-id",
        startedAt: "2026-08-08T16:01:00-04:00",
      }),
    );
    assert.equal(first.outcome, "created");
    assert.equal(replay.outcome, "replayed");
    assert.equal(replay.run.runId, "run:one");
    assert.throws(
      () => ledger.beginRun(runInput({ captureBundleHash: HASH_B })),
      LedgerConflictError,
    );
  } finally {
    ledger.close();
  }
});

test("events and model outputs are durable idempotent caches", () => {
  const ledger = new GrowthLedger(":memory:");
  try {
    ledger.beginRun(runInput());
    const event = {
      eventId: "event:model-start",
      runId: "run:one",
      idempotencyKey: "model:start:organic-social:1",
      type: "model.call.started",
      node: "strategy",
      attempt: 1,
      createdAt: startedAt,
      payload: { lane: "organic_social" } as const,
    };
    assert.equal(ledger.appendEvent(event), "created");
    assert.equal(ledger.appendEvent(event), "replayed");
    assert.equal(ledger.countEvents("run:one", "model.call.started"), 1);
    assert.equal(
      ledger.findEventByIdempotencyKey("run:one", event.idempotencyKey)?.eventId,
      event.eventId,
    );
    assert.throws(
      () => ledger.appendEvent({ ...event, payload: { lane: "search_console" } }),
      LedgerConflictError,
    );

    const cached = {
      cacheId: "cache:strategy:1",
      runId: "run:one",
      idempotencyKey: "model:output:organic-social:1",
      node: "strategy",
      requestHash: HASH_A,
      modelId: "gpt-5.6-terra",
      createdAt: "2026-08-08T16:01:00-04:00",
      output: { decision: "repeat" } as const,
    };
    assert.equal(ledger.cacheModelOutput(cached), "created");
    assert.equal(ledger.cacheModelOutput(cached), "replayed");
    assert.deepEqual(
      ledger.readCachedModelOutput("run:one", cached.idempotencyKey)?.output,
      cached.output,
    );

    const tokenShapedValue = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
    assert.throws(
      () =>
        ledger.appendEvent({
          ...event,
          eventId: "event:secret",
          idempotencyKey: "event:secret",
          payload: { token: tokenShapedValue },
        }),
      SecretMaterialError,
    );
  } finally {
    ledger.close();
  }
});

test("commit readback includes pre-existing errors and replay ignores a new commit timestamp", () => {
  const ledger = new GrowthLedger(":memory:");
  try {
    ledger.beginRun(runInput());
    ledger.recordError({
      errorId: "error:transient:1",
      runId: "run:one",
      idempotencyKey: "error:transient:1",
      fingerprint: HASH_A,
      node: "strategy",
      category: "transient_provider",
      attempt: 1,
      retryable: true,
      message: "Synthetic connection interruption",
      evidenceRefs: [],
      createdAt: "2026-08-08T16:02:00-04:00",
    });
    const commit = emptyCommit();
    const first = ledger.commitPortfolio(commit);
    const replay = ledger.commitPortfolio({
      ...commit,
      committedAt: "2026-08-08T16:10:00-04:00",
    });
    assert.equal(first.commitHash, replay.commitHash);
    assert.match(first.contentHash, /^[a-f0-9]{64}$/u);
    assert.equal(first.contentHash, replay.contentHash);
    assert.equal(first.counts.errors, 1);
    assert.equal(ledger.readRun("run:one")?.errors.length, 1);
    assert.equal(ledger.readRun("run:one")?.transaction?.committedAt, commit.committedAt);
  } finally {
    ledger.close();
  }
});

test("a committed transaction seals canonical rows while events remain appendable", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-ledger-seal-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledgerPath = join(root, "ledger.sqlite");
  const ledger = new GrowthLedger(ledgerPath);
  try {
    ledger.beginRun(runInput());
    ledger.commitPortfolio(emptyCommit());

    assert.throws(
      () =>
        ledger.recordError({
          errorId: "error:post-commit",
          runId: "run:one",
          idempotencyKey: "error:post-commit",
          fingerprint: HASH_A,
          node: "readback",
          category: "permanent_internal",
          attempt: 1,
          retryable: false,
          message: "Synthetic post-commit fault",
          evidenceRefs: [],
          createdAt: "2026-08-08T16:06:00-04:00",
        }),
      /errors is sealed after transaction commit/u,
    );

    assert.equal(
      ledger.appendEvent({
        eventId: "event:post-commit-fault",
        runId: "run:one",
        idempotencyKey: "event:post-commit-fault",
        type: "workflow.post_commit_error",
        node: "readback",
        attempt: 1,
        createdAt: "2026-08-08T16:06:00-04:00",
        payload: { fingerprint: HASH_A },
      }),
      "created",
    );
    assert.equal(ledger.readRun("run:one")?.errors.length, 0);
    assert.equal(ledger.countEvents("run:one", "workflow.post_commit_error"), 1);

    const secondConnection = new DatabaseSync(ledgerPath);
    try {
      for (const table of [
        "evidence",
        "metric_snapshots",
        "contacts",
        "experiments",
        "evals",
        "reviews",
        "errors",
        "outbox",
      ]) {
        assert.throws(
          () =>
            secondConnection
              .prepare(`INSERT INTO ${table} (run_id) VALUES (?)`)
              .run("run:one"),
          new RegExp(`${table} is sealed after transaction commit`, "u"),
        );
      }
    } finally {
      secondConnection.close();
    }
  } finally {
    ledger.close();
  }
});

test("readback recomputes canonical row hashes from stored payloads", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-ledger-content-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledgerPath = join(root, "ledger.sqlite");
  const ledger = new GrowthLedger(ledgerPath);
  try {
    ledger.beginRun(runInput());
    ledger.recordError({
      errorId: "error:pre-commit",
      runId: "run:one",
      idempotencyKey: "error:pre-commit",
      fingerprint: HASH_A,
      node: "strategy",
      category: "transient_provider",
      attempt: 1,
      retryable: true,
      message: "Synthetic pre-commit fault",
      evidenceRefs: [],
      createdAt: "2026-08-08T16:02:00-04:00",
    });
    const readback = ledger.commitPortfolio(emptyCommit());

    const secondConnection = new DatabaseSync(ledgerPath);
    try {
      secondConnection.exec("DROP TRIGGER errors_reject_update");
      secondConnection
        .prepare("UPDATE errors SET message = ? WHERE run_id = ?")
        .run("Synthetic payload corruption", "run:one");
    } finally {
      secondConnection.close();
    }

    assert.throws(
      () => ledger.assertReadback("run:one", readback),
      /Stored errors row hash does not match its canonical payload/u,
    );
  } finally {
    ledger.close();
  }
});

test("review package stores exact draft content and verifies its canonical hash on readback", () => {
  const ledger = new GrowthLedger(":memory:");
  try {
    ledger.beginRun(runInput({ runId: "run:review", idempotencyKey: "trigger:review" }));
    const draftContent = "Proposed title: Louisville kids can build with AI";
    const draftHash = createHash("sha256").update(draftContent).digest("hex");
    const proposal = {
      proposal_id: "proposal:seo:one",
      lane: "search_console" as const,
      hypothesis: "A clearer parent-intent title can improve qualified clicks.",
      controlled_variable: "title_meta_alignment",
      arm: "change-spec-only",
      primary_kpi: "nonbrand_parent_intent_gsc_clicks_28d",
      measurement_window_days: 28,
      evidence_refs: ["evidence:gsc:property"],
      readiness: "not_approval_ready" as const,
      external_action_status: "not_executed" as const,
    };
    const approvalPackage = ApprovalPackageSchema.parse({
      schema_version: APPROVAL_PACKAGE_SCHEMA_VERSION,
      evidence_mode: "synthetic",
      review_kind: "proposal_review",
      proposal,
      draft_content: {
        kind: "seo_change_spec",
        content: draftContent,
        content_sha256: draftHash,
        redaction_status: "synthetic",
      },
      maturity_rule: {
        minimum_age_hours: 0,
        minimum_comparable_executions_per_arm: 1,
        measurement_window_days: 28,
      },
      comparison_rule: {
        primary_kpi: proposal.primary_kpi,
        baseline_reference: "synthetic-baseline:gsc",
        evidence_refs: proposal.evidence_refs,
      },
      stop_rules: ["Stop if qualified clicks or lead quality decline."],
      scale_rules: ["Prepare an exact diff only after Jon accepts this change spec."],
      required_approvals: ["proposal_review"],
      external_action_status: "not_executed",
    });
    const review = HumanReviewSchema.parse({
      review_id: "review:seo:one",
      proposal_id: proposal.proposal_id,
      lane: proposal.lane,
      review_kind: "proposal_review",
      status: "awaiting_review",
      approval_hash: approvalPackageHash(approvalPackage),
      approval_package: approvalPackage,
      requested_at: startedAt,
    });
    const commit = emptyCommit("run:review");
    commit.terminalStatus = "awaiting_review";
    commit.reviews = [
      {
        reviewId: review.review_id,
        idempotencyKey: `review:${review.review_id}`,
        proposalId: review.proposal_id,
        lane: review.lane,
        reviewKind: review.review_kind,
        status: review.status,
        approvalHash: review.approval_hash,
        approvalPackage: review.approval_package,
        requestedAt: review.requested_at,
      },
    ];
    ledger.commitPortfolio(commit);
    const stored = ledger.readRun("run:review")?.reviews[0];
    assert.equal(stored?.approvalPackage.draft_content.content, draftContent);
    assert.equal(stored?.approvalHash, approvalPackageHash(approvalPackage));

    const tampered = structuredClone(approvalPackage);
    tampered.draft_content.content = "Different unreviewed change";
    assert.equal(ApprovalPackageSchema.safeParse(tampered).success, false);
  } finally {
    ledger.close();
  }
});

test("ledger schema versions fail closed and tables reject mutation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-ledger-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const futurePath = join(root, "future.sqlite");
  const future = new DatabaseSync(futurePath);
  future.exec("PRAGMA user_version = 99");
  future.close();
  assert.throws(() => new GrowthLedger(futurePath), /newer than supported/u);

  const legacyPath = join(root, "legacy.sqlite");
  const legacy = new DatabaseSync(legacyPath);
  legacy.exec("PRAGMA user_version = 1");
  legacy.close();
  assert.throws(() => new GrowthLedger(legacyPath), /Unsupported ledger schema version: 1/u);

  const ledgerPath = join(root, "ledger.sqlite");
  const ledger = new GrowthLedger(ledgerPath);
  ledger.beginRun(runInput());
  const secondConnection = new DatabaseSync(ledgerPath);
  try {
    assert.throws(
      () => secondConnection.prepare("UPDATE runs SET workflow_name = 'changed'").run(),
      /append-only/u,
    );
  } finally {
    secondConnection.close();
    ledger.close();
  }
});
