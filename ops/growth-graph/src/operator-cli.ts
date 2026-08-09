import { spawn } from "node:child_process";
import { access, lstat, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { redactObserverValue } from "./observer.js";
import {
  EMPTY_OPERATOR_PERSISTENCE,
  OPERATOR_COMMANDS,
  UNCHECKED_FRESHNESS,
  operatorResult,
  type OperatorClassification,
  type OperatorCommand,
  type OperatorExitCode,
  type OperatorFailure,
  type OperatorFreshnessSummary,
  type OperatorOutcome,
  type OperatorResult,
} from "./operator-contract.js";
import {
  PROJECT_OBJECTIVE_WINDOW,
  assessCaptureForOperator,
  deterministicOperatorRunId,
  findRunByIdempotencyKey,
  focusSnapshotOnRun,
  inspectOperatorState,
  inspectCaptureBinding,
  manualIdempotencyKey,
  normalizeCatchUpSlot,
  scheduledIdempotencyKey,
  type CaptureAssessment,
  type OperatorStateSnapshot,
} from "./operator-state.js";
import {
  projectCalendarDate,
  projectDateIsWithinWindow,
} from "./project-policy.js";
import { IsoInstantSchema } from "./schema.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");

class OperatorArgumentError extends Error {
  override name = "OperatorArgumentError";
}

class OperatorGateError extends Error {
  override name = "OperatorGateError";
}

function safeText(value: unknown): string {
  const redacted = redactObserverValue(value);
  return typeof redacted === "string" ? redacted : JSON.stringify(redacted);
}

interface ParsedOperatorArguments {
  command: OperatorCommand;
  stateRoot: string;
  projectStatePath: string;
  evidenceRoot: string;
  capturePath?: string;
  expectedSha256?: string;
  slot?: string;
  runId?: string;
  reviewId?: string;
  allowSyntheticEvidence: boolean;
  syntheticRunAt?: string;
  compactJson: boolean;
  help: boolean;
}

interface GraphProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface CommandExecution {
  result: OperatorResult;
  exitCode: OperatorExitCode;
}

function parseOperatorArguments(args: string[]): ParsedOperatorArguments {
  const parsed = parseArgs({
    args,
    options: {
      "state-root": { type: "string" },
      "project-state": { type: "string" },
      "evidence-root": { type: "string" },
      capture: { type: "string" },
      sha: { type: "string" },
      slot: { type: "string" },
      "run-id": { type: "string" },
      "review-id": { type: "string" },
      "allow-synthetic-evidence": { type: "boolean", default: false },
      "run-at": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const commandValue = parsed.positionals[0];
  if (
    parsed.positionals.length !== 1 ||
    !commandValue ||
    !OPERATOR_COMMANDS.includes(commandValue as OperatorCommand)
  ) {
    throw new OperatorArgumentError(
      "Expected exactly one command: status, run-now, catch-up, resume, reviews, explain-failure, or doctor.",
    );
  }
  return {
    command: commandValue as OperatorCommand,
    stateRoot: resolve(
      parsed.values["state-root"] ??
        process.env.CODE_THE_FUTURE_GROWTH_STATE_ROOT ??
        join(repositoryRoot, ".state", "growth-graph"),
    ),
    projectStatePath: resolve(
      parsed.values["project-state"] ?? join(repositoryRoot, "PROJECT_STATE.md"),
    ),
    evidenceRoot: resolve(parsed.values["evidence-root"] ?? repositoryRoot),
    ...(parsed.values.capture ? { capturePath: parsed.values.capture } : {}),
    ...(parsed.values.sha ? { expectedSha256: parsed.values.sha } : {}),
    ...(parsed.values.slot ? { slot: parsed.values.slot } : {}),
    ...(parsed.values["run-id"] ? { runId: parsed.values["run-id"] } : {}),
    ...(parsed.values["review-id"]
      ? { reviewId: parsed.values["review-id"] }
      : {}),
    allowSyntheticEvidence: parsed.values["allow-synthetic-evidence"],
    ...(parsed.values["run-at"]
      ? { syntheticRunAt: parsed.values["run-at"] }
      : {}),
    compactJson: parsed.values.json,
    help: parsed.values.help,
  };
}

function usage(): string {
  return [
    "npm run graph:ops -- status [--run-id EXACT_RUN_ID]",
    "npm run graph:ops -- run-now --capture /absolute/capture.json --evidence-root /approved/root",
    "npm run graph:ops -- catch-up --slot 2026-08-09T06:00:00-04:00 --capture /absolute/capture.json --evidence-root /approved/root",
    "npm run graph:ops -- resume --run-id EXACT_RUN_ID --evidence-root /same/approved/root",
    "npm run graph:ops -- reviews [--review-id EXACT_REVIEW_ID]",
    "npm run graph:ops -- explain-failure [--run-id EXACT_RUN_ID]",
    "npm run graph:ops -- doctor",
  ].join("; ");
}

function outcomeForSnapshot(snapshot: OperatorStateSnapshot): OperatorOutcome {
  if (
    [
      "corrupt_state",
      "unsupported_ledger",
      "missing_checkpoint",
      "interrupted_resumable",
      "failed_retryable",
      "failed_terminal",
      "policy_drift",
      "uncertain_external_action",
    ].includes(snapshot.classification)
  ) {
    return "blocked";
  }
  return snapshot.classification === "not_initialized" ? "noop" : "ok";
}

function resultFromSnapshot(
  command: OperatorCommand,
  snapshot: OperatorStateSnapshot,
  generatedAt: string,
  overrides: Partial<
    Pick<
      OperatorResult,
      | "outcome"
      | "classification"
      | "freshness"
      | "failure"
      | "nextSafeAction"
      | "externalActionStatus"
    >
  > = {},
): OperatorResult {
  return operatorResult({
    command,
    generatedAt,
    outcome: overrides.outcome ?? outcomeForSnapshot(snapshot),
    classification: overrides.classification ?? snapshot.classification,
    run: snapshot.run,
    persistence: snapshot.persistence,
    freshness: overrides.freshness ?? UNCHECKED_FRESHNESS,
    reviews: { count: snapshot.reviews.length, items: snapshot.reviews },
    failure: overrides.failure === undefined ? snapshot.failure : overrides.failure,
    externalActionStatus:
      overrides.externalActionStatus ??
      (snapshot.classification === "uncertain_external_action"
        ? "unknown"
        : "not_executed"),
    nextSafeAction: overrides.nextSafeAction ?? snapshot.nextSafeAction,
  });
}

function failureResult(input: {
  command: OperatorCommand;
  generatedAt: string;
  classification: OperatorClassification;
  failure: OperatorFailure;
  nextSafeAction: string;
  freshness?: OperatorFreshnessSummary;
  snapshot?: OperatorStateSnapshot;
}): OperatorResult {
  const snapshot = input.snapshot;
  return operatorResult({
    command: input.command,
    generatedAt: input.generatedAt,
    outcome: "blocked",
    classification: input.classification,
    run: snapshot?.run ?? null,
    persistence: snapshot?.persistence ?? EMPTY_OPERATOR_PERSISTENCE,
    freshness: input.freshness ?? UNCHECKED_FRESHNESS,
    reviews: {
      count: snapshot?.reviews.length ?? 0,
      items: snapshot?.reviews ?? [],
    },
    failure: input.failure,
    externalActionStatus: "not_executed",
    nextSafeAction: input.nextSafeAction,
  });
}

function readOnlyExecution(
  args: ParsedOperatorArguments,
  snapshot: OperatorStateSnapshot,
  generatedAt: string,
): CommandExecution {
  if (snapshot.classification === "uncertain_external_action") {
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: "ok",
      }),
      exitCode: 0,
    };
  }
  if (args.command === "doctor") {
    const unhealthy = [
      "unsupported_ledger",
      "corrupt_state",
      "missing_checkpoint",
    ].includes(snapshot.classification);
    const exitCode: OperatorExitCode =
      snapshot.classification === "unsupported_ledger"
        ? 21
        : unhealthy
          ? 22
          : 0;
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: unhealthy ? "blocked" : "ok",
        nextSafeAction: unhealthy
          ? snapshot.nextSafeAction
          : "Local operator state and supported SQLite contracts passed read-only inspection.",
      }),
      exitCode,
    };
  }
  if (args.command === "reviews") {
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: snapshot.reviews.length > 0 ? "ok" : "noop",
        nextSafeAction:
          snapshot.reviews.length > 0
            ? "Inspect the summarized package hashes and expiry. Approval and execution remain outside this operator."
            : args.reviewId
              ? "No pending local review matches that exact review ID. Re-run reviews without a selector to inspect summaries."
              : "No local review packages are currently queued.",
      }),
      exitCode: 0,
    };
  }
  if (args.command === "explain-failure") {
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: snapshot.failure ? "ok" : "noop",
        nextSafeAction: snapshot.failure
          ? snapshot.nextSafeAction
          : "No redacted ledger failure is available to explain.",
      }),
      exitCode: 0,
    };
  }
  return {
    result: resultFromSnapshot(args.command, snapshot, generatedAt),
    exitCode: 0,
  };
}

