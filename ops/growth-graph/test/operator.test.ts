import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import test from "node:test";

import { GrowthLedger, type LedgerRunInput, type PortfolioCommitInput } from "../src/ledger.js";
import {
  LEGACY_APPROVAL_PACKAGE_SCHEMA_VERSION,
  ApprovalPackageSchema,
  HumanReviewSchema,
  approvalPackageHash,
} from "../src/schema.js";
import {
  assessCaptureForOperator,
  deterministicOperatorRunId,
  focusSnapshotOnRun,
  inspectOperatorState,
  manualIdempotencyKey,
  normalizeCatchUpSlot,
  scheduledIdempotencyKey,
} from "../src/operator-state.js";
import { validateTriggerIdentity } from "../src/cli-policy.js";
import { GRAPH_VERSION, POLICY_VERSION } from "../src/workflow.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(packageRoot, "test", "fixtures");
const dayZeroCapture = join(fixtureRoot, "capture-bundle-day-zero.json");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const CURRENT_POLICY_HASH = createHash("sha256")
  .update(`${POLICY_VERSION}:${GRAPH_VERSION}`)
  .digest("hex");
interface CheckpointAuthorityFixture {
  runId: string;
  threadId: string;
  idempotencyKey: string;
  workflowVersion: string;
  policyVersion: string;
  runtimeHash: string;
  captureBundleHash: string;
  startedAt: string;
  triggerKind: LedgerRunInput["triggerKind"];
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function rowHash(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(sortJson(value), null, 2)}\n`)
    .digest("hex");
}

function checkpointAuthority(input: LedgerRunInput): CheckpointAuthorityFixture {
  return {
    runId: input.runId,
    threadId: input.threadId,
    idempotencyKey: input.idempotencyKey,
    workflowVersion: input.workflowName,
    policyVersion: POLICY_VERSION,
    runtimeHash: input.runtimeHash,
    captureBundleHash: input.captureBundleHash,
    startedAt: input.startedAt,
    triggerKind: input.triggerKind,
  };
}

function runInput(input: {
  runId: string;
  idempotencyKey?: string;
  captureBundleHash?: string;
  startedAt?: string;
  triggerKind?: LedgerRunInput["triggerKind"];
}): LedgerRunInput {
  return {
    runId: input.runId,
    threadId: input.runId,
    idempotencyKey: input.idempotencyKey ?? `manual:${input.runId}`,
    workflowName: "growth_portfolio_shadow_v1",
    policyHash: CURRENT_POLICY_HASH,
    runtimeHash: HASH_B,
    captureBundleHash: input.captureBundleHash ?? HASH_A,
    startedAt: input.startedAt ?? "2026-08-09T08:00:00-04:00",
    triggerKind: input.triggerKind ?? "manual",
  };
}

function commitInput(
  runId: string,
  terminalStatus: PortfolioCommitInput["terminalStatus"] = "complete",
  reviews: PortfolioCommitInput["reviews"] = [],
): PortfolioCommitInput {
  return {
    transactionId: `transaction:${runId}`,
    runId,
    committedAt: "2026-08-09T08:05:00-04:00",
    terminalStatus,
    nextSafeAction: "Inspect the verified local result; no external action occurred.",
    evidence: [],
    metrics: [],
    contacts: [],
    experiments: [],
    evals: [],
    reviews,
    errors: [],
    outbox: [],
  };
}

function writeCheckpoint(
  path: string,
  runId: string,
  options: {
    finalized?: boolean;
    checkpointNamespace?: string;
    checkpointType?: "json" | "bytes";
    identityOnlyAuthority?: boolean;
    authority?: CheckpointAuthorityFixture;
  } = {},
): void {
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint BLOB,
        metadata BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      );
      CREATE TABLE IF NOT EXISTS writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        value BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      );
    `);
    const baseValues = options.finalized
      ? {
          currentNode: "finalize",
          completedAt: "2026-08-09T08:06:00-04:00",
          persistence: { verified: true },
          status: "complete",
        }
      : {
          currentNode: "llm_strategy",
          completedAt: null,
          persistence: { verified: false },
          status: "running",
          "branch:to:llm_strategy": null,
        };
    const values = {
      ...baseValues,
      ...(options.authority
        ? {
            startedAt: options.authority.startedAt,
            expectedCaptureSha256: options.authority.captureBundleHash,
            canonical: {
              run_id: options.authority.runId,
              thread_id: options.authority.threadId,
              ...(options.identityOnlyAuthority
                ? {}
                : {
                    idempotency_key: options.authority.idempotencyKey,
                    graph_version: options.authority.workflowVersion,
                    policy_version: options.authority.policyVersion,
                    runtime_manifest_hash: options.authority.runtimeHash,
                    capture_bundle_hash: options.authority.captureBundleHash,
                    trigger_kind: options.authority.triggerKind,
                  }),
            },
          }
        : {}),
    };
    database
      .prepare(`
        INSERT INTO checkpoints (
          thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
          type, checkpoint, metadata
        ) VALUES (?, ?, ?, NULL, ?, ?, ?)
      `)
      .run(
        runId,
        options.checkpointNamespace ?? "",
        "1f193f25-b641-6390-8001-4d527278fa8d",
        options.checkpointType ?? "json",
        Buffer.from(
          JSON.stringify({
            v: 4,
            id: "1f193f25-b641-6390-8001-4d527278fa8d",
            ts: "2026-08-09T12:06:00.000Z",
            channel_values: values,
            channel_versions: {},
            versions_seen: {},
          }),
        ),
        Buffer.from(JSON.stringify({ source: "loop", step: 1, parents: {} })),
      );
  } finally {
    database.close();
  }
}

async function command(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx/esm", "src/operator-cli.ts", ...args],
      { cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", rejectCommand);
    child.once("close", (code) =>
      resolveCommand({ code: code ?? 70, stdout, stderr }),
    );
  });
}

