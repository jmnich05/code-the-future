import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

import {
  type AgentStrategyProposal,
  type GrowthStrategist,
  type GrowthStrategyEvaluator,
  type LaneStrategyInput,
} from "../src/assessor.js";
import { intakeCaptureBundle } from "../src/artifacts.js";
import {
  analyzeGrowthPortfolio,
  fingerprintNormalizedContactIdentity,
  normalizeContactIdentity,
} from "../src/domain.js";
import { GrowthLedger } from "../src/ledger.js";
import {
  APPROVAL_PACKAGE_SCHEMA_VERSION,
  ApprovalPackageSchema,
  HumanReviewSchema,
  LEGACY_APPROVAL_PACKAGE_SCHEMA_VERSION,
  StrategyProposalSchema,
  approvalPackageHash,
  type LaneAnalysis,
} from "../src/schema.js";
import {
  createActionDraft,
  createGrowthWorkflow,
  createInitialGrowthRun,
  projectPersistedReviewForRuntime,
  resolveDraftForHumanReview,
  type GrowthWorkflowOptions,
  type GrowthWorkflowState,
} from "../src/workflow.js";

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const capturePath = join(fixtureRoot, "capture-bundle.json");
const startedAt = "2026-08-09T19:00:00.000Z";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function passingProposal(input: LaneStrategyInput): AgentStrategyProposal {
  const evidenceId = input.evidence[0]?.id;
  const controlledVariable = input.allowedControlledVariables[0];
  if (!evidenceId || !controlledVariable) {
    throw new Error("Synthetic lane input is missing evidence or an allowed variable");
  }
  const requiredApprovals: AgentStrategyProposal["requiredApprovals"] =
    input.lane === "organic_social"
      ? [
          input.opportunitySummary.includes("facebook")
            ? "publish_facebook"
            : "publish_instagram",
          "schedule_social",
          "use_media_or_likeness",
        ]
      : input.lane === "contact_discovery"
        ? ["send_outreach"]
        : ["merge_website_change", "deploy_website_change"];
  return {
    lane: input.lane,
    decision: input.recommendedDecision,
    hypothesis: `Changing only ${controlledVariable} will improve ${input.primaryKpi}.`,
    controlledVariable,
    currentArm: null,
    proposedArm: `synthetic-${input.lane}-${controlledVariable}`,
    draftContent:
      input.lane === "organic_social"
        ? "A practical AI build starts with one clear question. Follow Code the Future for the next student-safe build."
        : input.lane === "contact_discovery"
          ? "Hello public programs team — may we share a short overview of Code the Future's Louisville learning program for your review?"
          : "SEO change specification: revise the public home-page title and description around Louisville kids coding camp intent; preserve every protected no-index path.",
    callToAction:
      input.lane === "organic_social"
        ? "Follow Code the Future"
        : input.lane === "contact_discovery"
          ? "Reply only if this is relevant to your public programs"
          : "Review the proposed home-page change specification",
    audience:
      input.lane === "contact_discovery"
        ? "Public Louisville youth-program organizations"
        : "Louisville parents researching safe coding education",
    primaryKpi: input.primaryKpi,
    rationale: [
      {
        claim: "The bounded proposal follows the deterministic lane opportunity.",
        evidenceId,
      },
    ],
    risks: [
      {
        claim: "A human must inspect the exact draft before any external action.",
        evidenceId,
      },
    ],
    maturityRule: "Use only the supplied mature evidence window.",
    comparisonRule: "Compare the primary KPI against the recorded baseline.",
    stopRule: "Stop on privacy, consent, negative-feedback, or measurement defects.",
    scaleRule: "Scale only after the deterministic maturity and comparison rules pass.",
    requiredApprovals,
    disclosures: ["Shadow proposal only; no external action has occurred."],
  };
}

const passingStrategist: GrowthStrategist = async ({ input }) =>
  passingProposal(input);
const passingEvaluator: GrowthStrategyEvaluator = async () => ({
  status: "pass",
  defects: [],
});

async function captureSha256(): Promise<string> {
  return sha256(await readFile(capturePath));
}

async function initialRun(
  runId: string,
  idempotencyKey = `test:${runId}`,
): Promise<GrowthWorkflowState> {
  return createInitialGrowthRun({
    runId,
    idempotencyKey,
    capturePath,
    expectedCaptureSha256: await captureSha256(),
    triggerKind: "test",
    startedAt,
    objectiveWindow: { start: "2026-08-08", end: "2026-10-07" },
    metricDefinitionVersion: "ctf-growth-metrics-v1.1",
    modelId: "injected-synthetic-model",
  });
}

test("initial run requires a strict instant inside the inclusive objective window", () => {
  const base = {
    runId: "run:initial-boundary",
    idempotencyKey: "test:initial-boundary",
    capturePath,
    expectedCaptureSha256: "a".repeat(64),
    triggerKind: "test" as const,
    objectiveWindow: { start: "2026-08-08", end: "2026-08-09" },
    metricDefinitionVersion: "ctf-growth-metrics-v1.1",
  };
  for (const invalid of [
    "2026-08-08",
    "2026-08-08T12:00:00",
    "August 8, 2026 noon",
  ]) {
    assert.throws(() => createInitialGrowthRun({ ...base, startedAt: invalid }));
  }
  for (const inside of [
    "2026-08-08T00:00:00-04:00",
    "2026-08-09T23:59:59-04:00",
  ]) {
    assert.equal(
      createInitialGrowthRun({ ...base, startedAt: inside }).startedAt,
      inside,
    );
  }
  for (const outside of [
    "2026-08-07T23:59:59-04:00",
    "2026-08-10T00:00:00-04:00",
  ]) {
    assert.throws(
      () => createInitialGrowthRun({ ...base, startedAt: outside }),
      /outside the objective window/u,
    );
  }
});

test("current Search Console action authority expires at the exact deploy instant", () => {
  const draftContent =
    "SEO change specification: update one public page title and description.";
  const deployAt = "2026-08-20T14:00:00-04:00";
  const proposal = StrategyProposalSchema.parse({
    proposal_id: "proposal:seo:expiry-boundary",
    lane: "search_console",
    hypothesis: "A parent-intent title can improve qualified clicks.",
    controlled_variable: "title_meta_alignment",
    arm: "one-public-page-change",
    primary_kpi: "nonbrand_parent_intent_gsc_clicks_28d",
    measurement_window_days: 28,
    evidence_refs: ["evidence:gsc:property"],
    readiness: "approval_ready",
    approval_scope: {
      lane: "search_console",
      action: "merge_and_deploy",
      property_id: "sc-domain:codethefuture.net",
      page_url: "https://codethefuture.net/",
      query_cluster: "louisville kids coding camp",
      change_hash: sha256(draftContent),
      deploy_target: "production-main",
      deploy_at: deployAt,
    },
    external_action_status: "not_executed",
  });
  const packageInput = {
    schema_version: APPROVAL_PACKAGE_SCHEMA_VERSION,
    evidence_mode: "synthetic" as const,
    review_kind: "external_action_approval" as const,
    proposal,
    draft_content: {
      kind: "seo_change_spec" as const,
      content: draftContent,
      content_sha256: sha256(draftContent),
      redaction_status: "synthetic" as const,
    },
    maturity_rule: {
      minimum_age_hours: 0,
      minimum_comparable_executions_per_arm: 1,
      measurement_window_days: 28,
    },
    comparison_rule: {
      primary_kpi: proposal.primary_kpi,
      baseline_reference: "baseline:seo:expiry-boundary",
      evidence_refs: proposal.evidence_refs,
    },
    stop_rules: ["Stop if the exact change or production target differs."],
    scale_rules: ["Repeat only after mature Search Console evidence."],
    required_approvals: ["merge_deploy" as const],
    external_action_status: "not_executed" as const,
  };

  assert.equal(ApprovalPackageSchema.safeParse(packageInput).success, false);
  assert.equal(
    ApprovalPackageSchema.safeParse({
      ...packageInput,
      approval_expires_at: "2026-08-20T14:00:01-04:00",
    }).success,
    false,
  );
  const approvalPackage = ApprovalPackageSchema.parse({
    ...packageInput,
    approval_expires_at: deployAt,
  });
  const review = HumanReviewSchema.parse({
    review_id: "review:seo:expiry-boundary",
    proposal_id: proposal.proposal_id,
    lane: proposal.lane,
    review_kind: "external_action_approval",
    status: "awaiting_review",
    approval_hash: approvalPackageHash(approvalPackage),
    approval_package: approvalPackage,
    requested_at: "2026-08-20T13:00:00-04:00",
  });

  assert.equal(
    resolveDraftForHumanReview(
      proposal,
      "2026-08-20T13:59:59-04:00",
      { start: "2026-08-08", end: "2026-10-07" },
    ).draft.readiness,
    "approval_ready",
  );
  assert.equal(
    resolveDraftForHumanReview(proposal, deployAt, {
      start: "2026-08-08",
      end: "2026-10-07",
    }).draft.readiness,
    "not_approval_ready",
  );
  assert.equal(
    projectPersistedReviewForRuntime(review, deployAt, {
      start: "2026-08-08",
      end: "2026-10-07",
    }).review_kind,
    "proposal_review",
  );
});