async function hasConfiguredApiKey(): Promise<boolean> {
  if (typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0) {
    return true;
  }
  try {
    const content = await readFile(join(repositoryRoot, ".env.local"), "utf8");
    return /^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(?:"[^"]+"|'[^']+'|[^\s#]+)\s*(?:#.*)?$/mu.test(
      content,
    );
  } catch {
    return false;
  }
}

async function operatorLockHealth(stateRoot: string): Promise<{
  state: "absent" | "available" | "active" | "invalid";
  message: string | null;
}> {
  const path = join(stateRoot, "operator-lock.sqlite");
  let database: DatabaseSync | undefined;
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return {
        state: "invalid",
        message: "Graph execution lock database is not a regular file.",
      };
    }
    database = new DatabaseSync(path);
    database.exec("PRAGMA busy_timeout = 0");
    try {
      database.exec("BEGIN IMMEDIATE");
      database.exec("ROLLBACK");
      return { state: "available", message: null };
    } catch (error) {
      if (
        (error as { code?: unknown }).code === "SQLITE_BUSY" ||
        /database is locked/iu.test(String(error))
      ) {
        return {
          state: "active",
          message: "A graph child currently owns the OS-released execution lock.",
        };
      }
      return {
        state: "invalid",
        message: "Graph execution lock integrity could not be verified.",
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { state: "absent", message: null };
    }
    return {
      state: "invalid",
      message: "Graph execution lock database could not be inspected.",
    };
  } finally {
    database?.close();
  }
}

function hasRecoverablePrecheckpointOwner(
  snapshot: OperatorStateSnapshot,
): boolean {
  if (
    snapshot.classification !== "missing_checkpoint" ||
    snapshot.incompleteRuns.length !== 1
  ) {
    return false;
  }
  const run = snapshot.incompleteRuns[0]!;
  return (
    !run.transactionId &&
    !run.checkpointPresent &&
    run.runId === deterministicOperatorRunId(run.idempotencyKey)
  );
}

function invariantBeforeLock(
  snapshot: OperatorStateSnapshot,
): OperatorExitCode | null {
  if (
    snapshot.classification === "missing_checkpoint" &&
    hasRecoverablePrecheckpointOwner(snapshot)
  ) {
    return null;
  }
  return invariantExit(snapshot);
}

function lockExecution(input: {
  command: OperatorCommand;
  snapshot: OperatorStateSnapshot;
  generatedAt: string;
  lock: Awaited<ReturnType<typeof operatorLockHealth>>;
  readOnly: boolean;
}): CommandExecution | null {
  if (input.lock.state === "active") {
    return {
      result: resultFromSnapshot(
        input.command,
        input.snapshot,
        input.generatedAt,
        {
          outcome: input.readOnly ? "ok" : "blocked",
          classification: "running",
          failure: {
            category: "single_flight_busy",
            node: null,
            retryable: true,
            fingerprint: null,
            message:
              input.lock.message ??
              "A graph child currently owns the OS-released execution lock.",
          },
          nextSafeAction:
            "Wait for the current graph child to finish, then inspect status before retrying.",
        },
      ),
      exitCode: input.readOnly ? 0 : 10,
    };
  }
  if (input.lock.state === "invalid") {
    return {
      result: resultFromSnapshot(
        input.command,
        input.snapshot,
        input.generatedAt,
        {
          outcome: "blocked",
          classification: "corrupt_state",
          failure: {
            category: "operator_lock_invalid",
            node: null,
            retryable: false,
            fingerprint: null,
            message:
              input.lock.message ??
              "The graph execution lock database failed integrity inspection.",
          },
          nextSafeAction:
            "Inspect the private operator lock database; do not start another graph child.",
        },
      ),
      exitCode: input.readOnly ? 0 : 22,
    };
  }
  return null;
}