async function rawCommand(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx/esm", "src/cli.ts", ...args],
      { cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", rejectCommand);
    child.once("close", (code) =>
      resolveCommand({ code: code ?? 70, stdout, stderr }),
    );
  });
}

async function absent(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

test("all read-only commands need no API key and create no state", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-empty-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state-never-created");
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  for (const name of ["status", "reviews", "explain-failure", "doctor"]) {
    const result = await command([name, "--state-root", stateRoot, "--json"], env);
    assert.equal(result.code, name === "doctor" ? 20 : 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(parsed.schemaVersion, "graph-operator.result.v1");
    assert.equal(parsed.command, name);
    assert.equal(
      parsed.classification,
      name === "doctor" ? "failed_terminal" : "not_initialized",
    );
    assert.equal(result.stdout.trim().split("\n").length, 1);
  }
  assert.equal(await absent(stateRoot), true);
});

test("doctor validates the configured state, projection, and evidence paths", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-doctor-paths-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "new-state");
  const result = await command(
    [
      "doctor",
      "--state-root",
      stateRoot,
      "--project-state",
      join(root, "projection", "PROJECT_STATE.md"),
      "--evidence-root",
      join(root, "missing-evidence"),
      "--json",
    ],
    { ...process.env, OPENAI_API_KEY: "presence-check-only" },
  );
  assert.equal(result.code, 22, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    classification: string;
    failure: { category: string };
  };
  assert.equal(parsed.classification, "failed_terminal");
  assert.equal(parsed.failure.category, "operator_path_access_failed");
  assert.equal(await absent(stateRoot), true);
});

test("an interrupted older run wins over a later committed run", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-old-interrupted-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(
    runInput({ runId: "run-old", startedAt: "2026-08-09T07:00:00-04:00" }),
  );
  ledger.beginRun(
    runInput({ runId: "run-new", startedAt: "2026-08-09T08:00:00-04:00" }),
  );
  ledger.commitPortfolio(commitInput("run-new"));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-old", {
    authority: checkpointAuthority(
      runInput({ runId: "run-old", startedAt: "2026-08-09T07:00:00-04:00" }),
    ),
  });
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-new", {
    finalized: true,
    authority: checkpointAuthority(
      runInput({ runId: "run-new", startedAt: "2026-08-09T08:00:00-04:00" }),
    ),
  });

  const snapshot = await inspectOperatorState({
    stateRoot: root,
    now: "2026-08-09T09:00:00-04:00",
  });
  assert.equal(snapshot.classification, "interrupted_resumable");
  assert.equal(snapshot.run?.runId, "run-old");
});

test("an exact older finalized resume reports that run, not the latest run", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-exact-old-run-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(
    runInput({ runId: "run-old", startedAt: "2026-08-09T07:00:00-04:00" }),
  );
  ledger.commitPortfolio(commitInput("run-old"));
  ledger.beginRun(
    runInput({ runId: "run-new", startedAt: "2026-08-09T08:00:00-04:00" }),
  );
  ledger.commitPortfolio(commitInput("run-new"));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-old", {
    finalized: true,
    authority: checkpointAuthority(
      runInput({ runId: "run-old", startedAt: "2026-08-09T07:00:00-04:00" }),
    ),
  });
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-new", {
    finalized: true,
    authority: checkpointAuthority(
      runInput({ runId: "run-new", startedAt: "2026-08-09T08:00:00-04:00" }),
    ),
  });

  const status = await command([
    "status",
    "--run-id",
    "run-old",
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(
    (JSON.parse(status.stdout) as { run: { runId: string } }).run.runId,
    "run-old",
  );

  const result = await command([
    "resume",
    "--run-id",
    "run-old",
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    outcome: string;
    run: { runId: string };
  };
  assert.equal(parsed.outcome, "noop");
  assert.equal(parsed.run.runId, "run-old");
});

test("an older consequential marker globally blocks replay despite a newer terminal run", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-external-uncertain-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const oldInput = runInput({
    runId: "run-external-old",
    startedAt: "2026-08-09T07:00:00-04:00",
  });
  const newInput = runInput({
    runId: "run-terminal-new",
    startedAt: "2026-08-09T08:00:00-04:00",
  });
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(oldInput);
  ledger.commitPortfolio(commitInput(oldInput.runId));
  ledger.appendEvent({
    eventId: "external-send-started",
    runId: oldInput.runId,
    idempotencyKey: "external-send-started",
    type: "send.started",
    node: "external_boundary",
    attempt: 0,
    createdAt: "2026-08-09T07:06:00-04:00",
    payload: { status: "unknown" },
  });
  ledger.beginRun(newInput);
  ledger.commitPortfolio(commitInput(newInput.runId));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), oldInput.threadId, {
    finalized: true,
    authority: checkpointAuthority(oldInput),
  });
  writeCheckpoint(join(root, "checkpoints.sqlite"), newInput.threadId, {
    finalized: true,
    authority: checkpointAuthority(newInput),
  });

  const snapshot = await inspectOperatorState({ stateRoot: root });
  assert.equal(snapshot.classification, "uncertain_external_action");
  assert.equal(snapshot.run?.runId, oldInput.runId);
  assert.equal(
    focusSnapshotOnRun(snapshot, newInput.runId).run?.runId,
    oldInput.runId,
  );

  for (const statusArgs of [
    ["status"],
    ["status", "--run-id", newInput.runId],
    ["reviews"],
  ]) {
    const result = await command([
      ...statusArgs,
      "--state-root",
      root,
      "--json",
    ]);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as {
      classification: string;
      run: { runId: string };
      externalActionStatus: string;
    };
    assert.equal(parsed.classification, "uncertain_external_action");
    assert.equal(parsed.run.runId, oldInput.runId);
    assert.equal(parsed.externalActionStatus, "unknown");
  }

  const blocked = await command([
    "run-now",
    "--capture",
    join(root, "missing-capture.json"),
    "--evidence-root",
    root,
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(blocked.code, 20, blocked.stderr);
  const blockedEnvelope = JSON.parse(blocked.stdout) as {
    classification: string;
    failure: { category: string };
    externalActionStatus: string;
  };
  assert.equal(blockedEnvelope.classification, "uncertain_external_action");
  assert.equal(blockedEnvelope.failure.category, "uncertain_external_action");
  assert.equal(blockedEnvelope.externalActionStatus, "unknown");
});