function workflowOptions(
  directory: string,
  ledger: GrowthLedger,
  checkpointer: SqliteSaver,
  strategist: GrowthStrategist = passingStrategist,
  evaluator: GrowthStrategyEvaluator = passingEvaluator,
  failureInjection?: GrowthWorkflowOptions["failureInjection"],
): GrowthWorkflowOptions {
  return {
    ledger,
    checkpointer,
    strategist,
    evaluator,
    paths: {
      stateRoot: join(directory, ".state"),
      projectStatePath: join(directory, "PROJECT_STATE.md"),
      observerDirectory: join(directory, ".state", "observer"),
    },
    evidenceRoot: fixtureRoot,
    allowSyntheticEvidence: true,
    now: () => new Date(startedAt),
    retryDelayMs: 0,
    ...(failureInjection ? { failureInjection } : {}),
  };
}

async function invokeFresh(input: {
  directory: string;
  runId: string;
  idempotencyKey?: string;
  strategist?: GrowthStrategist;
  evaluator?: GrowthStrategyEvaluator;
  failureInjection?: GrowthWorkflowOptions["failureInjection"];
}): Promise<{
  final: GrowthWorkflowState;
  ledger: GrowthLedger;
  checkpointer: SqliteSaver;
}> {
  const ledger = new GrowthLedger(join(input.directory, ".state", "ledger.sqlite"));
  const checkpointer = SqliteSaver.fromConnString(
    join(input.directory, ".state", "checkpoints.sqlite"),
  );
  const initial = await initialRun(input.runId, input.idempotencyKey);
  const graph = createGrowthWorkflow(
    workflowOptions(
      input.directory,
      ledger,
      checkpointer,
      input.strategist,
      input.evaluator,
      input.failureInjection,
    ),
  );
  const final = (await graph.invoke(initial, {
    configurable: { thread_id: initial.canonical.thread_id },
    recursionLimit: 100,
  })) as GrowthWorkflowState;
  return { final, ledger, checkpointer };
}