async function writableDirectoryOrAncestor(path: string): Promise<boolean> {
  let current = resolve(path);
  for (;;) {
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
      await access(current, fsConstants.W_OK | fsConstants.X_OK);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
      const parent = dirname(current);
      if (parent === current) return false;
      current = parent;
    }
  }
}

async function writableOutputPath(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) return false;
    await access(path, fsConstants.W_OK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
  }
  return writableDirectoryOrAncestor(dirname(path));
}

async function readableEvidenceDirectory(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
    await access(path, fsConstants.R_OK | fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function doctorExecution(
  args: ParsedOperatorArguments,
  snapshot: OperatorStateSnapshot,
  generatedAt: string,
): Promise<CommandExecution> {
  const stateInvariant = invariantBeforeLock(snapshot);
  if (stateInvariant) {
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: "blocked",
      }),
      exitCode: stateInvariant,
    };
  }
  const nodeParts = process.versions.node.split(".").map(Number);
  const compatibleNode =
    (nodeParts[0] ?? 0) > 22 ||
    ((nodeParts[0] ?? 0) === 22 && (nodeParts[1] ?? 0) >= 5);
  let pathsAccessible = true;
  try {
    await access(packageRoot, fsConstants.R_OK);
    pathsAccessible =
      (await writableDirectoryOrAncestor(args.stateRoot)) &&
      (await writableOutputPath(args.projectStatePath)) &&
      (await readableEvidenceDirectory(args.evidenceRoot));
  } catch {
    pathsAccessible = false;
  }
  const keyPresent = await hasConfiguredApiKey();
  const lock = await operatorLockHealth(args.stateRoot);
  const lockHealthy = lock.state === "absent" || lock.state === "available";
  if (!compatibleNode || !pathsAccessible || !keyPresent || !lockHealthy) {
    const category = !compatibleNode
      ? "node_runtime_incompatible"
      : !pathsAccessible
        ? "operator_path_access_failed"
        : !keyPresent
          ? "api_key_configuration_missing"
          : lock.state === "active"
            ? "operator_lock_busy"
            : "operator_lock_invalid";
    const exitCode: OperatorExitCode =
      category === "api_key_configuration_missing" ? 20 :
      category === "operator_lock_busy" ? 10 : 22;
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification:
          category === "operator_lock_busy" ? "running" : "failed_terminal",
        failure: {
          category,
          node: null,
          retryable: category === "operator_lock_busy",
          fingerprint: null,
          message:
            lock.message ??
            (!keyPresent
              ? "Local OpenAI API-key configuration was not detected; no value was loaded or printed."
              : "Operator runtime prerequisites failed read-only inspection."),
        },
        nextSafeAction:
          category === "api_key_configuration_missing"
            ? "Restore the existing ignored .env.local API-key entry before a model-backed run."
            : "Repair the named local runtime prerequisite before executing the graph.",
        snapshot,
      }),
      exitCode,
    };
  }
  return {
    result: resultFromSnapshot(args.command, snapshot, generatedAt, {
      outcome: "ok",
      nextSafeAction:
        "Node, path access, API-key presence, lock state, ledger, and checkpoint contracts passed read-only inspection.",
    }),
    exitCode: 0,
  };
}

function validateCommandOptions(args: ParsedOperatorArguments): void {
  const readOnly = ["status", "reviews", "explain-failure", "doctor"].includes(
    args.command,
  );
  if (
    readOnly &&
    (args.capturePath ||
      args.slot ||
      args.expectedSha256 ||
      args.allowSyntheticEvidence ||
      args.syntheticRunAt)
  ) {
    throw new OperatorArgumentError(
      `${args.command} does not accept capture, slot, or synthetic execution options.`,
    );
  }
  if (
    args.runId &&
    !["resume", "status", "explain-failure"].includes(args.command)
  ) {
    throw new OperatorArgumentError(
      "--run-id is accepted only by resume, status, or explain-failure",
    );
  }
  if (args.reviewId && args.command !== "reviews") {
    throw new OperatorArgumentError("--review-id is accepted only by reviews");
  }
  if (args.command === "resume") {
    if (!args.runId) throw new OperatorArgumentError("resume requires --run-id");
    if (
      args.capturePath ||
      args.slot ||
      args.expectedSha256
    ) {
      throw new OperatorArgumentError(
        "resume accepts only the exact run ID, state paths, matching evidence root, and recorded synthetic manifest flags.",
      );
    }
  }
  if (args.command === "catch-up" && !args.slot) {
    throw new OperatorArgumentError("catch-up requires --slot");
  }
  if (args.command !== "catch-up" && args.slot) {
    throw new OperatorArgumentError("--slot is accepted only by catch-up");
  }
  if (args.syntheticRunAt && !args.allowSyntheticEvidence) {
    throw new OperatorArgumentError(
      "--run-at requires --allow-synthetic-evidence",
    );
  }
}

function ensureCatchUpSlot(slot: string, actualNow: string): string {
  const normalized = normalizeCatchUpSlot(slot);
  if (Date.parse(normalized) > Date.parse(actualNow)) {
    throw new OperatorGateError("catch-up slot cannot be in the future");
  }
  if (Date.parse(actualNow) - Date.parse(normalized) > 26 * 60 * 60 * 1_000) {
    throw new OperatorGateError(
      "catch-up slot is older than the latest useful 26-hour recovery horizon",
    );
  }
  const slotDate = projectCalendarDate(normalized);
  if (!projectDateIsWithinWindow(slotDate, PROJECT_OBJECTIVE_WINDOW)) {
    throw new OperatorGateError(
      "catch-up slot falls outside the Code the Future objective window",
    );
  }
  return normalized;
}

