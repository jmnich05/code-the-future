import { createHash, randomUUID } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

import {
  DEFAULT_GROWTH_MODEL,
  DEFAULT_GROWTH_REASONING_EFFORT,
  GrowthReasoningEffortSchema,
  createOpenAIGrowthStrategist,
  createOpenAIGrowthStrategyEvaluator,
} from "./assessor.js";
import { GrowthLedger } from "./ledger.js";
import {
  defaultManualIdempotencyKey,
  validateTriggerIdentity,
  resolveSyntheticRunAt,
} from "./cli-policy.js";
import { redactObserverValue } from "./observer.js";
import { CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY } from "./project-policy.js";
import { CaptureBundleSchema, IsoInstantSchema } from "./schema.js";
import {
  preparePrivateSqliteFile,
  prepareStateDirectory,
} from "./state-io.js";
import {
  GRAPH_VERSION,
  POLICY_VERSION,
  PROMPT_VERSION,
  TOOL_VERSION,
  computeRuntimeManifestHash,
  createGrowthWorkflow,
  createInitialGrowthRun,
  resolveConfinedCapturePath,
  writeGrowthFailureProjections,
  type GrowthWorkflowState,
  type JsonValue,
} from "./workflow.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): string {
  return `Code the Future growth graph (shadow mode)

New run:
  npm run graph:shadow -- --capture /absolute/path/capture-bundle.json [--sha SHA256]

Resume:
  npm run graph:shadow -- --resume RUN_ID

Options:
  --run-id ID
  --idempotency-key KEY
  --trigger-kind manual|scheduled
  --trigger-ref OFFSET_QUALIFIED_SLOT
  --started-at INSTANT          Internal operator binding; not a backdate control
  --state-root PATH
  --project-state PATH
  --evidence-root PATH
  --allow-synthetic-evidence  Test fixtures only; rejected by default
  --run-at INSTANT            Fixed clock for synthetic fixtures only

This command writes local state, ledger, review packages, and a read-only visual
observer. It never publishes social content, sends outreach, changes Search
Console, merges code, deploys, spends money, or treats review as approval.`;
}