test("shadow portfolio commits three exact review packages without external action", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-success-"));
  let ledger: GrowthLedger | undefined;
  let checkpointer: SqliteSaver | undefined;
  try {
    const result = await invokeFresh({ directory, runId: "run-success" });
    ({ ledger, checkpointer } = result);
    const { final } = result;
    assert.equal(final.status, "awaiting_review");
    assert.equal(final.persistence.verified, true);
    assert.equal(final.canonical.reviews.length, 3);
    assert.ok(
      final.canonical.reviews.every(
        (review) => review.approval_package.evidence_mode === "synthetic",
      ),
    );
    assert.ok(
      final.canonical.reviews.every(
        (review) => review.status === "awaiting_review",
      ),
    );
    const byLane = new Map(final.canonical.reviews.map((review) => [review.lane, review]));
    assert.equal(byLane.get("organic_social")?.review_kind, "external_action_approval");
    assert.equal(byLane.get("contact_discovery")?.review_kind, "proposal_review");
    assert.equal(byLane.get("search_console")?.review_kind, "proposal_review");
    assert.equal(
      byLane.get("contact_discovery")?.approval_package.proposal.readiness,
      "not_approval_ready",
    );
    assert.equal(
      byLane.get("contact_discovery")?.approval_package.proposal.approval_scope,
      undefined,
    );
    assert.equal(
      byLane.get("search_console")?.approval_package.proposal.readiness,
      "not_approval_ready",
    );
    const socialScope = byLane.get("organic_social")?.approval_package.proposal
      .approval_scope;
    assert.equal(socialScope?.lane, "organic_social");
    if (socialScope?.lane !== "organic_social") throw new Error("social scope missing");
    assert.deepEqual(socialScope.asset_ids, ["asset:fb-safe"]);
    assert.deepEqual(socialScope.asset_artifacts, [
      {
        asset_id: "asset:fb-safe",
        evidence_id: "evidence:social:facebook",
        evidence_sha256:
          "61ad7daffabda6ffde0730693eb27e6bcd724cba7298a8366233c12c009fd913",
        content_sha256:
          "df1c4a1183b2be6ec97ffc62aed476767b797aa9bf937f845cc2f365e12d1a3f",
        byte_length: 31,
        subject_classification: "no_person",
        media_kinds: ["image"],
        authorization: {
          authorization_basis: "none_needed",
          subject_basis: "none_needed",
        },
      },
    ]);
    assert.ok(
      final.canonical.reviews.every(
        (review) =>
          review.approval_hash === approvalPackageHash(review.approval_package),
      ),
    );
    const snapshot = ledger.readRun(final.canonical.run_id);
    assert.equal(snapshot?.outbox.length, 3);
    assert.equal(snapshot?.reviews.length, 3);
    assert.equal(snapshot?.transaction?.counts.outbox, 3);
    assert.equal(snapshot?.transaction?.counts.reviews, 3);
    assert.ok(
      snapshot?.outbox.every((entry) =>
        JSON.stringify(entry.payload).includes("approval_package"),
      ),
    );
    assert.ok(
      snapshot?.experiments.every(
        (entry) => entry.externalActionStatus === "not_executed",
      ),
    );
    const projectState = await readFile(join(directory, "PROJECT_STATE.md"), "utf8");
    assert.match(projectState, /SYNTHETIC TEST EVIDENCE/);
    assert.match(projectState, /facebook organic_net_new_followers_60d/);
    assert.match(projectState, /instagram organic_net_new_followers_60d/);
  } finally {
    checkpointer?.db.close();
    ledger?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("transient model failures retry inside a three-start graph budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-retry-"));
  let calls = 0;
  const strategist: GrowthStrategist = async ({ input }) => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("synthetic rate limit"), { status: 429 });
    return passingProposal(input);
  };
  let ledger: GrowthLedger | undefined;
  let checkpointer: SqliteSaver | undefined;
  try {
    const result = await invokeFresh({
      directory,
      runId: "run-transient-retry",
      strategist,
    });
    ({ ledger, checkpointer } = result);
    assert.equal(result.final.status, "awaiting_review");
    assert.equal(calls, 5);
    const snapshot = ledger.readRun("run-transient-retry");
    assert.equal(
      snapshot?.events.filter((event) => event.type === "model.call.started").length,
      8,
    );
    assert.equal(
      snapshot?.errors.filter((error) => error.node === "llm_strategy").length,
      2,
    );
  } finally {
    checkpointer?.db.close();
    ledger?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a permanently failing model call is not retried", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-permanent-"));
  const ledger = new GrowthLedger(join(directory, ".state", "ledger.sqlite"));
  const checkpointer = SqliteSaver.fromConnString(
    join(directory, ".state", "checkpoints.sqlite"),
  );
  let calls = 0;
  const strategist: GrowthStrategist = async () => {
    calls += 1;
    throw Object.assign(new Error("synthetic invalid model request"), { status: 400 });
  };
  const initial = await initialRun("run-permanent-model");
  const graph = createGrowthWorkflow(
    workflowOptions(directory, ledger, checkpointer, strategist),
  );
  try {
    await assert.rejects(
      graph.invoke(initial, {
        configurable: { thread_id: initial.canonical.thread_id },
        recursionLimit: 100,
      }),
      /synthetic invalid model request/,
    );
    assert.equal(calls, 1);
    assert.equal(
      ledger
        .readRun(initial.canonical.run_id)
        ?.events.filter((event) => event.type === "model.call.started").length,
      1,
    );
  } finally {
    checkpointer.db.close();
    ledger.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("three transient failures exhaust the logical call budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-budget-"));
  const ledger = new GrowthLedger(join(directory, ".state", "ledger.sqlite"));
  const checkpointer = SqliteSaver.fromConnString(
    join(directory, ".state", "checkpoints.sqlite"),
  );
  let calls = 0;
  const strategist: GrowthStrategist = async () => {
    calls += 1;
    throw Object.assign(new Error("synthetic unavailable provider"), { status: 503 });
  };
  const initial = await initialRun("run-provider-budget");
  const graph = createGrowthWorkflow(
    workflowOptions(directory, ledger, checkpointer, strategist),
  );
  try {
    await assert.rejects(
      graph.invoke(initial, {
        configurable: { thread_id: initial.canonical.thread_id },
        recursionLimit: 100,
      }),
      /synthetic unavailable provider/,
    );
    assert.equal(calls, 3);
    assert.equal(
      ledger
        .readRun(initial.canonical.run_id)
        ?.events.filter((event) => event.type === "model.call.started").length,
      3,
    );
  } finally {
    checkpointer.db.close();
    ledger.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("checkpoint replay reuses the durable model output after a node crash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-cache-"));
  const ledgerPath = join(directory, ".state", "ledger.sqlite");
  const checkpointPath = join(directory, ".state", "checkpoints.sqlite");
  const initial = await initialRun("run-cache-replay");
  const config = {
    configurable: { thread_id: initial.canonical.thread_id },
    recursionLimit: 100,
  };
  let calls = 0;
  let injected = false;
  const strategist: GrowthStrategist = async ({ input }) => {
    calls += 1;
    return passingProposal(input);
  };
  let ledger = new GrowthLedger(ledgerPath);
  let checkpointer = SqliteSaver.fromConnString(checkpointPath);
  try {
    const graph = createGrowthWorkflow(
      workflowOptions(directory, ledger, checkpointer, strategist, passingEvaluator, (node, phase) => {
        if (!injected && node === "llm_strategy" && phase === "after") {
          injected = true;
          throw new Error("synthetic crash after strategy cache");
        }
      }),
    );
    await assert.rejects(graph.invoke(initial, config), /synthetic crash/);
    assert.equal(calls, 1);
    assert.equal(ledger.readRun(initial.canonical.run_id)?.modelCache.length, 1);

    checkpointer.db.close();
    ledger.close();
    ledger = new GrowthLedger(ledgerPath);
    checkpointer = SqliteSaver.fromConnString(checkpointPath);
    const resumed = createGrowthWorkflow(
      workflowOptions(directory, ledger, checkpointer, strategist),
    );
    const final = (await resumed.invoke(null, config)) as GrowthWorkflowState;
    assert.equal(final.status, "awaiting_review");
    assert.equal(calls, 3);
    assert.equal(
      ledger
        .readRun(initial.canonical.run_id)
        ?.events.filter((event) => event.type === "model.call.started").length,
      6,
    );
  } finally {
    checkpointer.db.close();
    ledger.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a crash after the run ledger write resumes the same uncommitted run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-trigger-replay-"));
  const ledgerPath = join(directory, ".state", "ledger.sqlite");
  const checkpointPath = join(directory, ".state", "checkpoints.sqlite");
  const initial = await initialRun("run-trigger-replay");
  const config = {
    configurable: { thread_id: initial.canonical.thread_id },
    recursionLimit: 100,
  };
  let injected = false;
  let ledger = new GrowthLedger(ledgerPath);
  let checkpointer = SqliteSaver.fromConnString(checkpointPath);
  try {
    const graph = createGrowthWorkflow(
      workflowOptions(
        directory,
        ledger,
        checkpointer,
        passingStrategist,
        passingEvaluator,
        (node, phase) => {
          if (!injected && node === "trigger" && phase === "after") {
            injected = true;
            throw new Error("synthetic crash after durable run trigger");
          }
        },
      ),
    );
    await assert.rejects(graph.invoke(initial, config), /synthetic crash/);
    assert.ok(ledger.readRun(initial.canonical.run_id));
    assert.equal(ledger.readRun(initial.canonical.run_id)?.transaction, null);

    checkpointer.db.close();
    ledger.close();
    ledger = new GrowthLedger(ledgerPath);
    checkpointer = SqliteSaver.fromConnString(checkpointPath);
    const resumed = createGrowthWorkflow(
      workflowOptions(directory, ledger, checkpointer),
    );
    const final = (await resumed.invoke(null, config)) as GrowthWorkflowState;
    assert.equal(final.status, "awaiting_review");
    assert.equal(final.duplicateNoop, false);
    assert.equal(final.canonical.run_id, initial.canonical.run_id);
    assert.equal(final.persistence.verified, true);
    assert.ok(ledger.readRun(initial.canonical.run_id)?.transaction);
    assert.equal(
      ledger
        .readRun(initial.canonical.run_id)
        ?.events.filter(
          (entry) => entry.type === "run.resumed_before_checkpoint",
        ).length,
      1,
    );
  } finally {
    checkpointer.db.close();
    ledger.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a second trigger cannot finalize while the original run is uncommitted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-trigger-owned-"));
  const ledgerPath = join(directory, ".state", "ledger.sqlite");
  const originalCheckpointPath = join(
    directory,
    ".state",
    "original-checkpoints.sqlite",
  );
  const duplicateCheckpointPath = join(
    directory,
    ".state",
    "duplicate-checkpoints.sqlite",
  );
  const idempotencyKey = "test:trigger-owned";
  const original = await initialRun("run-trigger-owner", idempotencyKey);
  let injected = false;
  const ledger = new GrowthLedger(ledgerPath);
  const originalSaver = SqliteSaver.fromConnString(originalCheckpointPath);
  try {
    const originalGraph = createGrowthWorkflow(
      workflowOptions(
        directory,
        ledger,
        originalSaver,
        passingStrategist,
        passingEvaluator,
        (node, phase) => {
          if (!injected && node === "trigger" && phase === "after") {
            injected = true;
            throw new Error("synthetic owner pause after trigger");
          }
        },
      ),
    );
    await assert.rejects(
      originalGraph.invoke(original, {
        configurable: { thread_id: original.canonical.thread_id },
        recursionLimit: 100,
      }),
      /synthetic owner pause/,
    );
    assert.equal(ledger.readRun(original.canonical.run_id)?.transaction, null);

    const duplicateSaver = SqliteSaver.fromConnString(duplicateCheckpointPath);
    try {
      const duplicate = await initialRun("run-trigger-contender", idempotencyKey);
      const duplicateGraph = createGrowthWorkflow(
        workflowOptions(directory, ledger, duplicateSaver),
      );
      const result = (await duplicateGraph.invoke(duplicate, {
        configurable: { thread_id: duplicate.canonical.thread_id },
        recursionLimit: 100,
      })) as GrowthWorkflowState;
      assert.equal(result.status, "blocked");
      assert.equal(result.duplicateNoop, true);
      assert.equal(result.duplicateInProgress, true);
      assert.equal(result.canonical.run_id, original.canonical.run_id);
      assert.equal(result.persistence.verified, false);
      assert.equal(result.persistence.transactionId, null);
      await assert.rejects(readFile(join(directory, "PROJECT_STATE.md")), {
        code: "ENOENT",
      });
    } finally {
      duplicateSaver.db.close();
    }
  } finally {
    originalSaver.db.close();
    ledger.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("post-commit replay is byte-identical and duplicate trigger resolves to the original run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-commit-replay-"));
  const ledgerPath = join(directory, ".state", "ledger.sqlite");
  const checkpointPath = join(directory, ".state", "checkpoints.sqlite");
  const idempotencyKey = "test:commit-replay:stable";
  const initial = await initialRun("run-commit-replay", idempotencyKey);
  const config = {
    configurable: { thread_id: initial.canonical.thread_id },
    recursionLimit: 100,
  };
  let injected = false;
  let ledger = new GrowthLedger(ledgerPath);
  let checkpointer = SqliteSaver.fromConnString(checkpointPath);
  try {
    const graph = createGrowthWorkflow(
      workflowOptions(directory, ledger, checkpointer, passingStrategist, passingEvaluator, (node, phase) => {
        if (!injected && node === "commit" && phase === "after") {
          injected = true;
          throw new Error("synthetic crash after portfolio commit");
        }
      }),
    );
    await assert.rejects(graph.invoke(initial, config), /synthetic crash/);
    const before = ledger.readRun(initial.canonical.run_id)?.transaction;
    assert.ok(before);

    checkpointer.db.close();
    ledger.close();
    ledger = new GrowthLedger(ledgerPath);
    checkpointer = SqliteSaver.fromConnString(checkpointPath);
    const resumed = createGrowthWorkflow(
      workflowOptions(directory, ledger, checkpointer),
    );
    const final = (await resumed.invoke(null, config)) as GrowthWorkflowState;
    const after = ledger.readRun(initial.canonical.run_id)?.transaction;
    assert.equal(final.persistence.verified, true);
    assert.deepEqual(after, before);
    assert.equal(after?.counts.outbox, 3);
    const projectionBeforeDuplicate = await readFile(
      join(directory, "PROJECT_STATE.md"),
      "utf8",
    );

    const duplicateSaver = SqliteSaver.fromConnString(
      join(directory, ".state", "duplicate-checkpoints.sqlite"),
    );
    try {
      const duplicateGraph = createGrowthWorkflow(
        workflowOptions(directory, ledger, duplicateSaver),
      );
      const duplicate = await initialRun("run-duplicate-request", idempotencyKey);
      const duplicateResult = (await duplicateGraph.invoke(duplicate, {
        configurable: { thread_id: duplicate.canonical.thread_id },
        recursionLimit: 100,
      })) as GrowthWorkflowState;
      assert.equal(duplicateResult.status, "duplicate_noop");
      assert.equal(duplicateResult.canonical.run_id, initial.canonical.run_id);
      assert.equal(duplicateResult.persistence.transactionId, before?.transactionId);
      assert.equal(ledger.readRun("run-duplicate-request"), null);
      assert.equal(ledger.readRun(initial.canonical.run_id)?.outbox.length, 3);
      assert.equal(
        await readFile(join(directory, "PROJECT_STATE.md"), "utf8"),
        projectionBeforeDuplicate,
      );
    } finally {
      duplicateSaver.db.close();
    }
  } finally {
    checkpointer.db.close();
    ledger.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a repeated evaluator defect is bounded and quarantines only that lane", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-repair-"));
  let socialEvaluations = 0;
  const evaluator: GrowthStrategyEvaluator = async (input) => {
    if (input.lane !== "organic_social") return { status: "pass", defects: [] };
    socialEvaluations += 1;
    return {
      status: "repair",
      defects: [
        {
          code: "unclear_output",
          message: "Synthetic exact same evaluator defect",
          target: "arm",
        },
      ],
    };
  };
  let ledger: GrowthLedger | undefined;
  let checkpointer: SqliteSaver | undefined;
  try {
    const result = await invokeFresh({
      directory,
      runId: "run-repeated-defect",
      evaluator,
    });
    ({ ledger, checkpointer } = result);
    assert.equal(socialEvaluations, 2);
    assert.equal(result.final.laneWork.organic_social?.status, "quarantined");
    assert.equal(result.final.laneWork.organic_social?.repairCount, 1);
    assert.equal(result.final.canonical.repair_count, 1);
    assert.equal(result.final.canonical.reviews.length, 2);
    assert.equal(result.final.status, "partial");
    const snapshot = ledger.readRun(result.final.canonical.run_id);
    assert.equal(snapshot?.transaction?.terminalStatus, "partial");
    assert.equal(snapshot?.outbox.length, 2);
    assert.ok(
      snapshot?.outbox.every((entry) => entry.lane !== "organic_social"),
    );
    const projected = await readFile(join(directory, "PROJECT_STATE.md"), "utf8");
    assert.match(projected, /quarantined:not_reviewable/);
  } finally {
    checkpointer?.db.close();
    ledger?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("social asset byte-attestation mismatches fail closed before approval", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-asset-hash-"));
  try {
    const intake = await intakeCaptureBundle({
      captureBundlePath: capturePath,
      allowedEvidenceRoot: fixtureRoot,
      runArtifactRoot: join(directory, "artifacts"),
      runAt: startedAt,
      allowSyntheticEvidence: true,
    });
    const analysis = analyzeGrowthPortfolio({
      bundle: intake.bundle,
      evidence: intake.evidence.map((entry) => entry.artifact),
      runAt: startedAt,
    });
    const socialAnalysis = analysis.lanes.find(
      (lane) => lane.lane === "organic_social",
    );
    if (!socialAnalysis) throw new Error("social analysis missing");
    const strategyInput: LaneStrategyInput = {
      analysisId: "analysis-social-asset-hash",
      lane: "organic_social",
      eligibility: "eligible",
      primaryKpi: "organic_net_new_followers_60d_platform_separated",
      recommendedDecision: "repeat",
      allowedControlledVariables: ["hook", "format"],
      baselineSummary: "Synthetic complete Facebook and Instagram baselines.",
      opportunitySummary: socialAnalysis.opportunities[0]?.summary ?? "missing",
      sourceCoverageSummary: "complete",
      maturitySummary: "mature",
      guardrails: [],
      evidence: socialAnalysis.evidence_refs.map((id) => ({
        id,
        kind: "synthetic_fixture",
        source: "synthetic_fixture",
        observedAt: startedAt,
        summary: "Synthetic evidence.",
      })),
    };
    const strategy = passingProposal(strategyInput);
    const original = createActionDraft(
      "run-asset-original",
      strategyInput,
      strategy,
      socialAnalysis,
      intake,
      startedAt,
    );
    const changedIntake = structuredClone(intake);
    const facebook = changedIntake.evidence.find(
      (entry) =>
        entry.artifact.lane === "organic_social" &&
        entry.artifact.platform === "facebook",
    );
    if (!facebook || facebook.artifact.lane !== "organic_social") {
      throw new Error("Facebook fixture missing");
    }
    facebook.artifact.payload.assets[0]!.content_sha256 =
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const changed = createActionDraft(
      "run-asset-original",
      strategyInput,
      strategy,
      socialAnalysis,
      changedIntake,
      startedAt,
    );
    assert.equal(original.approval_scope?.lane, "organic_social");
    assert.equal(changed.readiness, "not_approval_ready");
    assert.equal(changed.approval_scope, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("zero-asset social approvals fail closed except explicit Facebook text", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-zero-asset-"));
  try {
    const intake = await intakeCaptureBundle({
      captureBundlePath: capturePath,
      allowedEvidenceRoot: fixtureRoot,
      runArtifactRoot: join(directory, "artifacts"),
      runAt: startedAt,
      allowSyntheticEvidence: true,
    });
    const analysis = analyzeGrowthPortfolio({
      bundle: intake.bundle,
      evidence: intake.evidence.map((entry) => entry.artifact),
      runAt: startedAt,
    });
    const socialAnalysis = analysis.lanes.find(
      (lane) => lane.lane === "organic_social",
    );
    if (!socialAnalysis) throw new Error("Social analysis missing");

    const draftFor = (
      platform: "instagram" | "facebook",
      format: "text" | "image",
    ) => {
      const changedIntake = structuredClone(intake);
      const evidence = changedIntake.evidence.find(
        (entry) =>
          entry.artifact.lane === "organic_social" &&
          entry.artifact.platform === platform,
      );
      if (!evidence || evidence.artifact.lane !== "organic_social") {
        throw new Error(`${platform} evidence missing`);
      }
      const anchorPost = evidence.artifact.payload.posts[0]!;
      anchorPost.format = format;
      anchorPost.asset_refs = [];
      const laneAnalysis = structuredClone(socialAnalysis);
      laneAnalysis.opportunities = [
        {
          candidate_id: `candidate:${platform}:zero-asset`,
          lane: "organic_social",
          kind: "social_experiment",
          summary: `Review the ${platform} ${format} zero-asset boundary.`,
          score: 80,
          controlled_variable: "format",
          evidence_refs: [evidence.artifact.evidence_id],
          platform,
          account_id: evidence.artifact.account_id,
          anchor_post_id: anchorPost.post_id,
        },
      ];
      const strategyInput: LaneStrategyInput = {
        analysisId: `analysis:${platform}:zero-asset`,
        lane: "organic_social",
        eligibility: "eligible",
        primaryKpi: "organic_net_new_followers_60d_platform_separated",
        recommendedDecision: "repeat",
        allowedControlledVariables: ["format"],
        baselineSummary: `Synthetic ${platform} baseline.`,
        opportunitySummary: laneAnalysis.opportunities[0]!.summary,
        sourceCoverageSummary: "complete",
        maturitySummary: "mature",
        guardrails: [],
        evidence: [
          {
            id: evidence.artifact.evidence_id,
            kind: "synthetic_fixture",
            source: "synthetic_fixture",
            observedAt: startedAt,
            summary: `Synthetic ${platform} evidence.`,
          },
        ],
      };
      return createActionDraft(
        `run-${platform}-${format}-zero-asset`,
        strategyInput,
        passingProposal(strategyInput),
        laneAnalysis,
        changedIntake,
        startedAt,
      );
    };

    for (const draft of [
      draftFor("facebook", "image"),
      draftFor("instagram", "image"),
      draftFor("instagram", "text"),
    ]) {
      assert.equal(draft.readiness, "not_approval_ready");
      assert.equal(draft.approval_scope, undefined);
    }

    const facebookText = draftFor("facebook", "text");
    assert.equal(facebookText.readiness, "approval_ready");
    assert.equal(facebookText.approval_scope?.lane, "organic_social");
    if (facebookText.approval_scope?.lane !== "organic_social") {
      throw new Error("Facebook text-only approval scope missing");
    }
    assert.deepEqual(facebookText.approval_scope.asset_ids, []);
    assert.deepEqual(facebookText.approval_scope.asset_artifacts, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("typed Meta identity is exact-bound into Facebook approval and review hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-meta-identity-"));
  try {
    const intake = await intakeCaptureBundle({
      captureBundlePath: join(
        fixtureRoot,
        "capture-bundle-facebook-typed-v1.1.json",
      ),
      allowedEvidenceRoot: fixtureRoot,
      runArtifactRoot: join(directory, "artifacts"),
      runAt: startedAt,
      allowSyntheticEvidence: true,
    });
    const analysis = analyzeGrowthPortfolio({
      bundle: intake.bundle,
      evidence: intake.evidence.map((entry) => entry.artifact),
      runAt: startedAt,
    });
    const socialAnalysis = analysis.lanes.find(
      (lane) => lane.lane === "organic_social",
    );
    const facebookEvidence = intake.evidence.find(
      (entry) =>
        entry.artifact.lane === "organic_social" &&
        entry.artifact.platform === "facebook",
    );
    if (
      !socialAnalysis ||
      !facebookEvidence ||
      facebookEvidence.artifact.lane !== "organic_social" ||
      !("meta_identity" in facebookEvidence.artifact) ||
      !facebookEvidence.artifact.meta_identity
    ) {
      throw new Error("Typed Facebook evidence missing");
    }
    const typedAnalysis = structuredClone(socialAnalysis);
    typedAnalysis.opportunities = [
      {
        candidate_id: "candidate:facebook:typed-meta",
        lane: "organic_social",
        kind: "social_experiment",
        summary: "Repeat the facebook format with exact typed Meta identity.",
        score: 80,
        controlled_variable: "format",
        evidence_refs: [facebookEvidence.artifact.evidence_id],
        platform: "facebook",
        account_id: facebookEvidence.artifact.account_id,
        anchor_post_id: facebookEvidence.artifact.payload.posts[0]!.post_id,
      },
    ];
    const strategyInput: LaneStrategyInput = {
      analysisId: "analysis:facebook:typed-meta",
      lane: "organic_social",
      eligibility: "eligible",
      primaryKpi: "organic_net_new_followers_60d_platform_separated",
      recommendedDecision: "repeat",
      allowedControlledVariables: ["format"],
      baselineSummary: "Synthetic typed Facebook baseline.",
      opportunitySummary: typedAnalysis.opportunities[0]!.summary,
      sourceCoverageSummary: "complete",
      maturitySummary: "mature",
      guardrails: [],
      evidence: [
        {
          id: facebookEvidence.artifact.evidence_id,
          kind: "synthetic_fixture",
          source: "synthetic_fixture",
          observedAt: startedAt,
          summary: "Synthetic typed Facebook evidence.",
        },
      ],
    };
    const strategy = passingProposal(strategyInput);
    const original = createActionDraft(
      "run-facebook-typed-meta",
      strategyInput,
      strategy,
      typedAnalysis,
      intake,
      startedAt,
    );
    if (original.approval_scope?.lane !== "organic_social") {
      throw new Error("Typed Facebook approval scope missing");
    }
    assert.deepEqual(original.approval_scope.meta_identity, {
      asset_id: "1211320332069277",
      page_id: "61592857947154",
      business_portfolio_id: "1382097470521196",
    });
    const publishingAt = original.approval_scope.publishing_at;
    const justBeforePublishing = new Date(
      Date.parse(publishingAt) - 1,
    ).toISOString();
    const beforeDeadline = resolveDraftForHumanReview(
      original,
      justBeforePublishing,
      intake.bundle.objective_window,
    );
    const atDeadline = resolveDraftForHumanReview(
      original,
      publishingAt,
      intake.bundle.objective_window,
    );
    const afterDeadline = resolveDraftForHumanReview(
      original,
      new Date(Date.parse(publishingAt) + 1).toISOString(),
      intake.bundle.objective_window,
    );
    assert.equal(beforeDeadline.draft.readiness, "approval_ready");
    assert.equal(beforeDeadline.expired, false);
    assert.equal(atDeadline.draft.readiness, "not_approval_ready");
    assert.equal(atDeadline.expired, true);
    assert.equal(afterDeadline.draft.readiness, "not_approval_ready");
    assert.equal(afterDeadline.expired, true);

    const finalDayIntake = structuredClone(intake);
    finalDayIntake.bundle.objective_window.end = "2026-08-09";
    const lateFinalDay = createActionDraft(
      "run-facebook-final-day",
      strategyInput,
      strategy,
      typedAnalysis,
      finalDayIntake,
      "2026-08-09T20:00:00-04:00",
    );
    assert.equal(lateFinalDay.readiness, "not_approval_ready");
    assert.equal(lateFinalDay.approval_scope, undefined);
    assert.throws(
      () =>
        createActionDraft(
          "run-facebook-invalid-time",
          strategyInput,
          strategy,
          typedAnalysis,
          intake,
          "2026-08-09T19:00:00",
        ),
      /Invalid ISO datetime|offset/u,
    );

    const packageFor = (proposal: typeof original) =>
      ApprovalPackageSchema.parse({
        schema_version: APPROVAL_PACKAGE_SCHEMA_VERSION,
        evidence_mode: "synthetic",
        review_kind: "external_action_approval",
        proposal,
        draft_content: {
          kind: "social_copy",
          content: strategy.draftContent,
          content_sha256: sha256(strategy.draftContent),
          redaction_status: "synthetic",
        },
        maturity_rule: {
          minimum_age_hours: 72,
          minimum_comparable_executions_per_arm: 3,
          measurement_window_days: proposal.measurement_window_days,
        },
        comparison_rule: {
          primary_kpi: proposal.primary_kpi,
          baseline_reference: "baseline:synthetic-facebook-typed-meta",
          evidence_refs: proposal.evidence_refs,
        },
        stop_rules: [strategy.stopRule],
        scale_rules: [strategy.scaleRule],
        required_approvals: ["publish"],
        approval_expires_at:
          proposal.approval_scope?.lane === "organic_social"
            ? proposal.approval_scope.publishing_at
            : undefined,
        external_action_status: "not_executed",
      });
    const originalPackageHash = approvalPackageHash(packageFor(original));

    for (const field of ["asset_id", "business_portfolio_id"] as const) {
      const changedIntake = structuredClone(intake);
      const changedEvidence = changedIntake.evidence.find(
        (entry) =>
          entry.artifact.lane === "organic_social" &&
          entry.artifact.platform === "facebook",
      );
      if (
        !changedEvidence ||
        changedEvidence.artifact.lane !== "organic_social" ||
        !("meta_identity" in changedEvidence.artifact) ||
        !changedEvidence.artifact.meta_identity
      ) {
        throw new Error("Changed typed Facebook evidence missing");
      }
      changedEvidence.artifact.meta_identity[field] =
        field === "asset_id"
          ? "1211320332069278"
          : "1382097470521197";
      const changed = createActionDraft(
        "run-facebook-typed-meta",
        strategyInput,
        strategy,
        typedAnalysis,
        changedIntake,
        startedAt,
      );
      if (changed.approval_scope?.lane !== "organic_social") {
        throw new Error(`Changed ${field} approval scope missing`);
      }
      assert.notDeepEqual(
        changed.approval_scope.meta_identity,
        original.approval_scope.meta_identity,
      );
      assert.notEqual(
        changed.approval_scope.content_hash,
        original.approval_scope.content_hash,
      );
      assert.notEqual(
        approvalPackageHash(packageFor(changed)),
        originalPackageHash,
      );
    }

    const mismatchedPageIntake = structuredClone(intake);
    const mismatchedPageEvidence = mismatchedPageIntake.evidence.find(
      (entry) =>
        entry.artifact.lane === "organic_social" &&
        entry.artifact.platform === "facebook",
    );
    if (
      !mismatchedPageEvidence ||
      mismatchedPageEvidence.artifact.lane !== "organic_social" ||
      !("meta_identity" in mismatchedPageEvidence.artifact) ||
      !mismatchedPageEvidence.artifact.meta_identity
    ) {
      throw new Error("Mismatched Page evidence missing");
    }
    mismatchedPageEvidence.artifact.meta_identity.page_id = "61592857947155";
    assert.throws(
      () =>
        createActionDraft(
          "run-facebook-typed-meta",
          strategyInput,
          strategy,
          typedAnalysis,
          mismatchedPageIntake,
          startedAt,
        ),
      /account target equal to its Page ID/u,
    );

    const incompleteIdentityIntake = structuredClone(intake);
    const incompleteEvidence = incompleteIdentityIntake.evidence.find(
      (entry) =>
        entry.artifact.lane === "organic_social" &&
        entry.artifact.platform === "facebook",
    );
    if (
      !incompleteEvidence ||
      incompleteEvidence.artifact.lane !== "organic_social" ||
      !("meta_identity" in incompleteEvidence.artifact)
    ) {
      throw new Error("Incomplete typed Facebook evidence missing");
    }
    delete incompleteEvidence.artifact.meta_identity;
    const incomplete = createActionDraft(
      "run-facebook-typed-meta",
      strategyInput,
      strategy,
      typedAnalysis,
      incompleteIdentityIntake,
      startedAt,
    );
    assert.equal(incomplete.readiness, "not_approval_ready");
    assert.equal(incomplete.approval_scope, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("social consent details bind the exact approval hash and reject unsafe scope mismatches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-consent-hash-"));
  try {
    const intake = await intakeCaptureBundle({
      captureBundlePath: capturePath,
      allowedEvidenceRoot: fixtureRoot,
      runArtifactRoot: join(directory, "artifacts"),
      runAt: startedAt,
      allowSyntheticEvidence: true,
    });
    const analysis = analyzeGrowthPortfolio({
      bundle: intake.bundle,
      evidence: intake.evidence.map((entry) => entry.artifact),
      runAt: startedAt,
    });
    const socialAnalysis = analysis.lanes.find(
      (lane) => lane.lane === "organic_social",
    );
    const instagramEvidence = intake.evidence.find(
      (entry) =>
        entry.artifact.lane === "organic_social" &&
        entry.artifact.platform === "instagram",
    );
    if (
      !socialAnalysis ||
      !instagramEvidence ||
      instagramEvidence.artifact.lane !== "organic_social"
    ) {
      throw new Error("Instagram social evidence missing");
    }
    const instagramAnalysis = structuredClone(socialAnalysis);
    instagramAnalysis.opportunities = [
      {
        candidate_id: "candidate:instagram-consent-scope",
        lane: "organic_social",
        kind: "social_experiment",
        summary: "Repeat the bounded instagram experiment with exact consent scope.",
        score: 80,
        controlled_variable: "hook",
        evidence_refs: [instagramEvidence.artifact.evidence_id],
        platform: "instagram",
        account_id: instagramEvidence.artifact.account_id,
        anchor_post_id: instagramEvidence.artifact.payload.posts[0]!.post_id,
      },
    ];
    const strategyInput: LaneStrategyInput = {
      analysisId: "analysis-social-consent-hash",
      lane: "organic_social",
      eligibility: "eligible",
      primaryKpi: "organic_net_new_followers_60d_platform_separated",
      recommendedDecision: "repeat",
      allowedControlledVariables: ["hook"],
      baselineSummary: "Synthetic complete Instagram baseline.",
      opportunitySummary: instagramAnalysis.opportunities[0]!.summary,
      sourceCoverageSummary: "complete",
      maturitySummary: "mature",
      guardrails: [],
      evidence: [
        {
          id: instagramEvidence.artifact.evidence_id,
          kind: "synthetic_fixture",
          source: "synthetic_fixture",
          observedAt: startedAt,
          summary: "Synthetic Instagram evidence.",
        },
      ],
    };
    const strategy = passingProposal(strategyInput);
    const original = createActionDraft(
      "run-consent-original",
      strategyInput,
      strategy,
      instagramAnalysis,
      intake,
      startedAt,
    );
    const changedIntake = structuredClone(intake);
    const changedInstagram = changedIntake.evidence.find(
      (entry) =>
        entry.artifact.lane === "organic_social" &&
        entry.artifact.platform === "instagram",
    );
    if (!changedInstagram || changedInstagram.artifact.lane !== "organic_social") {
      throw new Error("Changed Instagram evidence missing");
    }
    changedInstagram.artifact.payload.consents[0]!.expires_at =
      "2026-11-30T23:59:59-05:00";
    const changed = createActionDraft(
      "run-consent-original",
      strategyInput,
      strategy,
      instagramAnalysis,
      changedIntake,
      startedAt,
    );
    if (
      original.approval_scope?.lane !== "organic_social" ||
      changed.approval_scope?.lane !== "organic_social"
    ) {
      throw new Error("Consent-bound Instagram scopes missing");
    }
    const originalAsset = original.approval_scope.asset_artifacts[0]!;
    assert.equal(originalAsset.evidence_id, instagramEvidence.artifact.evidence_id);
    assert.equal(
      originalAsset.evidence_sha256,
      instagramEvidence.immutableArtifact.sha256,
    );
    assert.equal(originalAsset.subject_classification, "child_or_unknown");
    assert.deepEqual(originalAsset.media_kinds, ["image"]);
    assert.equal(originalAsset.authorization.subject_basis, "guardian");
    if (originalAsset.authorization.subject_basis !== "guardian") {
      throw new Error("Guardian authorization missing");
    }
    assert.equal(originalAsset.authorization.consent_id, "consent:ig-guardian");
    assert.deepEqual(originalAsset.authorization.allowed_channels, ["instagram"]);
    assert.deepEqual(originalAsset.authorization.allowed_media, ["image"]);
    assert.equal(
      originalAsset.authorization.non_revoked_checked_at,
      "2026-08-09T15:00:00-04:00",
    );
    assert.equal(originalAsset.authorization.authorization_evaluated_at, startedAt);
    assert.equal(originalAsset.authorization.consent_reference_hash.length, 64);
    assert.notEqual(
      original.approval_scope.content_hash,
      changed.approval_scope.content_hash,
    );

    const packageFor = (proposal: typeof original) =>
      ApprovalPackageSchema.parse({
        schema_version: APPROVAL_PACKAGE_SCHEMA_VERSION,
        evidence_mode: "synthetic",
        review_kind: "external_action_approval",
        proposal,
        draft_content: {
          kind: "social_copy",
          content: strategy.draftContent,
          content_sha256: sha256(strategy.draftContent),
          redaction_status: "synthetic",
        },
        maturity_rule: {
          minimum_age_hours: 72,
          minimum_comparable_executions_per_arm: 3,
          measurement_window_days: proposal.measurement_window_days,
        },
        comparison_rule: {
          primary_kpi: proposal.primary_kpi,
          baseline_reference: "baseline:synthetic-social",
          evidence_refs: proposal.evidence_refs,
        },
        stop_rules: [strategy.stopRule],
        scale_rules: [strategy.scaleRule],
        required_approvals: ["publish"],
        approval_expires_at:
          proposal.approval_scope?.lane === "organic_social"
            ? proposal.approval_scope.publishing_at
            : undefined,
        external_action_status: "not_executed",
      });
    assert.notEqual(
      approvalPackageHash(packageFor(original)),
      approvalPackageHash(packageFor(changed)),
    );

    const staleIntake = structuredClone(intake);
    const staleInstagram = staleIntake.evidence.find(
      (entry) =>
        entry.artifact.lane === "organic_social" &&
        entry.artifact.platform === "instagram",
    );
    if (!staleInstagram || staleInstagram.artifact.lane !== "organic_social") {
      throw new Error("Stale Instagram evidence missing");
    }
    staleInstagram.artifact.payload.consents[0]!.revocation_checked_at =
      "2026-08-06T15:20:00-04:00";
    const stale = createActionDraft(
      "run-consent-original",
      strategyInput,
      strategy,
      instagramAnalysis,
      staleIntake,
      startedAt,
    );
    assert.equal(stale.readiness, "not_approval_ready");
    assert.equal(stale.approval_scope, undefined);

    const exactPublishFreshnessBoundaryIntake = structuredClone(intake);
    const exactPublishFreshnessBoundaryInstagram =
      exactPublishFreshnessBoundaryIntake.evidence.find(
        (entry) =>
          entry.artifact.lane === "organic_social" &&
          entry.artifact.platform === "instagram",
      );
    if (
      !exactPublishFreshnessBoundaryInstagram ||
      exactPublishFreshnessBoundaryInstagram.artifact.lane !== "organic_social"
    ) {
      throw new Error("Publish-time boundary Instagram evidence missing");
    }
    exactPublishFreshnessBoundaryInstagram.artifact.payload.consents[0]!
      .revocation_checked_at = "2026-08-09T03:00:00-04:00";
    const exactPublishFreshnessBoundary = createActionDraft(
      "run-consent-original",
      strategyInput,
      strategy,
      instagramAnalysis,
      exactPublishFreshnessBoundaryIntake,
      startedAt,
    );
    assert.equal(exactPublishFreshnessBoundary.readiness, "approval_ready");
    if (exactPublishFreshnessBoundary.approval_scope?.lane !== "organic_social") {
      throw new Error("Exact publish-time boundary approval scope missing");
    }
    assert.equal(
      exactPublishFreshnessBoundary.approval_scope.publishing_at,
      "2026-08-10T07:00:00.000Z",
    );

    const freshAtDraftButStaleAtPublishIntake = structuredClone(intake);
    const freshAtDraftButStaleAtPublishInstagram =
      freshAtDraftButStaleAtPublishIntake.evidence.find(
        (entry) =>
          entry.artifact.lane === "organic_social" &&
          entry.artifact.platform === "instagram",
      );
    if (
      !freshAtDraftButStaleAtPublishInstagram ||
      freshAtDraftButStaleAtPublishInstagram.artifact.lane !== "organic_social"
    ) {
      throw new Error("Publish-time-stale Instagram evidence missing");
    }
    freshAtDraftButStaleAtPublishInstagram.artifact.payload.consents[0]!
      .revocation_checked_at = "2026-08-09T02:59:00-04:00";
    const freshAtDraftButStaleAtPublish = createActionDraft(
      "run-consent-original",
      strategyInput,
      strategy,
      instagramAnalysis,
      freshAtDraftButStaleAtPublishIntake,
      startedAt,
    );
    assert.equal(freshAtDraftButStaleAtPublish.readiness, "not_approval_ready");
    assert.equal(freshAtDraftButStaleAtPublish.approval_scope, undefined);

    for (const defect of ["guardian", "platform", "media"] as const) {
      const unsafePackage = structuredClone(packageFor(original));
      const unsafeScope = unsafePackage.proposal.approval_scope;
      if (unsafeScope?.lane !== "organic_social") {
        throw new Error("Unsafe test scope missing");
      }
      const unsafeAuthorization = unsafeScope.asset_artifacts[0]!.authorization;
      if (defect === "guardian") {
        (unsafeAuthorization as unknown as { subject_basis: string }).subject_basis =
          "adult";
      } else if (unsafeAuthorization.subject_basis === "guardian") {
        if (defect === "platform") {
          unsafeAuthorization.allowed_channels = ["facebook"];
        } else {
          unsafeAuthorization.allowed_media = ["video"];
        }
      }
      assert.equal(
        ApprovalPackageSchema.safeParse(unsafePackage).success,
        false,
        `expected ${defect} mismatch to fail closed`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("public group-admin URLs remain proposal-only until exact group-post rules approval", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ctf-growth-group-admin-"));
  try {
    const intake = await intakeCaptureBundle({
      captureBundlePath: join(fixtureRoot, "capture-bundle-group-admin.json"),
      allowedEvidenceRoot: fixtureRoot,
      runArtifactRoot: join(directory, "artifacts"),
      runAt: startedAt,
      allowSyntheticEvidence: true,
    });
    const contactEvidence = intake.evidence.find(
      (entry) => entry.artifact.lane === "contact_discovery",
    );
    if (!contactEvidence || contactEvidence.artifact.lane !== "contact_discovery") {
      throw new Error("Contact evidence missing");
    }
    const record = contactEvidence.artifact.payload.records[0]!;
    const lowerScoredEvidence = structuredClone(contactEvidence);
    if (lowerScoredEvidence.artifact.lane !== "contact_discovery") {
      throw new Error("Lower-score contact evidence missing");
    }
    lowerScoredEvidence.declaration.evidence_id = "evidence:contact:lower-public";
    lowerScoredEvidence.artifact.evidence_id = "evidence:contact:lower-public";
    const lowerRecord = lowerScoredEvidence.artifact.payload.records[0]!;
    lowerRecord.record_id = "contact-record:lower-public";
    lowerRecord.organization_name = "Synthetic Lower-Score Public Program";
    lowerRecord.public_contact_channel = "https://example.org/lower/contact";
    lowerRecord.source_url = "https://example.org/lower/program";
    lowerRecord.source_type = "library";
    lowerRecord.group_rules_captured = false;
    delete lowerRecord.group_rules_url;
    delete lowerRecord.group_rules_artifact_path;
    delete lowerRecord.group_rules_content_sha256;
    delete lowerRecord.group_rules_byte_length;
    delete lowerRecord.group_rules_captured_at;
    lowerRecord.permission_basis = "public_org_channel";
    lowerRecord.subject_type = "organization";
    lowerRecord.mission_fit = 1;
    lowerRecord.louisville_relevance = 1;
    lowerRecord.parent_community_access = 1;
    lowerRecord.actionability = 1;
    lowerRecord.identity_hint = "synthetic-lower-public";

    const combinedIntake = structuredClone(intake);
    combinedIntake.evidence = [lowerScoredEvidence, contactEvidence];
    const selectedEvidenceId = contactEvidence.artifact.evidence_id;
    const selectedFingerprint = fingerprintNormalizedContactIdentity(
      normalizeContactIdentity(record),
    );
    const groupAnalysis: LaneAnalysis = {
      lane: "contact_discovery",
      status: "eligible",
      decision: "repeat",
      source_coverage: "complete",
      issues: [],
      evidence_refs: [lowerScoredEvidence.artifact.evidence_id, selectedEvidenceId],
      metrics: [],
      opportunities: [
        {
          candidate_id: "candidate:contact:higher-group-admin",
          lane: "contact_discovery",
          kind: "contact_discovery",
          summary:
            "Review the higher-scored public_group_admin record from the second artifact.",
          score: 100,
          controlled_variable: "discovery_source_lane",
          evidence_refs: [
            lowerScoredEvidence.artifact.evidence_id,
            selectedEvidenceId,
          ],
          record_id: record.record_id,
          selected_evidence_id: selectedEvidenceId,
          identity_fingerprint: selectedFingerprint,
          organization_name: record.organization_name,
          destination: record.public_contact_channel!,
          source_url: record.source_url,
          group_rules_captured: true,
          group_rules_url: record.group_rules_url!,
        },
      ],
    };
    const opportunity = groupAnalysis.opportunities[0]!;
    if (opportunity.kind !== "contact_discovery") {
      throw new Error("Selected contact opportunity missing");
    }
    const strategyInput: LaneStrategyInput = {
      analysisId: "analysis-public-group-admin",
      lane: "contact_discovery",
      eligibility: "eligible",
      primaryKpi: "approved_qualified_discovery_records_60d",
      recommendedDecision: "repeat",
      allowedControlledVariables: ["discovery_source_lane"],
      baselineSummary: "Synthetic public discovery baseline.",
      opportunitySummary: opportunity.summary,
      sourceCoverageSummary: "complete",
      maturitySummary: "mature",
      guardrails: [],
      evidence: [
        {
          id: lowerScoredEvidence.artifact.evidence_id,
          kind: "synthetic_fixture",
          source: "synthetic_fixture",
          observedAt: startedAt,
          summary: "Synthetic lower-score public evidence.",
        },
        {
          id: selectedEvidenceId,
          kind: "synthetic_fixture",
          source: "synthetic_fixture",
          observedAt: startedAt,
          summary: "Synthetic higher-score public group-admin evidence.",
        },
      ],
    };
    const ordinaryOutreach = passingProposal(strategyInput);
    const withoutExplicitGroupApproval = createActionDraft(
      "run-group-admin",
      strategyInput,
      ordinaryOutreach,
      groupAnalysis,
      combinedIntake,
      startedAt,
    );
    assert.equal(withoutExplicitGroupApproval.readiness, "not_approval_ready");
    assert.equal(withoutExplicitGroupApproval.approval_scope, undefined);

    const explicitGroupPost: AgentStrategyProposal = {
      ...ordinaryOutreach,
      requiredApprovals: ["send_outreach", "join_or_post_group"],
    };
    const missingRulesIntake = structuredClone(combinedIntake);
    missingRulesIntake.groupRulesArtifacts = [];
    const withoutRules = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      missingRulesIntake,
      startedAt,
    );
    assert.equal(withoutRules.readiness, "not_approval_ready");

    const legacyOpportunity = structuredClone(groupAnalysis) as unknown as LaneAnalysis & {
      opportunities: Array<{ selected_evidence_id?: string }>;
    };
    delete legacyOpportunity.opportunities[0]!.selected_evidence_id;
    const withoutSelectedEvidence = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      legacyOpportunity,
      combinedIntake,
      startedAt,
    );
    assert.equal(withoutSelectedEvidence.readiness, "not_approval_ready");
    assert.equal(withoutSelectedEvidence.approval_scope, undefined);

    const missingSelectedAnalysis = structuredClone(groupAnalysis);
    const missingSelectedOpportunity = missingSelectedAnalysis.opportunities[0]!;
    if (missingSelectedOpportunity.kind !== "contact_discovery") {
      throw new Error("Missing-selected contact opportunity missing");
    }
    missingSelectedOpportunity.selected_evidence_id = "evidence:contact:missing";
    const zeroSelectedArtifact = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      missingSelectedAnalysis,
      combinedIntake,
      startedAt,
    );
    assert.equal(zeroSelectedArtifact.readiness, "not_approval_ready");

    const duplicateSelectedIntake = structuredClone(combinedIntake);
    duplicateSelectedIntake.evidence.push(structuredClone(contactEvidence));
    const multipleSelectedArtifacts = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      duplicateSelectedIntake,
      startedAt,
    );
    assert.equal(multipleSelectedArtifacts.readiness, "not_approval_ready");

    const duplicateRecordIntake = structuredClone(combinedIntake);
    const duplicateRecordEvidence = duplicateRecordIntake.evidence.find(
      (entry) => entry.artifact.evidence_id === selectedEvidenceId,
    );
    if (!duplicateRecordEvidence || duplicateRecordEvidence.artifact.lane !== "contact_discovery") {
      throw new Error("Selected duplicate-record evidence missing");
    }
    duplicateRecordEvidence.artifact.payload.records.push(structuredClone(record));
    const multipleSelectedRecords = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      duplicateRecordIntake,
      startedAt,
    );
    assert.equal(multipleSelectedRecords.readiness, "not_approval_ready");

    for (const field of ["identity", "source_url", "destination"] as const) {
      const mismatchedAnalysis = structuredClone(groupAnalysis);
      const mismatched = mismatchedAnalysis.opportunities[0]!;
      if (mismatched.kind !== "contact_discovery") {
        throw new Error("Mismatched contact opportunity missing");
      }
      if (field === "identity") {
        mismatched.identity_fingerprint =
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
      } else if (field === "source_url") {
        mismatched.source_url = "https://example.org/different-source";
      } else {
        mismatched.destination = "https://example.org/different-destination";
      }
      const mismatchDraft = createActionDraft(
        "run-group-admin",
        strategyInput,
        explicitGroupPost,
        mismatchedAnalysis,
        combinedIntake,
        startedAt,
      );
      assert.equal(
        mismatchDraft.readiness,
        "not_approval_ready",
        `expected ${field} mismatch to fail closed`,
      );
    }

    const mismatchedTypeIntake = structuredClone(combinedIntake);
    const mismatchedTypeEvidence = mismatchedTypeIntake.evidence.find(
      (entry) => entry.artifact.evidence_id === selectedEvidenceId,
    );
    if (!mismatchedTypeEvidence || mismatchedTypeEvidence.artifact.lane !== "contact_discovery") {
      throw new Error("Selected subject/source mismatch evidence missing");
    }
    mismatchedTypeEvidence.artifact.payload.records[0]!.source_type = "library";
    const mismatchedSubjectSource = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      mismatchedTypeIntake,
      startedAt,
    );
    assert.equal(mismatchedSubjectSource.readiness, "not_approval_ready");

    const lowerPublicAnalysis = structuredClone(groupAnalysis);
    lowerPublicAnalysis.opportunities = [
      {
        ...opportunity,
        candidate_id: "candidate:contact:lower-public",
        record_id: lowerRecord.record_id,
        selected_evidence_id: lowerScoredEvidence.artifact.evidence_id,
        identity_fingerprint: fingerprintNormalizedContactIdentity(
          normalizeContactIdentity(lowerRecord),
        ),
        organization_name: lowerRecord.organization_name,
        destination: lowerRecord.public_contact_channel!,
        source_url: lowerRecord.source_url,
        group_rules_captured: false,
      },
    ];
    const lowerPublicOpportunity = lowerPublicAnalysis.opportunities[0]!;
    if (lowerPublicOpportunity.kind !== "contact_discovery") {
      throw new Error("Lower public contact opportunity missing");
    }
    delete lowerPublicOpportunity.group_rules_url;
    const urlAloneCannotInferContactForm = createActionDraft(
      "run-lower-public",
      strategyInput,
      ordinaryOutreach,
      lowerPublicAnalysis,
      combinedIntake,
      startedAt,
    );
    assert.equal(urlAloneCannotInferContactForm.readiness, "not_approval_ready");
    assert.equal(urlAloneCannotInferContactForm.approval_scope, undefined);

    const rulesUrl = record.group_rules_url!;
    opportunity.group_rules_url = "https://example.org/groups/different-rules";
    const mismatchedRules = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      combinedIntake,
      startedAt,
    );
    assert.equal(mismatchedRules.readiness, "not_approval_ready");

    opportunity.group_rules_url = rulesUrl;
    const exactSevenDayIntake = structuredClone(combinedIntake);
    const exactSevenDayEvidence = exactSevenDayIntake.evidence.find(
      (entry) => entry.artifact.evidence_id === selectedEvidenceId,
    );
    if (
      !exactSevenDayEvidence ||
      exactSevenDayEvidence.artifact.lane !== "contact_discovery"
    ) {
      throw new Error("Seven-day boundary contact evidence missing");
    }
    const exactSevenDayRecord = exactSevenDayEvidence.artifact.payload.records[0]!;
    exactSevenDayRecord.verified_at = "2026-08-03T15:00:00-04:00";
    exactSevenDayRecord.group_rules_captured_at =
      "2026-08-03T15:00:00-04:00";
    exactSevenDayIntake.groupRulesArtifacts[0]!.capturedAt =
      "2026-08-03T15:00:00-04:00";
    const exactSevenDay = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      exactSevenDayIntake,
      startedAt,
    );
    assert.equal(exactSevenDay.readiness, "approval_ready");
    if (exactSevenDay.approval_scope?.lane !== "contact_discovery") {
      throw new Error("Seven-day boundary contact approval scope missing");
    }
    assert.equal(exactSevenDay.approval_scope.send_at, "2026-08-10T19:00:00.000Z");
    assert.equal(
      exactSevenDay.approval_scope.record_verified_at,
      "2026-08-03T15:00:00-04:00",
    );
    assert.equal(
      exactSevenDay.approval_scope.group_rules_artifact?.captured_at,
      "2026-08-03T15:00:00-04:00",
    );

    const staleVerificationIntake = structuredClone(exactSevenDayIntake);
    const staleVerificationEvidence = staleVerificationIntake.evidence.find(
      (entry) => entry.artifact.evidence_id === selectedEvidenceId,
    );
    if (
      !staleVerificationEvidence ||
      staleVerificationEvidence.artifact.lane !== "contact_discovery"
    ) {
      throw new Error("Stale-verification contact evidence missing");
    }
    staleVerificationEvidence.artifact.payload.records[0]!.verified_at =
      "2026-08-03T14:59:00-04:00";
    const staleVerification = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      staleVerificationIntake,
      startedAt,
    );
    assert.equal(staleVerification.readiness, "not_approval_ready");
    assert.equal(staleVerification.approval_scope, undefined);

    const staleRulesIntake = structuredClone(exactSevenDayIntake);
    const staleRulesEvidence = staleRulesIntake.evidence.find(
      (entry) => entry.artifact.evidence_id === selectedEvidenceId,
    );
    if (
      !staleRulesEvidence ||
      staleRulesEvidence.artifact.lane !== "contact_discovery"
    ) {
      throw new Error("Stale group-rules evidence missing");
    }
    staleRulesEvidence.artifact.payload.records[0]!.group_rules_captured_at =
      "2026-08-03T14:59:00-04:00";
    staleRulesIntake.groupRulesArtifacts[0]!.capturedAt =
      "2026-08-03T14:59:00-04:00";
    const staleRules = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      staleRulesIntake,
      startedAt,
    );
    assert.equal(staleRules.readiness, "not_approval_ready");
    assert.equal(staleRules.approval_scope, undefined);

    const exactGroupPost = createActionDraft(
      "run-group-admin",
      strategyInput,
      explicitGroupPost,
      groupAnalysis,
      combinedIntake,
      startedAt,
    );
    assert.equal(exactGroupPost.readiness, "approval_ready");
    assert.equal(exactGroupPost.approval_scope?.lane, "contact_discovery");
    if (exactGroupPost.approval_scope?.lane !== "contact_discovery") {
      throw new Error("Exact group-post approval scope missing");
    }
    assert.equal(exactGroupPost.approval_scope.action, "group_post");
    assert.equal(
      exactGroupPost.approval_scope.record_verified_at,
      "2026-08-08T15:20:00-04:00",
    );
    assert.equal(exactGroupPost.approval_scope.send_at, "2026-08-10T19:00:00.000Z");
    assert.equal(exactGroupPost.approval_scope.group_rules_url, rulesUrl);
    assert.deepEqual(exactGroupPost.approval_scope.group_rules_artifact, {
      parent_evidence_id: "evidence:contact:group-admin",
      record_id: "contact-record:public-group-admin",
      source_url: rulesUrl,
      immutable_sha256:
        "2e475ae220d9b899cae69af9bd6e387309133b7eb64fe8f83320dc450b53818f",
      byte_length: 91,
      captured_at: "2026-08-08T15:20:00-04:00",
    });

    const approvalPackage = ApprovalPackageSchema.parse({
      schema_version: APPROVAL_PACKAGE_SCHEMA_VERSION,
      evidence_mode: "synthetic",
      review_kind: "external_action_approval",
      proposal: exactGroupPost,
      draft_content: {
        kind: "contact_outreach",
        content: explicitGroupPost.draftContent,
        content_sha256: sha256(explicitGroupPost.draftContent),
        redaction_status: "synthetic",
      },
      maturity_rule: {
        minimum_age_hours: 0,
        minimum_comparable_executions_per_arm: 1,
        measurement_window_days: exactGroupPost.measurement_window_days,
      },
      comparison_rule: {
        primary_kpi: exactGroupPost.primary_kpi,
        baseline_reference: "baseline:synthetic-group-rules",
        evidence_refs: exactGroupPost.evidence_refs,
      },
      stop_rules: [explicitGroupPost.stopRule],
      scale_rules: [explicitGroupPost.scaleRule],
      required_approvals: ["send"],
      approval_expires_at: exactGroupPost.approval_scope.send_at,
      external_action_status: "not_executed",
    });
    for (const defect of [
      "record_stale",
      "record_future",
      "rules_stale",
      "rules_future",
    ] as const) {
      const temporalMismatch = structuredClone(approvalPackage);
      if (temporalMismatch.schema_version !== APPROVAL_PACKAGE_SCHEMA_VERSION) {
        throw new Error("Expected current approval package");
      }
      const temporalScope = temporalMismatch.proposal.approval_scope;
      if (
        temporalScope?.lane !== "contact_discovery" ||
        !temporalScope.group_rules_artifact
      ) {
        throw new Error("Temporal group-post approval scope missing");
      }
      if (defect === "record_stale") {
        temporalScope.record_verified_at = "2026-08-03T14:59:00-04:00";
      } else if (defect === "record_future") {
        temporalScope.record_verified_at = "2026-08-10T15:01:00-04:00";
      } else if (defect === "rules_stale") {
        temporalScope.group_rules_artifact.captured_at =
          "2026-08-03T14:59:00-04:00";
      } else {
        temporalScope.group_rules_artifact.captured_at =
          "2026-08-10T15:01:00-04:00";
      }
      assert.equal(
        ApprovalPackageSchema.safeParse(temporalMismatch).success,
        false,
        `expected ${defect} to fail the exact send-time freshness gate`,
      );
    }
    const changedRules = structuredClone(approvalPackage);
    const changedScope = changedRules.proposal.approval_scope;
    if (
      changedScope?.lane !== "contact_discovery" ||
      !changedScope.group_rules_artifact
    ) {
      throw new Error("Changed group-rules scope missing");
    }
    changedScope.group_rules_artifact.immutable_sha256 =
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const parsedChangedRules = ApprovalPackageSchema.parse(changedRules);
    assert.notEqual(
      approvalPackageHash(approvalPackage),
      approvalPackageHash(parsedChangedRules),
    );

    const missingImmutableRules = structuredClone(approvalPackage) as unknown as {
      proposal: {
        approval_scope?: {
          group_rules_artifact?: unknown;
        };
      };
    };
    delete missingImmutableRules.proposal.approval_scope?.group_rules_artifact;
    assert.equal(
      ApprovalPackageSchema.safeParse(missingImmutableRules).success,
      false,
    );

    const historicalPackage = structuredClone(approvalPackage) as Record<
      string,
      any
    >;
    historicalPackage.schema_version = LEGACY_APPROVAL_PACKAGE_SCHEMA_VERSION;
    delete historicalPackage.evidence_mode;
    delete historicalPackage.approval_expires_at;
    delete historicalPackage.proposal.approval_scope.record_verified_at;
    historicalPackage.proposal.approval_scope.group_rules_artifact.captured_at =
      "2026-08-01T15:20:00-04:00";
    const parsedHistoricalPackage = ApprovalPackageSchema.parse(
      historicalPackage,
    );
    assert.equal(
      parsedHistoricalPackage.schema_version,
      LEGACY_APPROVAL_PACKAGE_SCHEMA_VERSION,
    );
    assert.equal("evidence_mode" in parsedHistoricalPackage, false);
    const storedHistoricalReview = HumanReviewSchema.parse({
      review_id: "review:historical-pr8-group",
      proposal_id: parsedHistoricalPackage.proposal.proposal_id,
      lane: "contact_discovery",
      review_kind: "external_action_approval",
      status: "awaiting_review",
      approval_hash: approvalPackageHash(parsedHistoricalPackage),
      approval_package: parsedHistoricalPackage,
      requested_at: "2026-08-08T15:00:00-04:00",
    });
    const projectedHistoricalReview = projectPersistedReviewForRuntime(
      storedHistoricalReview,
      "2026-08-08T15:00:00-04:00",
      { start: "2026-08-08", end: "2026-10-07" },
    );
    assert.equal(projectedHistoricalReview.review_kind, "proposal_review");
    assert.equal(
      projectedHistoricalReview.approval_package.proposal.readiness,
      "not_approval_ready",
    );
    assert.equal(
      projectedHistoricalReview.approval_package.proposal.approval_scope,
      undefined,
    );
    assert.deepEqual(
      projectedHistoricalReview.approval_package.required_approvals,
      ["proposal_review"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