function exactPrecheckpointRecoveryKey(
  args: ParsedOperatorArguments,
  run: OperatorStateSnapshot["runs"][number],
  captureSha256: string,
): string | null {
  if (
    run.transactionId ||
    run.checkpointPresent ||
    run.captureBundleHash !== captureSha256 ||
    run.runId !== deterministicOperatorRunId(run.idempotencyKey)
  ) {
    return null;
  }
  if (args.command === "catch-up") {
    const expected = scheduledIdempotencyKey(args.slot!);
    return run.triggerKind === "scheduled" && run.idempotencyKey === expected
      ? expected
      : null;
  }
  if (args.command === "run-now") {
    const expected = manualIdempotencyKey(captureSha256, run.startedAt);
    return run.triggerKind === "manual" && run.idempotencyKey === expected
      ? expected
      : null;
  }
  return null;
}

async function assessCapture(
  args: ParsedOperatorArguments,
  actualNow: string,
): Promise<CaptureAssessment> {
  if (!args.capturePath) {
    throw new Error("A fresh immutable --capture is required");
  }
  return assessCaptureForOperator({
    capturePath: args.capturePath,
    evidenceRoot: args.evidenceRoot,
    ...(args.expectedSha256 ? { expectedSha256: args.expectedSha256 } : {}),
    allowSyntheticEvidence: args.allowSyntheticEvidence,
    ...(args.syntheticRunAt ? { syntheticRunAt: args.syntheticRunAt } : {}),
    now: actualNow,
  });
}

async function runGraphProcess(args: string[]): Promise<GraphProcessResult> {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(
      process.execPath,
      [
        "--env-file-if-exists=../../.env.local",
        "--import",
        "tsx/esm",
        "src/cli.ts",
        ...args,
      ],
      {
        cwd: packageRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-1_000_000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-1_000_000);
    });
    const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
    const handlers = new Map<NodeJS.Signals, () => void>();
    for (const signal of forwardedSignals) {
      const handler = (): void => {
        child.kill(signal);
      };
      handlers.set(signal, handler);
      process.once(signal, handler);
    }
    const cleanup = (): void => {
      for (const [signal, handler] of handlers) {
        process.removeListener(signal, handler);
      }
    };
    child.once("error", (error) => {
      cleanup();
      rejectProcess(error);
    });
    child.once("close", (code) => {
      cleanup();
      resolveProcess({ code: code ?? 70, stdout, stderr });
    });
  });
}

function graphArguments(input: {
  args: ParsedOperatorArguments;
  assessment?: CaptureAssessment;
  idempotencyKey?: string;
  triggerKind?: "manual" | "scheduled";
  resumeRunId?: string;
  newRunId?: string;
  newRunStartedAt?: string;
}): string[] {
  const output = [
    "--state-root",
    input.args.stateRoot,
    "--project-state",
    input.args.projectStatePath,
    "--evidence-root",
    input.args.evidenceRoot,
  ];
  if (input.resumeRunId) {
    output.push("--resume", input.resumeRunId);
    if (input.args.allowSyntheticEvidence) {
      output.push("--allow-synthetic-evidence");
    }
    if (input.args.syntheticRunAt) {
      output.push("--run-at", input.args.syntheticRunAt);
    }
    return output;
  }
  if (!input.assessment || !input.idempotencyKey || !input.triggerKind) {
    throw new Error("New graph execution is missing its immutable trigger inputs");
  }
  if (!input.newRunId || !input.newRunStartedAt) {
    throw new Error(
      "New graph execution is missing its deterministic run ID or started-at binding",
    );
  }
  output.push(
    "--capture",
    input.assessment.capturePath,
    "--sha",
    input.assessment.captureSha256,
    "--idempotency-key",
    input.idempotencyKey,
    "--trigger-kind",
    input.triggerKind,
    "--run-id",
    input.newRunId,
    "--started-at",
    input.newRunStartedAt,
  );
  if (input.triggerKind === "scheduled") {
    if (!input.args.slot) throw new Error("Scheduled execution is missing its slot");
    output.push("--trigger-ref", input.args.slot);
  }
  if (input.args.allowSyntheticEvidence) output.push("--allow-synthetic-evidence");
  if (input.args.syntheticRunAt) output.push("--run-at", input.args.syntheticRunAt);
  return output;
}

function commandFailureFromProcess(
  processResult: GraphProcessResult,
  snapshot: OperatorStateSnapshot,
): {
  classification: OperatorClassification;
  exitCode: OperatorExitCode;
  failure: OperatorFailure;
  nextSafeAction: string;
} {
  const safeCombined = safeText(
    `${processResult.stderr}\n${processResult.stdout}`,
  );
  if (/Graph execution lock is busy|database is locked/iu.test(safeCombined)) {
    return {
      classification: "running",
      exitCode: 10,
      failure: {
        category: "single_flight_busy",
        node: null,
        retryable: true,
        fingerprint: null,
        message: "Another graph child owns the OS-released local execution lock.",
      },
      nextSafeAction:
        "Wait for the current graph child to finish, then inspect status before retrying.",
    };
  }
  if (/manifest differs|cannot resume: current policy/iu.test(safeCombined)) {
    return {
      classification: "policy_drift",
      exitCode: 21,
      failure: {
        category: "policy_runtime_drift",
        node: "preflight",
        retryable: false,
        fingerprint: snapshot.failure?.fingerprint ?? null,
        message:
          "The current policy, model, tool, source, or evidence-root manifest differs from the checkpoint.",
      },
      nextSafeAction:
        "Restore the exact recorded runtime boundary or inspect and close the interrupted run manually; do not bypass the manifest.",
    };
  }
  if (/OPENAI_API_KEY is required/iu.test(safeCombined)) {
    return {
      classification: "failed_terminal",
      exitCode: 20,
      failure: {
        category: "configuration_required",
        node: "preflight",
        retryable: false,
        fingerprint: null,
        message: "The bounded model nodes require the configured local OpenAI API key.",
      },
      nextSafeAction:
        "Restore the existing ignored local API-key configuration, then retry the same exact command.",
    };
  }
  if (snapshot.classification === "interrupted_resumable") {
    const retryable = snapshot.failure?.retryable ?? true;
    return {
      classification: retryable ? "failed_retryable" : "failed_terminal",
      exitCode: retryable ? 30 : 31,
      failure:
        snapshot.failure ?? {
          category: "execution_interrupted",
          node: null,
          retryable,
          fingerprint: null,
          message: "The graph stopped with an exact checkpoint available.",
        },
      nextSafeAction: retryable
        ? snapshot.nextSafeAction
        : "Repair the permanent input or policy defect; do not blindly resume or repeat an action.",
    };
  }
  if (
    snapshot.classification === "missing_checkpoint" ||
    snapshot.classification === "corrupt_state"
  ) {
    return {
      classification: snapshot.classification,
      exitCode: 22,
      failure:
        snapshot.failure ?? {
          category: "state_invariant_failed",
          node: null,
          retryable: false,
          fingerprint: null,
          message: "Local graph state failed its recovery invariant.",
        },
      nextSafeAction: snapshot.nextSafeAction,
    };
  }
  return {
    classification: "failed_terminal",
    exitCode: 31,
    failure: {
      category: "execution_failed",
      node: snapshot.failure?.node ?? null,
      retryable: false,
      fingerprint: snapshot.failure?.fingerprint ?? null,
      message:
        snapshot.failure?.message ??
        "The graph command failed without a safe resumable checkpoint.",
    },
    nextSafeAction:
      "Inspect the redacted local failure and repair the exact input; no external action was executed.",
  };
}