function lockedVersion(
  lock: { packages?: Record<string, { version?: string }> },
  packageName: string,
): string {
  const version = lock.packages?.[`node_modules/${packageName}`]?.version;
  if (!version) throw new Error(`Locked package version is missing: ${packageName}`);
  return version;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for the bounded strategy and eval nodes");
  }
  process.umask(0o077);

  const allowSyntheticEvidence = process.argv.includes("--allow-synthetic-evidence");
  if (process.argv.includes("--run-at") && argument("--run-at") === undefined) {
    throw new Error("--run-at requires an offset-qualified instant");
  }
  const syntheticRunAt = resolveSyntheticRunAt(
    argument("--run-at"),
    allowSyntheticEvidence,
  );

  if (
    process.argv.includes("--started-at") &&
    argument("--started-at") === undefined
  ) {
    throw new Error("--started-at requires an offset-qualified instant");
  }
  const requestedStartedAt = argument("--started-at")
    ? IsoInstantSchema.parse(argument("--started-at"))
    : undefined;
  const resumeRunId = argument("--resume");
  if (requestedStartedAt && resumeRunId) {
    throw new Error("--started-at is not accepted for resume");
  }
  if (
    requestedStartedAt &&
    (!argument("--run-id") ||
      !argument("--idempotency-key") ||
      !argument("--trigger-kind"))
  ) {
    throw new Error(
      "--started-at requires explicit run, idempotency, and trigger identity",
    );
  }

  const stateRoot = resolve(
    argument("--state-root") ??
      process.env.CODE_THE_FUTURE_GROWTH_STATE_ROOT ??
      join(repositoryRoot, ".state", "growth-graph"),
  );
  const requestedStartedAtAgeMs = requestedStartedAt
    ? Date.now() - Date.parse(requestedStartedAt)
    : 0;
  const requestedStartedAtIsCurrent =
    requestedStartedAt !== undefined &&
    requestedStartedAtAgeMs >= -5_000 &&
    requestedStartedAtAgeMs <= 5 * 60 * 1_000;
  if (
    requestedStartedAt &&
    !syntheticRunAt &&
    !requestedStartedAtIsCurrent
  ) {
    try {
      const stats = await lstat(join(stateRoot, "ledger.sqlite"));
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error("Existing ledger authority is unsafe");
      }
    } catch {
      throw new Error(
        "An older --started-at is allowed only for an existing exact pre-checkpoint owner",
      );
    }
  }
  const projectStatePath = resolve(
    argument("--project-state") ?? join(repositoryRoot, "PROJECT_STATE.md"),
  );
  const evidenceRoot = await realpath(
    resolve(argument("--evidence-root") ?? repositoryRoot),
  );
  await prepareStateDirectory(stateRoot, { ownerOnly: true });
  const operatorLockPath = await preparePrivateSqliteFile(
    join(stateRoot, "operator-lock.sqlite"),
  );
  const operatorLock = new DatabaseSync(operatorLockPath);
  try {
    operatorLock.exec(`
      PRAGMA busy_timeout = 0;
      CREATE TABLE IF NOT EXISTS lock_contract (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1)
      ) STRICT;
    `);
    // The graph child owns this independent SQLite write reservation for its
    // entire lifetime. The OS releases it on crash, while it remains held if a
    // wrapper process dies, avoiding PID-file reclaim and unlink races.
    operatorLock.exec("BEGIN IMMEDIATE");
  } catch (error) {
    operatorLock.close();
    if (
      (error as { code?: unknown }).code === "SQLITE_BUSY" ||
      /database is locked|SQLITE_BUSY/iu.test(String(error))
    ) {
      throw new Error("Graph execution lock is busy");
    }
    throw error;
  }

  const graphSources = (await readdir(resolve(packageRoot, "src")))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => resolve(packageRoot, "src", name));
  const policyManifestPaths = [
    resolve(repositoryRoot, "AGENTS.md"),
    resolve(repositoryRoot, "PROJECT_CHARTER.md"),
    resolve(packageRoot, "package.json"),
    resolve(packageRoot, "package-lock.json"),
    resolve(packageRoot, "tsconfig.json"),
    ...graphSources,
  ];
  const packageLock = JSON.parse(
    await readFile(resolve(packageRoot, "package-lock.json"), "utf8"),
  ) as { packages?: Record<string, { version?: string }> };
  const strategistModel =
    process.env.CODE_THE_FUTURE_STRATEGY_MODEL ?? DEFAULT_GROWTH_MODEL;
  const evaluatorModel =
    process.env.CODE_THE_FUTURE_EVAL_MODEL ?? DEFAULT_GROWTH_MODEL;
  const strategistReasoningEffort = GrowthReasoningEffortSchema.parse(
    process.env.CODE_THE_FUTURE_STRATEGY_REASONING_EFFORT ??
      DEFAULT_GROWTH_REASONING_EFFORT,
  );
  const evaluatorReasoningEffort = GrowthReasoningEffortSchema.parse(
    process.env.CODE_THE_FUTURE_EVAL_REASONING_EFFORT ??
      DEFAULT_GROWTH_REASONING_EFFORT,
  );
  const runtimeManifest: JsonValue = {
    graphVersion: GRAPH_VERSION,
    policyVersion: POLICY_VERSION,
    promptVersion: PROMPT_VERSION,
    toolVersion: TOOL_VERSION,
    strategistModel,
    evaluatorModel,
    strategistReasoningEffort,
    evaluatorReasoningEffort,
    evidenceRoot,
    allowSyntheticEvidence,
    syntheticRunAt: syntheticRunAt ?? null,
    projectIdentityPolicy:
      CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY as unknown as JsonValue,
    toolVersions: {
      agentsSdk: lockedVersion(packageLock, "@openai/agents"),
      openai: lockedVersion(packageLock, "openai"),
      langGraph: lockedVersion(packageLock, "@langchain/langgraph"),
      langGraphSqlite: lockedVersion(
        packageLock,
        "@langchain/langgraph-checkpoint-sqlite",
      ),
      node: process.version,
    },
  };
  const runtimeManifestHash = await computeRuntimeManifestHash(
    policyManifestPaths,
    runtimeManifest,
  );

  const ledgerPath = await preparePrivateSqliteFile(
    join(stateRoot, "ledger.sqlite"),
  );
  const checkpointPath = await preparePrivateSqliteFile(
    join(stateRoot, "checkpoints.sqlite"),
  );
  const ledger = new GrowthLedger(ledgerPath);
  const checkpointer = SqliteSaver.fromConnString(checkpointPath);
  const workflowOptions = {
    ledger,
    checkpointer,
    strategist: createOpenAIGrowthStrategist({
      model: strategistModel,
      promptVersion: PROMPT_VERSION,
      reasoningEffort: strategistReasoningEffort,
    }),
    evaluator: createOpenAIGrowthStrategyEvaluator({
      model: evaluatorModel,
      promptVersion: PROMPT_VERSION,
      reasoningEffort: evaluatorReasoningEffort,
    }),
    paths: {
      stateRoot,
      projectStatePath,
      observerDirectory: join(stateRoot, "observer"),
    },
    evidenceRoot,
    allowSyntheticEvidence,
    policyManifestPaths,
    runtimeManifest,
    ...(syntheticRunAt
      ? { now: () => new Date(syntheticRunAt) }
      : {}),
  };
  const graph = createGrowthWorkflow(workflowOptions);
  let initial: GrowthWorkflowState | null = null;
  let threadId: string;

  if (resumeRunId) {
    threadId = resumeRunId;
  } else {
    const requestedCapturePath = argument("--capture");
    if (!requestedCapturePath) throw new Error(`--capture is required\n\n${usage()}`);

    // Resolve real paths and enforce evidence-root confinement before the first
    // capture read. Artifact intake repeats this check before reading siblings.
    const capturePath = await resolveConfinedCapturePath(
      evidenceRoot,
      requestedCapturePath,
    );
    const captureBytes = await readFile(capturePath);
    const captureSha256 = createHash("sha256").update(captureBytes).digest("hex");
    const expectedSha256 = argument("--sha");
    if (expectedSha256 && expectedSha256 !== captureSha256) {
      throw new Error("Provided capture SHA-256 does not match the confined file");
    }
    const bundle = CaptureBundleSchema.parse(JSON.parse(captureBytes.toString("utf8")));
    if (
      syntheticRunAt &&
      bundle.evidence.some(
        (entry) =>
          entry.producer_mode !== "synthetic_fixture" ||
          entry.redaction_status !== "synthetic",
      )
    ) {
      throw new Error("--run-at cannot be used with real or mixed evidence");
    }
    const startedAt =
      requestedStartedAt ?? syntheticRunAt ?? new Date().toISOString();
    const runId =
      argument("--run-id") ??
      `growth-${startedAt.replaceAll(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
    const idempotencyKey =
      argument("--idempotency-key") ??
      defaultManualIdempotencyKey(captureSha256, startedAt);
    const requestedTriggerKind = argument("--trigger-kind") ?? "manual";
    const triggerReference = argument("--trigger-ref");
    const triggerKind = validateTriggerIdentity({
      triggerKind: requestedTriggerKind,
      ...(triggerReference ? { triggerReference } : {}),
      idempotencyKey,
      projectId: "code-the-future",
      graphVersion: GRAPH_VERSION,
    });
    if (
      triggerKind === "manual" &&
      idempotencyKey.startsWith("manual:") &&
      idempotencyKey !== defaultManualIdempotencyKey(captureSha256, startedAt)
    ) {
      throw new Error(
        "Manual idempotency key does not match the capture and started-at date",
      );
    }
    if (requestedStartedAt && syntheticRunAt && requestedStartedAt !== syntheticRunAt) {
      throw new Error("Synthetic --started-at must equal the explicit --run-at");
    }
    const existingStartedAtOwner = requestedStartedAt
      ? ledger.readRun(runId)
      : null;
    if (
      requestedStartedAt &&
      !syntheticRunAt &&
      (existingStartedAtOwner || !requestedStartedAtIsCurrent)
    ) {
      const owner = ledger.verifyRunAuthority(runId);
      const uncommittedRunIds = ledger.listUncommittedRunIds();
      const saved = await graph.getState({
        configurable: { thread_id: runId },
        recursionLimit: 100,
      });
      const expectedPolicyHash = createHash("sha256")
        .update(`${POLICY_VERSION}:${GRAPH_VERSION}`)
        .digest("hex");
      if (
        owner.transaction ||
        uncommittedRunIds.length !== 1 ||
        uncommittedRunIds[0] !== runId ||
        owner.run.runId !== runId ||
        owner.run.threadId !== runId ||
        owner.run.idempotencyKey !== idempotencyKey ||
        owner.run.workflowName !== GRAPH_VERSION ||
        owner.run.policyHash !== expectedPolicyHash ||
        owner.run.runtimeHash !== runtimeManifestHash ||
        owner.run.captureBundleHash !== captureSha256 ||
        owner.run.startedAt !== startedAt ||
        owner.run.triggerKind !== triggerKind ||
        Boolean((saved.values as GrowthWorkflowState | undefined)?.canonical?.run_id)
      ) {
        throw new Error(
          "Older started-at does not match the single uncommitted pre-checkpoint owner",
        );
      }
    }
    initial = createInitialGrowthRun({
      runId,
      idempotencyKey,
      capturePath,
      expectedCaptureSha256: captureSha256,
      runtimeManifestHash,
      triggerKind,
      startedAt,
      objectiveWindow: bundle.objective_window,
      metricDefinitionVersion: bundle.metric_definition_version,
      modelId: `${strategistModel}|eval:${evaluatorModel}`,
      promptVersion: PROMPT_VERSION,
      toolVersion: TOOL_VERSION,
    });
    threadId = initial.canonical.thread_id;
  }

  const config = {
    configurable: { thread_id: threadId },
    recursionLimit: 100,
  };
  try {
    if (resumeRunId) {
      const saved = await graph.getState(config);
      const savedState = saved.values as GrowthWorkflowState;
      if (!savedState?.canonical?.run_id) {
        throw new Error(`No checkpoint exists for run ${resumeRunId}`);
      }
      if (savedState.canonical.runtime_manifest_hash !== runtimeManifestHash) {
        throw new Error(
          "Cannot resume: current policy, prompt, model, or tool manifest differs from the checkpoint",
        );
      }
    }
    const final = (await graph.invoke(initial, config)) as GrowthWorkflowState;
    const evidenceMode = final.intake
      ? final.intake.evidence.some(
          (entry) =>
            entry.artifact.producer.mode === "synthetic_fixture" ||
            entry.artifact.redaction_status === "synthetic",
        )
        ? "synthetic"
        : "real"
      : final.canonical.reviews[0]?.approval_package.evidence_mode ?? "unknown";
    process.stdout.write(
      `${JSON.stringify(
        {
          runId: final.canonical.run_id,
          status: final.status,
          evidenceMode,
          transactionId: final.persistence.transactionId,
          localPersistenceVerified: final.persistence.verified,
          projectionStatus: final.duplicateNoop
            ? "preserved_existing"
            : "updated",
          reviewCount: final.canonical.reviews.length,
          externalActionStatus: "not_executed",
          projectStatePath,
          observerPath: join(stateRoot, "observer", "index.html"),
          nextSafeAction: final.canonical.next_safe_action,
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    const snapshot = await graph.getState(config);
    const state = snapshot.values as GrowthWorkflowState;
    if (state?.canonical?.run_id) {
      await writeGrowthFailureProjections(state, workflowOptions);
    }
    throw error;
  } finally {
    checkpointer.db.close();
    ledger.close();
    operatorLock.exec("ROLLBACK");
    operatorLock.close();
  }
}

main().catch((error) => {
  const safeError = redactObserverValue(
    error instanceof Error ? error.message : String(error),
  );
  process.stderr.write(
    `${JSON.stringify({ status: "failed_pending_resume", error: safeError })}\n`,
  );
  process.exitCode = 1;
});