test("a hash-bound non-draft outbox marker is an uncertain external action", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-outbox-uncertain-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const input = runInput({ runId: "run-outbox-unknown" });
  const ledgerPath = join(root, "ledger.sqlite");
  const ledger = new GrowthLedger(ledgerPath);
  ledger.beginRun(input);
  ledger.close();
  const outbox = {
    outboxId: "outbox-external-status",
    idempotencyKey: "outbox-external-status",
    lane: "organic_social",
    kind: "social_draft",
    contentHash: HASH_B,
    status: "sent",
    createdAt: "2026-08-09T08:01:00-04:00",
    payload: { authority: "local_draft_only" },
  };
  const database = new DatabaseSync(ledgerPath);
  database.exec("PRAGMA ignore_check_constraints = ON");
  database
    .prepare(`
      INSERT INTO outbox (
        outbox_id, run_id, idempotency_key, lane, kind, content_hash,
        status, created_at, payload_json, row_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      outbox.outboxId,
      input.runId,
      outbox.idempotencyKey,
      outbox.lane,
      outbox.kind,
      outbox.contentHash,
      outbox.status,
      outbox.createdAt,
      JSON.stringify(outbox.payload),
      rowHash(outbox),
    );
  database.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), input.threadId, {
    authority: checkpointAuthority(input),
  });

  const snapshot = await inspectOperatorState({ stateRoot: root });
  assert.equal(snapshot.classification, "uncertain_external_action");
  assert.equal(snapshot.run?.runId, input.runId);
  assert.equal(snapshot.failure?.category, "uncertain_external_action");
});

test("multiple incomplete runs and a ledger without a checkpoint fail closed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-invariants-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(runInput({ runId: "run-one" }));
  ledger.beginRun(
    runInput({ runId: "run-two", startedAt: "2026-08-09T08:01:00-04:00" }),
  );
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-one", {
    authority: checkpointAuthority(runInput({ runId: "run-one" })),
  });
  const multiple = await inspectOperatorState({ stateRoot: root });
  assert.equal(multiple.classification, "corrupt_state");
  assert.equal(multiple.failure?.category, "multiple_incomplete_runs");

  const secondRoot = await mkdtemp(join(tmpdir(), "ctf-operator-no-checkpoint-"));
  context.after(() => rm(secondRoot, { recursive: true, force: true }));
  const secondLedger = new GrowthLedger(join(secondRoot, "ledger.sqlite"));
  secondLedger.beginRun(runInput({ runId: "run-no-checkpoint" }));
  secondLedger.close();
  const missing = await inspectOperatorState({ stateRoot: secondRoot });
  assert.equal(missing.classification, "missing_checkpoint");
});

test("orphan checkpoint threads fail closed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-orphan-thread-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(runInput({ runId: "run-ledger" }));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-orphan", {
    authority: checkpointAuthority(runInput({ runId: "run-orphan" })),
  });

  const snapshot = await inspectOperatorState({ stateRoot: root });
  assert.equal(snapshot.classification, "corrupt_state");
  assert.match(snapshot.failure?.message ?? "", /absent from the canonical ledger/u);
});

test("permanent precommit failures are terminal and never presented as resumable", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-permanent-precommit-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(runInput({ runId: "run-permanent" }));
  ledger.recordError({
    errorId: "error-permanent",
    runId: "run-permanent",
    idempotencyKey: "error-permanent",
    fingerprint: HASH_A,
    node: "capture",
    category: "capture_policy",
    attempt: 1,
    retryable: false,
    message: "Permanent capture policy failure",
    evidenceRefs: [],
    createdAt: "2026-08-09T08:01:00-04:00",
  });
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-permanent", {
    authority: checkpointAuthority(runInput({ runId: "run-permanent" })),
  });

  const snapshot = await inspectOperatorState({ stateRoot: root });
  assert.equal(snapshot.classification, "failed_terminal");
  assert.equal(snapshot.failure?.retryable, false);
  assert.doesNotMatch(snapshot.nextSafeAction, /Resume exact/u);
  const explained = await command([
    "explain-failure",
    "--run-id",
    "run-permanent",
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(explained.code, 0, explained.stderr);
  const parsed = JSON.parse(explained.stdout) as {
    run: { runId: string };
    failure: { category: string };
  };
  assert.equal(parsed.run.runId, "run-permanent");
  assert.equal(parsed.failure.category, "capture_policy");
});

test("pre-operator v2 final checkpoints remain finalized and blocked terminal is never complete", async (context) => {
  for (const terminalStatus of ["complete", "blocked"] as const) {
    const root = await mkdtemp(join(tmpdir(), `ctf-operator-legacy-final-${terminalStatus}-`));
    context.after(() => rm(root, { recursive: true, force: true }));
    const runId = `run-${terminalStatus}`;
    const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
    ledger.beginRun(runInput({ runId }));
    ledger.commitPortfolio(commitInput(runId, terminalStatus));
    ledger.close();
    writeCheckpoint(join(root, "checkpoints.sqlite"), runId, {
      finalized: true,
      authority: checkpointAuthority(runInput({ runId })),
    });
    const snapshot = await inspectOperatorState({ stateRoot: root });
    assert.equal(
      snapshot.classification,
      terminalStatus === "complete" ? "completed" : "failed_terminal",
    );
    assert.equal(snapshot.persistence.readbackVerified, true);
  }
});

test("semantic ledger tampering fails current canonical readback", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-tamper-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "ledger.sqlite");
  const ledger = new GrowthLedger(path);
  ledger.beginRun(runInput({ runId: "run-tampered" }));
  ledger.recordError({
    errorId: "error-original",
    runId: "run-tampered",
    idempotencyKey: "error-original",
    fingerprint: HASH_A,
    node: "capture",
    category: "capture_policy",
    attempt: 1,
    retryable: false,
    message: "Original safe failure",
    evidenceRefs: [],
    createdAt: "2026-08-09T08:01:00-04:00",
  });
  ledger.commitPortfolio(commitInput("run-tampered", "failed"));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-tampered", {
    finalized: true,
    authority: checkpointAuthority(runInput({ runId: "run-tampered" })),
  });
  const database = new DatabaseSync(path);
  database.exec("DROP TRIGGER errors_reject_update");
  database.prepare("UPDATE errors SET message = ?").run("Tampered failure");
  database.close();

  const snapshot = await inspectOperatorState({ stateRoot: root });
  assert.equal(snapshot.classification, "corrupt_state");
  assert.equal(snapshot.persistence.ledger, "corrupt");
});

test("run authority and final-marker row tampering fail canonical inspection", async (context) => {
  for (const target of ["run", "event"] as const) {
    const root = await mkdtemp(join(tmpdir(), `ctf-operator-${target}-tamper-`));
    context.after(() => rm(root, { recursive: true, force: true }));
    const path = join(root, "ledger.sqlite");
    const runId = `run-${target}-tamper`;
    const ledger = new GrowthLedger(path);
    ledger.beginRun(runInput({ runId }));
    ledger.appendEvent({
      eventId: "event-finalized",
      runId,
      idempotencyKey: "event-finalized",
      type: "portfolio.finalized",
      node: "finalize",
      attempt: 0,
      createdAt: "2026-08-09T08:06:00-04:00",
      payload: {
        projectionStatus: "written",
        completedAt: "2026-08-09T08:06:00-04:00",
      },
    });
    ledger.commitPortfolio(commitInput(runId));
    ledger.close();
    writeCheckpoint(join(root, "checkpoints.sqlite"), runId, {
      finalized: true,
      authority: checkpointAuthority(runInput({ runId })),
    });
    const database = new DatabaseSync(path);
    if (target === "run") {
      database.exec("DROP TRIGGER runs_reject_update");
      database.prepare("UPDATE runs SET capture_bundle_hash = ?").run(HASH_B);
    } else {
      database.exec("DROP TRIGGER events_reject_update");
      database
        .prepare("UPDATE events SET payload_json = ?")
        .run(
          JSON.stringify({
            projectionStatus: "tampered",
            completedAt: "2026-08-09T08:06:00-04:00",
          }),
        );
    }
    database.close();
    const snapshot = await inspectOperatorState({ stateRoot: root });
    assert.equal(snapshot.classification, "corrupt_state");
    assert.equal(snapshot.persistence.ledger, "corrupt");
  }
});

test("new run authority hashes bind started time, thread ID, and run ID", async (context) => {
  for (const field of ["started_at", "thread_id", "run_id"] as const) {
    const root = await mkdtemp(join(tmpdir(), `ctf-operator-run-${field}-`));
    context.after(() => rm(root, { recursive: true, force: true }));
    const path = join(root, "ledger.sqlite");
    const runId = `run-authority-${field}`;
    const input = runInput({ runId });
    const ledger = new GrowthLedger(path);
    ledger.beginRun(input);
    if (field !== "run_id") {
      ledger.commitPortfolio(commitInput(runId));
      writeCheckpoint(join(root, "checkpoints.sqlite"), runId, {
        finalized: true,
        authority: checkpointAuthority(input),
      });
    }
    ledger.close();
    const database = new DatabaseSync(path);
    database.exec("DROP TRIGGER runs_reject_update");
    const forged =
      field === "started_at"
        ? "2026-10-01T08:00:00-04:00"
        : field === "thread_id"
          ? "forged-thread"
          : "forged-run";
    database.prepare(`UPDATE runs SET ${field} = ?`).run(forged);
    database.close();
    const snapshot = await inspectOperatorState({ stateRoot: root });
    assert.equal(snapshot.classification, "corrupt_state");
    assert.equal(snapshot.persistence.ledger, "corrupt");
  }
});

test("a real PR9-style legacy run hash is readable only with exact checkpoint authority", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-pr9-legacy-run-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "ledger.sqlite");
  const input: LedgerRunInput = {
    ...runInput({ runId: "run-pr9-legacy" }),
    workflowName: GRAPH_VERSION,
    policyHash: createHash("sha256")
      .update(`${POLICY_VERSION}:${GRAPH_VERSION}`)
      .digest("hex"),
  };
  const ledger = new GrowthLedger(path);
  ledger.beginRun(input);
  ledger.commitPortfolio(commitInput(input.runId));
  ledger.close();
  const legacyHash = rowHash({
    idempotencyKey: input.idempotencyKey,
    workflowName: input.workflowName,
    policyHash: input.policyHash,
    runtimeHash: input.runtimeHash,
    captureBundleHash: input.captureBundleHash,
    triggerKind: input.triggerKind,
  });
  const database = new DatabaseSync(path);
  database.exec("DROP TRIGGER runs_reject_update");
  database.prepare("UPDATE runs SET row_hash = ?").run(legacyHash);
  database.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), input.threadId, {
    finalized: true,
    authority: checkpointAuthority(input),
  });

  const compatible = await inspectOperatorState({ stateRoot: root });
  assert.equal(compatible.classification, "completed");
  assert.equal(compatible.persistence.ledger, "healthy");
  assert.equal(compatible.persistence.readbackVerified, true);

  const forged = new DatabaseSync(path);
  forged
    .prepare("UPDATE runs SET started_at = ?")
    .run("2026-10-01T08:00:00-04:00");
  forged.close();
  const rejected = await inspectOperatorState({ stateRoot: root });
  assert.equal(rejected.classification, "corrupt_state");
  assert.equal(rejected.persistence.ledger, "corrupt");
});

test("only identity-bound main-namespace checkpoints can make a run resumable", async (context) => {
  const nestedRoot = await mkdtemp(join(tmpdir(), "ctf-operator-nested-checkpoint-"));
  context.after(() => rm(nestedRoot, { recursive: true, force: true }));
  const nestedInput = runInput({ runId: "run-nested-only" });
  const nestedLedger = new GrowthLedger(join(nestedRoot, "ledger.sqlite"));
  nestedLedger.beginRun(nestedInput);
  nestedLedger.close();
  writeCheckpoint(
    join(nestedRoot, "checkpoints.sqlite"),
    nestedInput.threadId,
    {
      checkpointNamespace: "nested:only",
      authority: {
        ...checkpointAuthority(nestedInput),
        runId: "other",
        threadId: "other",
      },
    },
  );
  const nested = await inspectOperatorState({ stateRoot: nestedRoot });
  assert.equal(nested.classification, "missing_checkpoint");

  const mismatchRoot = await mkdtemp(join(tmpdir(), "ctf-operator-mismatch-checkpoint-"));
  context.after(() => rm(mismatchRoot, { recursive: true, force: true }));
  const mismatchInput = runInput({ runId: "run-main-mismatch" });
  const mismatchLedger = new GrowthLedger(join(mismatchRoot, "ledger.sqlite"));
  mismatchLedger.beginRun(mismatchInput);
  mismatchLedger.close();
  writeCheckpoint(
    join(mismatchRoot, "checkpoints.sqlite"),
    mismatchInput.threadId,
    {
      authority: {
        ...checkpointAuthority(mismatchInput),
        runId: "other",
        threadId: "other",
      },
    },
  );
  const mismatch = await inspectOperatorState({ stateRoot: mismatchRoot });
  assert.equal(mismatch.classification, "corrupt_state");
});

test("unsupported or authority-free main checkpoints never make a run resumable", async (context) => {
  for (const checkpointType of ["bytes", "json"] as const) {
    const root = await mkdtemp(
      join(tmpdir(), `ctf-operator-${checkpointType}-checkpoint-`),
    );
    context.after(() => rm(root, { recursive: true, force: true }));
    const input = runInput({ runId: `run-${checkpointType}-checkpoint` });
    const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
    ledger.beginRun(input);
    ledger.close();
    writeCheckpoint(join(root, "checkpoints.sqlite"), input.threadId, {
      checkpointType,
      ...(checkpointType === "bytes"
        ? { authority: checkpointAuthority(input) }
        : {}),
    });

    const snapshot = await inspectOperatorState({ stateRoot: root });
    assert.equal(snapshot.classification, "corrupt_state");
    assert.equal(snapshot.persistence.checkpoint, "unknown");
  }

  const truncatedRoot = await mkdtemp(
    join(tmpdir(), "ctf-operator-truncated-authority-checkpoint-"),
  );
  context.after(() => rm(truncatedRoot, { recursive: true, force: true }));
  const truncatedInput = runInput({ runId: "run-truncated-checkpoint" });
  const ledger = new GrowthLedger(join(truncatedRoot, "ledger.sqlite"));
  ledger.beginRun(truncatedInput);
  ledger.close();
  writeCheckpoint(
    join(truncatedRoot, "checkpoints.sqlite"),
    truncatedInput.threadId,
    {
      authority: checkpointAuthority(truncatedInput),
      identityOnlyAuthority: true,
    },
  );
  const truncated = await inspectOperatorState({ stateRoot: truncatedRoot });
  assert.equal(truncated.classification, "corrupt_state");
  assert.equal(truncated.persistence.checkpoint, "unknown");
});

test("completion time comes from finalization checkpoint, not transaction commit", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-completion-time-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(runInput({ runId: "run-completion-time" }));
  ledger.commitPortfolio(commitInput("run-completion-time"));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-completion-time", {
    finalized: true,
    authority: checkpointAuthority(runInput({ runId: "run-completion-time" })),
  });
  const snapshot = await inspectOperatorState({ stateRoot: root });
  assert.equal(snapshot.run?.completedAt, "2026-08-09T08:06:00-04:00");
  assert.notEqual(snapshot.run?.completedAt, "2026-08-09T08:05:00-04:00");
});

test("user_version 1 is audit-only and never migrated", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-v1-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "ledger.sqlite");
  const database = new DatabaseSync(path);
  database.exec("PRAGMA user_version = 1");
  database.close();
  const snapshot = await inspectOperatorState({ stateRoot: root });
  assert.equal(snapshot.classification, "unsupported_ledger");
  const verify = new DatabaseSync(path, { readOnly: true });
  assert.equal(
    (verify.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
    1,
  );
  verify.close();
});

test("legacy external-action reviews are operator-facing proposal review only", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-legacy-review-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const content = "Synthetic SEO change specification for local review only.";
  const contentHash = createHash("sha256").update(content).digest("hex");
  const approvalPackage = ApprovalPackageSchema.parse({
    schema_version: LEGACY_APPROVAL_PACKAGE_SCHEMA_VERSION,
    evidence_mode: "synthetic",
    review_kind: "external_action_approval",
    proposal: {
      proposal_id: "proposal-legacy-seo",
      lane: "search_console",
      hypothesis: "A bounded title change may improve qualified clicks.",
      controlled_variable: "title_meta_alignment",
      arm: "legacy-title",
      primary_kpi: "nonbrand_parent_intent_gsc_clicks_28d",
      measurement_window_days: 28,
      evidence_refs: ["evidence-legacy-gsc"],
      readiness: "approval_ready",
      approval_scope: {
        lane: "search_console",
        action: "merge_and_deploy",
        property_id: "https://codethefuture.net/",
        page_url: "https://codethefuture.net/",
        query_cluster: "louisville kids coding camp",
        change_hash: contentHash,
        deploy_target: "production-main",
        deploy_at: "2026-08-10T10:00:00-04:00",
      },
      external_action_status: "not_executed",
    },
    draft_content: {
      kind: "seo_change_spec",
      content,
      content_sha256: contentHash,
      redaction_status: "synthetic",
    },
    maturity_rule: {
      minimum_age_hours: 0,
      minimum_comparable_executions_per_arm: 1,
      measurement_window_days: 28,
    },
    comparison_rule: {
      primary_kpi: "nonbrand_parent_intent_gsc_clicks_28d",
      baseline_reference: "baseline-legacy-gsc",
      evidence_refs: ["evidence-legacy-gsc"],
    },
    stop_rules: ["Stop on measurement defects."],
    scale_rules: ["Scale only after mature evidence."],
    required_approvals: ["merge_deploy"],
    external_action_status: "not_executed",
  });
  const review = HumanReviewSchema.parse({
    review_id: "review-legacy-seo",
    proposal_id: "proposal-legacy-seo",
    lane: "search_console",
    review_kind: "external_action_approval",
    status: "awaiting_review",
    approval_hash: approvalPackageHash(approvalPackage),
    approval_package: approvalPackage,
    requested_at: "2026-08-09T08:00:00-04:00",
  });
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(runInput({ runId: "run-legacy-review" }));
  ledger.commitPortfolio(
    commitInput("run-legacy-review", "awaiting_review", [
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
    ]),
  );
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-legacy-review", {
    finalized: true,
    authority: checkpointAuthority(runInput({ runId: "run-legacy-review" })),
  });
  const snapshot = await inspectOperatorState({
    stateRoot: root,
    now: "2026-08-09T09:00:00-04:00",
  });
  assert.equal(snapshot.reviews[0]?.kind, "proposal_review");
  assert.equal(snapshot.reviews[0]?.operatorCanExecute, false);
  assert.equal(snapshot.reviews[0]?.payload?.proposalReadiness, "not_approval_ready");
  assert.equal(
    snapshot.reviews[0]?.payload?.actionAuthority,
    "expired_or_legacy_downgraded",
  );
  assert.equal(JSON.stringify(snapshot.reviews).includes(content), false);
  const exact = await command([
    "reviews",
    "--review-id",
    "review-legacy-seo",
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(exact.code, 0, exact.stderr);
  const exactReview = (JSON.parse(exact.stdout) as {
    reviews: { items: Array<{ kind: string; payload: Record<string, unknown> }> };
  }).reviews.items[0]!;
  assert.equal(exactReview.kind, "proposal_review");
  assert.equal(exactReview.payload.approvalHash, review.approval_hash);
  assert.equal(
    (exactReview.payload.persistedApprovalPackageAuditOnly as {
      draft_content: { content: string };
    }).draft_content.content,
    content,
  );
  assert.equal(exactReview.payload.actionAuthority, "expired_or_legacy_downgraded");
});

test("GSC-only day-zero capture is valid while stale declared social is rejected", async () => {
  const valid = await assessCaptureForOperator({
    capturePath: dayZeroCapture,
    evidenceRoot: fixtureRoot,
    allowSyntheticEvidence: true,
    syntheticRunAt: "2026-08-08T23:00:00-04:00",
    now: "2026-08-09T09:00:00-04:00",
  });
  assert.equal(valid.freshness.state, "fresh");
  assert.equal(valid.bundle.evidence.some((item) => item.lane === "organic_social"), false);

  await assert.rejects(
    assessCaptureForOperator({
      capturePath: join(fixtureRoot, "capture-bundle.json"),
      evidenceRoot: fixtureRoot,
      allowSyntheticEvidence: true,
      syntheticRunAt: "2026-08-11T23:00:00-04:00",
      now: "2026-08-09T09:00:00-04:00",
    }),
  );
});

test("capture objective window must exactly match the fixed project window", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-objective-window-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = JSON.parse(await readFile(dayZeroCapture, "utf8")) as {
    objective_window: { start: string; end: string };
  };
  capture.objective_window.end = "2026-10-08";
  await copyFile(join(fixtureRoot, "search-console.json"), join(root, "search-console.json"));
  const capturePath = join(root, "capture.json");
  await writeFile(capturePath, `${JSON.stringify(capture, null, 2)}\n`);
  const assessment = await assessCaptureForOperator({
    capturePath,
    evidenceRoot: root,
    allowSyntheticEvidence: true,
    syntheticRunAt: "2026-08-08T23:00:00-04:00",
    now: "2026-08-09T09:00:00-04:00",
  });
  assert.equal(assessment.freshness.state, "stale");
  assert.match(assessment.freshness.reason ?? "", /fixed project window/u);
});

test("corrupt referenced evidence fails before any state or lock bytes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-bad-capture-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const evidenceRoot = join(root, "evidence");
  const stateRoot = join(root, "state");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(evidenceRoot));
  await copyFile(dayZeroCapture, join(evidenceRoot, "capture.json"));
  const source = await readFile(join(fixtureRoot, "search-console.json"));
  await writeFile(join(evidenceRoot, "search-console.json"), Buffer.concat([source, Buffer.from(" ")]));
  const result = await command([
    "run-now",
    "--capture",
    join(evidenceRoot, "capture.json"),
    "--evidence-root",
    evidenceRoot,
    "--state-root",
    stateRoot,
    "--allow-synthetic-evidence",
    "--run-at",
    "2026-08-08T23:00:00-04:00",
    "--json",
  ]);
  assert.equal(result.code, 20, `${result.stderr}\n${result.stdout}`);
  assert.equal((JSON.parse(result.stdout) as { classification: string }).classification, "recapture_required");
  assert.equal(await absent(stateRoot), true);
});

test("a symlinked capture is rejected before any state or lock bytes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-symlink-capture-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const captureLink = join(root, "capture-link.json");
  const stateRoot = join(root, "state");
  await symlink(dayZeroCapture, captureLink);
  const result = await command([
    "run-now",
    "--capture",
    captureLink,
    "--evidence-root",
    root,
    "--state-root",
    stateRoot,
    "--json",
  ]);
  assert.equal(result.code, 20, result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as { classification: string }).classification,
    "recapture_required",
  );
  assert.equal(await absent(stateRoot), true);
});

test("deterministic pre-checkpoint ownership can re-enter only the exact raw trigger", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-precheckpoint-owner-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const captureHash = createHash("sha256")
    .update(await readFile(dayZeroCapture))
    .digest("hex");
  const startedAt = "2026-08-09T08:00:00-04:00";
  const key = manualIdempotencyKey(captureHash, startedAt);
  const runId = deterministicOperatorRunId(key);
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(
    runInput({
      runId,
      idempotencyKey: key,
      captureBundleHash: captureHash,
      startedAt,
    }),
  );
  ledger.close();
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  const result = await command(
    [
      "run-now",
      "--capture",
      dayZeroCapture,
      "--evidence-root",
      fixtureRoot,
      "--state-root",
      root,
      "--allow-synthetic-evidence",
      "--run-at",
      "2026-08-08T23:00:00-04:00",
      "--json",
    ],
    env,
  );
  assert.equal(result.code, 20, `${result.stderr}\n${result.stdout}`);
  const parsed = JSON.parse(result.stdout) as {
    run: { runId: string };
    failure: { category: string };
  };
  assert.equal(parsed.run.runId, runId);
  assert.equal(parsed.failure.category, "configuration_required");
  assert.equal(await absent(join(root, "checkpoints.sqlite")), true);
});

test("a committed run without a checkpoint remains manual-repair only", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-committed-no-checkpoint-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const captureHash = createHash("sha256")
    .update(await readFile(dayZeroCapture))
    .digest("hex");
  const startedAt = "2026-08-09T08:00:00-04:00";
  const key = manualIdempotencyKey(captureHash, startedAt);
  const runId = deterministicOperatorRunId(key);
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(
    runInput({
      runId,
      idempotencyKey: key,
      captureBundleHash: captureHash,
      startedAt,
    }),
  );
  ledger.commitPortfolio(commitInput(runId));
  ledger.close();
  const result = await command([
    "run-now",
    "--capture",
    dayZeroCapture,
    "--evidence-root",
    fixtureRoot,
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(result.code, 22, result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as { classification: string }).classification,
    "missing_checkpoint",
  );
});

test("a live child lock is visible to status and blocks actions before capture preflight", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-child-lock-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(root, { recursive: true });
  const lock = new DatabaseSync(join(root, "operator-lock.sqlite"));
  lock.exec(`
    CREATE TABLE lock_contract (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1)
    ) STRICT;
    BEGIN IMMEDIATE;
  `);
  context.after(() => {
    try {
      lock.exec("ROLLBACK");
    } finally {
      lock.close();
    }
  });
  const status = await command(["status", "--state-root", root, "--json"]);
  assert.equal(status.code, 0, status.stderr);
  const statusEnvelope = JSON.parse(status.stdout) as {
    outcome: string;
    classification: string;
    failure: { category: string };
  };
  assert.equal(statusEnvelope.outcome, "ok");
  assert.equal(statusEnvelope.classification, "running");
  assert.equal(statusEnvelope.failure.category, "single_flight_busy");

  const result = await command(
    [
      "run-now",
      "--capture",
      join(root, "missing-capture.json"),
      "--evidence-root",
      root,
      "--state-root",
      root,
      "--json",
    ],
    { ...process.env, OPENAI_API_KEY: "test-key-never-used" },
  );
  assert.equal(result.code, 10, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    outcome: string;
    classification: string;
    failure: { category: string };
  };
  assert.equal(parsed.outcome, "blocked");
  assert.equal(parsed.classification, "running");
  assert.equal(parsed.failure.category, "single_flight_busy");
  assert.equal(await absent(join(root, "ledger.sqlite")), true);
});

test("the raw child distinguishes a busy lock from lock database corruption", async (context) => {
  const busyRoot = await mkdtemp(join(tmpdir(), "ctf-raw-lock-busy-"));
  const corruptRoot = await mkdtemp(join(tmpdir(), "ctf-raw-lock-corrupt-"));
  context.after(() => rm(busyRoot, { recursive: true, force: true }));
  context.after(() => rm(corruptRoot, { recursive: true, force: true }));
  const held = new DatabaseSync(join(busyRoot, "operator-lock.sqlite"));
  held.exec(`
    CREATE TABLE lock_contract (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1)
    ) STRICT;
    BEGIN IMMEDIATE;
  `);
  context.after(() => {
    try {
      held.exec("ROLLBACK");
    } finally {
      held.close();
    }
  });
  const common = [
    "--capture",
    dayZeroCapture,
    "--evidence-root",
    fixtureRoot,
    "--allow-synthetic-evidence",
    "--run-at",
    "2026-08-08T23:00:00-04:00",
  ];
  const env = { ...process.env, OPENAI_API_KEY: "test-key-never-used" };
  const busy = await rawCommand(
    [...common, "--state-root", busyRoot],
    env,
  );
  assert.equal(busy.code, 1);
  assert.match(busy.stderr, /Graph execution lock is busy/u);

  await writeFile(
    join(corruptRoot, "operator-lock.sqlite"),
    "not a sqlite database",
  );
  const corrupt = await rawCommand(
    [...common, "--state-root", corruptRoot],
    env,
  );
  assert.equal(corrupt.code, 1);
  assert.doesNotMatch(corrupt.stderr, /Graph execution lock is busy/u);
  assert.match(corrupt.stderr, /database|disk image|SQLITE/iu);
});

test("the raw internal started-at binding cannot create a backdated owner", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-raw-started-at-backdate-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state-must-remain-absent");
  const captureHash = createHash("sha256")
    .update(await readFile(dayZeroCapture))
    .digest("hex");
  const startedAt = "2026-08-08T08:00:00-04:00";
  const result = await rawCommand(
    [
      "--capture",
      dayZeroCapture,
      "--evidence-root",
      fixtureRoot,
      "--state-root",
      stateRoot,
      "--run-id",
      "raw-backdated-owner",
      "--idempotency-key",
      manualIdempotencyKey(captureHash, startedAt),
      "--trigger-kind",
      "manual",
      "--started-at",
      startedAt,
    ],
    { ...process.env, OPENAI_API_KEY: "test-key-never-used" },
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /existing exact pre-checkpoint owner/u);
  assert.equal(await absent(stateRoot), true);
});

test("run-now and catch-up reject user-supplied run IDs", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-ignored-run-id-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const args of [
    ["run-now", "--run-id", "ignored"],
    [
      "catch-up",
      "--slot",
      "2026-08-09T06:00:00-04:00",
      "--run-id",
      "ignored",
    ],
  ]) {
    const result = await command([...args, "--state-root", root, "--json"]);
    assert.equal(result.code, 2, result.stderr);
    assert.equal(
      (JSON.parse(result.stdout) as { failure: { category: string } }).failure.category,
      "invalid_arguments",
    );
  }
  assert.equal(await absent(root), false);
  assert.equal(await absent(join(root, "ledger.sqlite")), true);
});

test("scheduled slots normalize to New York and exact finalized slots no-op", async (context) => {
  assert.equal(
    normalizeCatchUpSlot("2026-08-09T10:00:00Z"),
    "2026-08-09T06:00:00-04:00",
  );
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-slot-noop-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const captureHash = createHash("sha256")
    .update(await readFile(dayZeroCapture))
    .digest("hex");
  const slot = "2026-08-09T06:00:00-04:00";
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(
    runInput({
      runId: "run-slot",
      idempotencyKey: scheduledIdempotencyKey(slot),
      captureBundleHash: captureHash,
      triggerKind: "scheduled",
    }),
  );
  ledger.commitPortfolio(commitInput("run-slot"));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-slot", {
    finalized: true,
    authority: checkpointAuthority(
      runInput({
        runId: "run-slot",
        idempotencyKey: scheduledIdempotencyKey(slot),
        captureBundleHash: captureHash,
        triggerKind: "scheduled",
      }),
    ),
  });
  const result = await command([
    "catch-up",
    "--slot",
    slot,
    "--capture",
    dayZeroCapture,
    "--evidence-root",
    fixtureRoot,
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { outcome: string; run: { runId: string } };
  assert.equal(parsed.outcome, "noop");
  assert.equal(parsed.run.runId, "run-slot");
});

test("same scheduled slot with a different capture hash is an invariant conflict", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-operator-slot-conflict-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const slot = "2026-08-09T06:00:00-04:00";
  const ledger = new GrowthLedger(join(root, "ledger.sqlite"));
  ledger.beginRun(
    runInput({
      runId: "run-slot-conflict",
      idempotencyKey: scheduledIdempotencyKey(slot),
      captureBundleHash: HASH_A,
      triggerKind: "scheduled",
    }),
  );
  ledger.commitPortfolio(commitInput("run-slot-conflict"));
  ledger.close();
  writeCheckpoint(join(root, "checkpoints.sqlite"), "run-slot-conflict", {
    finalized: true,
    authority: checkpointAuthority(
      runInput({
        runId: "run-slot-conflict",
        idempotencyKey: scheduledIdempotencyKey(slot),
        captureBundleHash: HASH_A,
        triggerKind: "scheduled",
      }),
    ),
  });
  const result = await command([
    "catch-up",
    "--slot",
    slot,
    "--capture",
    dayZeroCapture,
    "--evidence-root",
    fixtureRoot,
    "--state-root",
    root,
    "--json",
  ]);
  assert.equal(result.code, 22, result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as { failure: { category: string } }).failure.category,
    "idempotency_capture_conflict",
  );
});

test("manual and scheduled idempotency identities are deterministic", () => {
  assert.equal(
    manualIdempotencyKey(HASH_A, "2026-08-10T01:00:00Z"),
    `manual:${HASH_A}:2026-08-09`,
  );
  assert.equal(
    scheduledIdempotencyKey("2026-08-09T10:00:00Z"),
    "scheduled:code-the-future:growth_portfolio_shadow_v1:2026-08-09T06:00:00-04:00",
  );
  const slot = "2026-08-09T06:00:00-04:00";
  const key = scheduledIdempotencyKey(slot);
  assert.equal(
    validateTriggerIdentity({
      triggerKind: "scheduled",
      triggerReference: slot,
      idempotencyKey: key,
      projectId: "code-the-future",
      graphVersion: "growth_portfolio_shadow_v1",
    }),
    "scheduled",
  );
  assert.throws(() =>
    validateTriggerIdentity({
      triggerKind: "scheduled",
      triggerReference: "2026-08-09T07:00:00-04:00",
      idempotencyKey: key,
      projectId: "code-the-future",
      graphVersion: "growth_portfolio_shadow_v1",
    }),
  );
  assert.throws(() =>
    validateTriggerIdentity({
      triggerKind: "manual",
      idempotencyKey: key,
      projectId: "code-the-future",
      graphVersion: "growth_portfolio_shadow_v1",
    }),
  );
});