async function invokeGraph(input: {
  args: ParsedOperatorArguments;
  generatedAt: string;
  assessment?: CaptureAssessment;
  idempotencyKey?: string;
  triggerKind?: "manual" | "scheduled";
  resumeRunId?: string;
  newRunId?: string;
  newRunStartedAt?: string;
}): Promise<CommandExecution> {
  const processResult = await runGraphProcess(
      graphArguments({
        args: input.args,
        ...(input.assessment ? { assessment: input.assessment } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.triggerKind ? { triggerKind: input.triggerKind } : {}),
        ...(input.resumeRunId ? { resumeRunId: input.resumeRunId } : {}),
        ...(input.newRunId ? { newRunId: input.newRunId } : {}),
        ...(input.newRunStartedAt
          ? { newRunStartedAt: input.newRunStartedAt }
          : {}),
      }),
    );
    const snapshot = await inspectOperatorState({
      stateRoot: input.args.stateRoot,
      now: new Date().toISOString(),
    });
    if (snapshot.classification === "uncertain_external_action") {
      return {
        result: resultFromSnapshot(
          input.args.command,
          snapshot,
          input.generatedAt,
          {
            outcome: "blocked",
            freshness: input.assessment?.freshness ?? UNCHECKED_FRESHNESS,
          },
        ),
        exitCode: 20,
      };
    }
    if (processResult.code === 0) {
      // State inspection deliberately surfaces any incomplete run before the
      // chronologically latest row. Keep that global invariant check, but once
      // the ledger is coherent report the exact run this invocation addressed.
      // Otherwise resuming an older interrupted run could incorrectly return a
      // later, already-finalized run from the same ledger.
      if (snapshot.classification === "interrupted_resumable") {
        return {
          result: resultFromSnapshot(input.args.command, snapshot, input.generatedAt, {
            outcome: "blocked",
            freshness: input.assessment?.freshness ?? UNCHECKED_FRESHNESS,
          }),
          exitCode: 30,
        };
      }
      if (
        snapshot.classification === "corrupt_state" ||
        snapshot.classification === "missing_checkpoint" ||
        snapshot.classification === "unsupported_ledger"
      ) {
        return {
          result: resultFromSnapshot(input.args.command, snapshot, input.generatedAt, {
            outcome: "blocked",
            freshness: input.assessment?.freshness ?? UNCHECKED_FRESHNESS,
          }),
          exitCode:
            snapshot.classification === "unsupported_ledger" ? 21 : 22,
        };
      }
      const targetRunId =
        input.resumeRunId ??
        (input.idempotencyKey
          ? findRunByIdempotencyKey(snapshot, input.idempotencyKey)?.runId
          : undefined);
      if (!targetRunId || !snapshot.runs.some((run) => run.runId === targetRunId)) {
        return {
          result: failureResult({
            command: input.args.command,
            generatedAt: input.generatedAt,
            classification: "corrupt_state",
            failure: {
              category: "execution_result_missing",
              node: "finalize",
              retryable: false,
              fingerprint: null,
              message:
                "The graph process exited successfully but its exact ledger run is missing.",
            },
            nextSafeAction:
              "Inspect the ledger and checkpoint files manually; do not create or replay a replacement run.",
            freshness: input.assessment?.freshness ?? UNCHECKED_FRESHNESS,
            snapshot,
          }),
          exitCode: 22,
        };
      }
      const targetSnapshot = focusSnapshotOnRun(snapshot, targetRunId);
      if (targetSnapshot.classification === "failed_terminal") {
        return {
          result: resultFromSnapshot(
            input.args.command,
            targetSnapshot,
            input.generatedAt,
            {
              outcome: "failed",
              freshness: input.assessment?.freshness ?? UNCHECKED_FRESHNESS,
            },
          ),
          exitCode: 31,
        };
      }
      return {
        result: resultFromSnapshot(
          input.args.command,
          targetSnapshot,
          input.generatedAt,
          {
            outcome: "ok",
            freshness: input.assessment?.freshness ?? UNCHECKED_FRESHNESS,
          },
        ),
        exitCode: 0,
      };
    }
    const classified = commandFailureFromProcess(processResult, snapshot);
    return {
      result: resultFromSnapshot(input.args.command, snapshot, input.generatedAt, {
        outcome: classified.exitCode === 10 ? "blocked" : "failed",
        classification: classified.classification,
        freshness: input.assessment?.freshness ?? UNCHECKED_FRESHNESS,
        failure: classified.failure,
        nextSafeAction: classified.nextSafeAction,
      }),
      exitCode: classified.exitCode,
    };
}

function invariantExit(snapshot: OperatorStateSnapshot): OperatorExitCode | null {
  if (snapshot.classification === "uncertain_external_action") return 20;
  if (snapshot.classification === "unsupported_ledger") return 21;
  if (
    snapshot.classification === "corrupt_state" ||
    snapshot.classification === "missing_checkpoint"
  ) {
    return 22;
  }
  return null;
}

async function executeResume(
  args: ParsedOperatorArguments,
  snapshot: OperatorStateSnapshot,
  generatedAt: string,
  runId: string,
): Promise<CommandExecution> {
  const invariant = invariantExit(snapshot);
  if (invariant) {
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: "blocked",
      }),
      exitCode: invariant,
    };
  }
  const run = snapshot.runs.find((candidate) => candidate.runId === runId);
  if (!run) {
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "failed_terminal",
        failure: {
          category: "unknown_run",
          node: null,
          retryable: false,
          fingerprint: null,
          message: "The requested exact run ID is not present in the canonical ledger.",
        },
        nextSafeAction: "Run status and copy the exact interrupted run ID.",
        snapshot,
      }),
      exitCode: 20,
    };
  }
  if (run.finalized) {
    const focused = focusSnapshotOnRun(snapshot, runId);
    return {
      result: resultFromSnapshot(args.command, focused, generatedAt, {
        outcome: "noop",
        nextSafeAction:
          "The exact run is already finalized. Inspect its result or reviews; do not replay it.",
      }),
      exitCode: 0,
    };
  }
  if (
    snapshot.incompleteRuns.length !== 1 ||
    snapshot.incompleteRuns[0]?.runId !== runId ||
    snapshot.persistence.checkpoint !== "present"
  ) {
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "missing_checkpoint",
        failure: {
          category: "resume_invariant_failed",
          node: null,
          retryable: false,
          fingerprint: null,
          message: "The requested run is not the single checkpointed interrupted run.",
        },
        nextSafeAction:
          "Inspect canonical ledger and checkpoint state manually; do not select or create a replacement run.",
        snapshot,
      }),
      exitCode: 22,
    };
  }
  if (snapshot.failure && !snapshot.failure.retryable && !run.transactionId) {
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "failed_terminal",
        failure: snapshot.failure,
        nextSafeAction:
          "Repair the permanent capture or policy defect and start a new immutable run; do not resume it blindly.",
        snapshot,
      }),
      exitCode: 31,
    };
  }
  return invokeGraph({ args, generatedAt, resumeRunId: runId });
}

async function executeMutatingCommand(
  args: ParsedOperatorArguments,
  snapshot: OperatorStateSnapshot,
  generatedAt: string,
): Promise<CommandExecution> {
  if (snapshot.classification === "uncertain_external_action") {
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: "blocked",
      }),
      exitCode: 20,
    };
  }
  if (args.command === "resume") {
    return executeResume(args, snapshot, generatedAt, args.runId!);
  }
  if (args.command === "catch-up") {
    try {
      args.slot = ensureCatchUpSlot(args.slot!, generatedAt);
    } catch (error) {
      if (!(error instanceof OperatorGateError)) throw error;
      return {
        result: failureResult({
          command: args.command,
          generatedAt,
          classification: "recapture_required",
          failure: {
            category: "catch_up_window_ineligible",
            node: "trigger",
            retryable: false,
            fingerprint: null,
            message: error.message,
          },
          nextSafeAction:
            "Use only the latest eligible missed slot. Do not batch, backdate, or extend the objective window.",
          snapshot,
        }),
        exitCode: 20,
      };
    }
  }

  const precheckpointOwnedRun =
    snapshot.classification === "missing_checkpoint" &&
    snapshot.incompleteRuns.length === 1 &&
    !snapshot.incompleteRuns[0]!.transactionId &&
    !snapshot.incompleteRuns[0]!.checkpointPresent
      ? snapshot.incompleteRuns[0]!
      : null;
  const invariant = invariantExit(snapshot);
  if (invariant && !precheckpointOwnedRun) {
    return {
      result: resultFromSnapshot(args.command, snapshot, generatedAt, {
        outcome: "blocked",
      }),
      exitCode: invariant,
    };
  }
  if (snapshot.incompleteRuns.length === 1) {
    const interrupted = snapshot.incompleteRuns[0]!;
    if (
      !precheckpointOwnedRun &&
      snapshot.failure &&
      !snapshot.failure.retryable &&
      !interrupted.transactionId
    ) {
      return {
        result: resultFromSnapshot(args.command, snapshot, generatedAt, {
          outcome: "failed",
          classification: "failed_terminal",
          nextSafeAction:
            "Repair the permanent input or policy defect; this run is not resumable and must not be replayed blindly.",
        }),
        exitCode: 31,
      };
    }
    if (precheckpointOwnedRun) {
      // Continue through immutable capture preflight. Only the exact semantic
      // owner may re-enter raw trigger initialization with the same stable ID.
    } else if (
      args.command === "catch-up" &&
      interrupted.idempotencyKey === scheduledIdempotencyKey(args.slot!)
    ) {
      return executeResume(args, snapshot, generatedAt, interrupted.runId);
    } else {
      return {
        result: resultFromSnapshot(args.command, snapshot, generatedAt, {
          outcome: "blocked",
          classification: "interrupted_resumable",
          nextSafeAction: `Resume exact run ${interrupted.runId} before starting an unrelated cycle.`,
        }),
        exitCode: 20,
      };
    }
  }


  if (!args.capturePath) {
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "recapture_required",
        failure: {
          category: "capture_required",
          node: "capture_preflight",
          retryable: false,
          fingerprint: null,
          message: "A fresh immutable --capture is required.",
        },
        nextSafeAction:
          "Provide the current immutable capture bundle; this operator will not collect or fabricate evidence.",
        snapshot,
      }),
      exitCode: 20,
    };
  }
  try {
    const binding = await inspectCaptureBinding({
      capturePath: args.capturePath,
      evidenceRoot: args.evidenceRoot,
    });
    const bindingKey =
      (precheckpointOwnedRun
        ? exactPrecheckpointRecoveryKey(
            args,
            precheckpointOwnedRun,
            binding.captureSha256,
          )
        : null) ??
      (args.command === "catch-up"
        ? scheduledIdempotencyKey(args.slot!)
        : manualIdempotencyKey(
            binding.captureSha256,
            args.syntheticRunAt ?? generatedAt,
          ));
    const boundRun = findRunByIdempotencyKey(snapshot, bindingKey);
    if (boundRun) {
      if (boundRun.captureBundleHash !== binding.captureSha256) {
        return {
          result: failureResult({
            command: args.command,
            generatedAt,
            classification: "corrupt_state",
            failure: {
              category: "idempotency_capture_conflict",
              node: "trigger",
              retryable: false,
              fingerprint: null,
              message:
                "The exact trigger key is already bound to a different immutable capture hash.",
            },
            nextSafeAction:
              "Inspect the existing slot/run and capture attestation; do not invent a replacement key.",
            snapshot,
          }),
          exitCode: 22,
        };
      }
      if (boundRun.finalized) {
        const focused = focusSnapshotOnRun(snapshot, boundRun.runId);
        return {
          result: resultFromSnapshot(args.command, focused, generatedAt, {
            outcome: "noop",
            nextSafeAction:
              boundRun.terminalStatus === "awaiting_review"
                ? "This exact trigger is finalized and awaiting review. Inspect its package; do not replay it."
                : "This exact trigger is already finalized. No duplicate run or external action was created.",
          }),
          exitCode: 0,
        };
      }
      const exactPrecheckpointOwner =
        precheckpointOwnedRun?.runId === boundRun.runId &&
        exactPrecheckpointRecoveryKey(
          args,
          boundRun,
          binding.captureSha256,
        ) !== null;
      if (!exactPrecheckpointOwner) {
        return {
          result: resultFromSnapshot(args.command, snapshot, generatedAt, {
            outcome: "blocked",
            classification: "interrupted_resumable",
            nextSafeAction: `Resume exact run ${boundRun.runId}; never create a duplicate.`,
          }),
          exitCode: 20,
        };
      }
    }
  } catch (error) {
    const message = safeText(error instanceof Error ? error.message : String(error));
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "recapture_required",
        failure: {
          category: "capture_required",
          node: "capture_preflight",
          retryable: false,
          fingerprint: null,
          message,
        },
        nextSafeAction:
          "Provide a confined readable immutable capture bundle and retry.",
        freshness: {
          state: "invalid",
          capturedAt: null,
          maxAgeHours: null,
          reason: message,
        },
        snapshot,
      }),
      exitCode: 20,
    };
  }

  let assessment: CaptureAssessment;
  try {
    assessment = await assessCapture(args, generatedAt);
  } catch (error) {
    const message = safeText(
      error instanceof Error ? error.message : String(error),
    );
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "recapture_required",
        failure: {
          category: "capture_required",
          node: "capture_preflight",
          retryable: false,
          fingerprint: null,
          message,
        },
        nextSafeAction:
          "Prepare one current immutable capture bundle under the smallest approved evidence root; this operator will not collect or fabricate evidence.",
        freshness: {
          state: "invalid",
          capturedAt: null,
          maxAgeHours: null,
          reason: message,
        },
        snapshot,
      }),
      exitCode: 20,
    };
  }
  const recoveryKey = precheckpointOwnedRun
    ? exactPrecheckpointRecoveryKey(
        args,
        precheckpointOwnedRun,
        assessment.captureSha256,
      )
    : null;
  const idempotencyKey =
    recoveryKey ??
    (args.command === "catch-up"
      ? scheduledIdempotencyKey(args.slot!)
      : manualIdempotencyKey(
          assessment.captureSha256,
          assessment.logicalRunAt,
        ));
  const existing = findRunByIdempotencyKey(snapshot, idempotencyKey);
  if (existing) {
    if (existing.captureBundleHash !== assessment.captureSha256) {
      return {
        result: failureResult({
          command: args.command,
          generatedAt,
          classification: "corrupt_state",
          failure: {
            category: "idempotency_capture_conflict",
            node: "trigger",
            retryable: false,
            fingerprint: null,
            message:
              "The exact trigger key is already bound to a different immutable capture hash.",
          },
          nextSafeAction:
            "Inspect the existing slot/run and capture attestation; do not invent a replacement key.",
          freshness: assessment.freshness,
          snapshot,
        }),
        exitCode: 22,
      };
    }
    if (existing.finalized) {
      const focused = focusSnapshotOnRun(snapshot, existing.runId);
      return {
        result: resultFromSnapshot(args.command, focused, generatedAt, {
          outcome: "noop",
          freshness: assessment.freshness,
          nextSafeAction:
            existing.terminalStatus === "awaiting_review"
              ? "This exact trigger is finalized and awaiting review. Inspect its package; do not replay it."
              : "This exact trigger is already finalized. No duplicate run or external action was created.",
        }),
        exitCode: 0,
      };
    }
    if (
      precheckpointOwnedRun &&
      recoveryKey &&
      existing.runId === precheckpointOwnedRun.runId
    ) {
      if (assessment.freshness.state !== "fresh") {
        return {
          result: failureResult({
            command: args.command,
            generatedAt,
            classification: "recapture_required",
            failure: {
              category: "capture_required",
              node: "capture_preflight",
              retryable: false,
              fingerprint: null,
              message: assessment.freshness.reason ?? "Capture is not current.",
            },
            nextSafeAction:
              "Inspect the claimed pre-checkpoint run manually; never replace its semantic key with a fabricated capture.",
            freshness: assessment.freshness,
            snapshot,
          }),
          exitCode: 20,
        };
      }
      return invokeGraph({
        args,
        generatedAt,
        assessment,
        idempotencyKey,
        triggerKind: existing.triggerKind as "manual" | "scheduled",
        newRunId: existing.runId,
        newRunStartedAt: existing.startedAt,
      });
    }
    return executeResume(args, snapshot, generatedAt, existing.runId);
  }

  if (precheckpointOwnedRun) {
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "missing_checkpoint",
        failure: {
          category: "precheckpoint_binding_mismatch",
          node: "trigger",
          retryable: false,
          fingerprint: null,
          message:
            "The supplied trigger and capture do not exactly match the deterministic pre-checkpoint ledger owner.",
        },
        nextSafeAction:
          "Inspect the exact claimed run manually; do not create a replacement run or bypass its semantic key.",
        freshness: assessment.freshness,
        snapshot,
      }),
      exitCode: 22,
    };
  }

  if (assessment.freshness.state !== "fresh") {
    return {
      result: failureResult({
        command: args.command,
        generatedAt,
        classification: "recapture_required",
        failure: {
          category: "capture_required",
          node: "capture_preflight",
          retryable: false,
          fingerprint: null,
          message: assessment.freshness.reason ?? "Capture is not current.",
        },
        nextSafeAction:
          "Recapture the named stale or missing lanes at actual execution time, then retry with the new immutable bundle.",
        freshness: assessment.freshness,
        snapshot,
      }),
      exitCode: 20,
    };
  }

  return invokeGraph({
    args,
    generatedAt,
    assessment,
    idempotencyKey,
    triggerKind: args.command === "catch-up" ? "scheduled" : "manual",
    newRunId: deterministicOperatorRunId(idempotencyKey),
    newRunStartedAt: assessment.logicalRunAt,
  });
}

export async function executeOperatorCommand(
  args: ParsedOperatorArguments,
  generatedAt = new Date().toISOString(),
): Promise<CommandExecution> {
  const exactNow = IsoInstantSchema.parse(generatedAt);
  validateCommandOptions(args);
  if (args.help) {
    const snapshot = await inspectOperatorState({
      stateRoot: args.stateRoot,
      now: exactNow,
    });
    return {
      result: resultFromSnapshot(args.command, snapshot, exactNow, {
        outcome: "noop",
        nextSafeAction: usage(),
      }),
      exitCode: 0,
    };
  }
  let snapshot = await inspectOperatorState({
    stateRoot: args.stateRoot,
    now: exactNow,
    ...(args.command === "reviews" && args.reviewId
      ? {
          reviewId: args.reviewId,
          includeExactReviewPayload: true,
        }
      : {}),
  });
  const stateInvariant = invariantBeforeLock(snapshot);
  const shouldInspectLock =
    args.command === "status" ||
    args.command === "doctor" ||
    args.command === "run-now" ||
    args.command === "catch-up" ||
    args.command === "resume";
  if (shouldInspectLock && stateInvariant === null) {
    const lock = await operatorLockHealth(args.stateRoot);
    const lockResult = lockExecution({
      command: args.command,
      snapshot,
      generatedAt: exactNow,
      lock,
      readOnly: args.command === "status",
    });
    if (lockResult) return lockResult;
  }
  if (["status", "reviews", "explain-failure", "doctor"].includes(args.command)) {
    if (
      args.runId &&
      (args.command === "status" || args.command === "explain-failure") &&
      invariantExit(snapshot) === null
    ) {
      if (!snapshot.runs.some((run) => run.runId === args.runId)) {
        return {
          result: operatorResult({
            command: args.command,
            generatedAt: exactNow,
            outcome: "noop",
            classification: "failed_terminal",
            run: null,
            persistence: snapshot.persistence,
            freshness: UNCHECKED_FRESHNESS,
            reviews: { count: snapshot.reviews.length, items: snapshot.reviews },
            failure: {
              category: "unknown_run",
              node: null,
              retryable: false,
              fingerprint: null,
              message: "The requested exact run ID is not present in the canonical ledger.",
            },
            externalActionStatus: "not_executed",
            nextSafeAction:
              "Run status without a selector and copy an exact canonical run ID.",
          }),
          exitCode: 0,
        };
      }
      snapshot = focusSnapshotOnRun(snapshot, args.runId);
    }
    if (args.command === "doctor") {
      return doctorExecution(args, snapshot, exactNow);
    }
    return readOnlyExecution(args, snapshot, exactNow);
  }
  return executeMutatingCommand(args, snapshot, exactNow);
}

function argumentFailure(
  error: unknown,
  generatedAt: string,
  command: OperatorCommand = "status",
): CommandExecution {
  const message = safeText(
    error instanceof Error ? error.message : String(error),
  );
  return {
    result: failureResult({
      command,
      generatedAt,
      classification: "failed_terminal",
      failure: {
        category: "invalid_arguments",
        node: null,
        retryable: false,
        fingerprint: null,
        message,
      },
      nextSafeAction: usage(),
    }),
    exitCode: 2,
  };
}

function isArgumentFailure(error: unknown): boolean {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  return (
    error instanceof OperatorArgumentError ||
    code.startsWith("ERR_PARSE_ARGS") ||
    (error instanceof Error && error.name === "ZodError")
  );
}

function internalFailure(
  error: unknown,
  generatedAt: string,
  command: OperatorCommand,
): CommandExecution {
  const message = safeText(error instanceof Error ? error.message : String(error));
  return {
    result: failureResult({
      command,
      generatedAt,
      classification: "failed_terminal",
      failure: {
        category: "operator_internal_failure",
        node: null,
        retryable: false,
        fingerprint: null,
        message,
      },
      nextSafeAction:
        "Inspect the local operator implementation and state. No graph run or external action should be inferred.",
    }),
    exitCode: 70,
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const generatedAt = new Date().toISOString();
  let parsed: ParsedOperatorArguments | undefined;
  let execution: CommandExecution;
  try {
    parsed = parseOperatorArguments(args);
    execution = await executeOperatorCommand(parsed, generatedAt);
  } catch (error) {
    execution = isArgumentFailure(error)
      ? argumentFailure(error, generatedAt, parsed?.command)
      : internalFailure(error, generatedAt, parsed?.command ?? "status");
  }
  process.stdout.write(
    `${JSON.stringify(execution.result, null, parsed?.compactJson ? 0 : 2)}\n`,
  );
  process.exitCode = execution.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    const generatedAt = new Date().toISOString();
    const execution = internalFailure(error, generatedAt, "status");
    process.stdout.write(`${JSON.stringify(execution.result)}\n`);
    process.exitCode = 70;
  });
}
