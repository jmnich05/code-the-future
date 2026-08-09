import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ArtifactConflictError,
  ArtifactPolicyError,
  intakeCaptureBundle,
  sha256Bytes,
  testOnlyReadBoundedFile,
  validateRealCaptureBundle,
} from "../src/artifacts.js";

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(packageRoot, "test", "fixtures");
const runAt = "2026-08-09T15:00:00-04:00";

type JsonRecord = Record<string, any>;

async function listTree(root: string, directory = root): Promise<string[]> {
  const paths: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    paths.push(relative(root, path));
    if (entry.isDirectory()) paths.push(...(await listTree(root, path)));
  }
  return paths;
}

async function prepareRealCapture(
  root: string,
  mutateArtifact?: (artifact: JsonRecord) => void,
): Promise<{ bundlePath: string; bundleSha256: string }> {
  await mkdir(root, { recursive: true });
  for (const name of ["asset-instagram.txt", "asset-facebook.txt"]) {
    await copyFile(join(fixtures, name), join(root, name));
  }

  const bundle = JSON.parse(
    await readFile(join(fixtures, "capture-bundle.json"), "utf8"),
  ) as JsonRecord;
  bundle.bundle_id = "bundle:real:validator-test";
  for (const declaration of bundle.evidence as JsonRecord[]) {
    const artifactPath = join(fixtures, declaration.artifact_path as string);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as JsonRecord;
    const producerMode = artifact.source === "public_web" ? "public_web" : "read_only_export";
    const redactionStatus = artifact.source === "public_web" ? "public" : "redacted";
    artifact.producer.mode = producerMode;
    artifact.redaction_status = redactionStatus;
    if (artifact.source === "instagram_insights") {
      artifact.account_id = "codethefuturelouisville";
      artifact.data_state = "partial";
    } else if (artifact.source === "facebook_insights") {
      artifact.account_id = "61592857947154";
    } else if (
      artifact.source === "search_console" ||
      artifact.source === "site_inventory"
    ) {
      artifact.property_id = "https://codethefuture.net/";
      artifact.property_url = "https://codethefuture.net/";
    }
    mutateArtifact?.(artifact);

    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    await writeFile(join(root, declaration.artifact_path as string), artifactText);
    declaration.artifact_sha256 = sha256Bytes(artifactText);
    declaration.data_state = artifact.data_state;
    declaration.producer_mode = producerMode;
    declaration.redaction_status = redactionStatus;
    const sourceRun = (bundle.source_runs as JsonRecord[]).find(
      (run) => run.evidence_refs.includes(artifact.evidence_id),
    );
    assert.ok(sourceRun);
    sourceRun.account_or_property_id =
      artifact.lane === "organic_social"
        ? artifact.account_id
        : artifact.lane === "contact_discovery"
          ? artifact.account_or_collection_id
          : artifact.property_id;
    sourceRun.data_state = artifact.data_state;
    sourceRun.status =
      artifact.data_state === "complete" ? "verified_complete" : "verified_partial";
  }

  const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
  const bundlePath = join(root, "capture-bundle.json");
  await writeFile(bundlePath, bundleText);
  return { bundlePath, bundleSha256: sha256Bytes(bundleText) };
}

test("real-capture validation is deterministic and leaves the evidence tree unchanged", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await prepareRealCapture(root);
  const before = await listTree(root);

  const first = await validateRealCaptureBundle({
    captureBundlePath: capture.bundlePath,
    allowedEvidenceRoot: root,
    runAt,
    expectedCaptureSha256: capture.bundleSha256,
  });
  const second = await validateRealCaptureBundle({
    captureBundlePath: capture.bundlePath,
    allowedEvidenceRoot: root,
    runAt,
    expectedCaptureSha256: capture.bundleSha256,
  });

  assert.deepEqual(second, first);
  assert.deepEqual(await listTree(root), before);
  assert.equal(first.status, "valid");
  assert.equal(first.evidenceMode, "real");
  assert.equal(first.validationScope, "capture_preflight_only");
  assert.equal(first.countsTowardThreeRunGate, false);
  assert.equal(first.runtimeCompatible, true);
  assert.equal(first.metricDefinitionCompatibility, "current");
  assert.equal(first.sourceRunCount, 5);
  assert.equal(first.evidenceCount, 5);
  assert.equal(first.assetCount, 2);
  assert.equal(first.groupRulesArtifactCount, 0);
  assert.deepEqual(first.lanes, {
    organic_social: { sourceRunCount: 2, evidenceCount: 2 },
    contact_discovery: { sourceRunCount: 2, evidenceCount: 2 },
    search_console: { sourceRunCount: 1, evidenceCount: 1 },
  });
  assert.equal(first.modelCalled, false);
  assert.equal(first.graphStateModified, false);
  assert.equal(first.externalActionStatus, "not_executed");

  const intake = await intakeCaptureBundle({
    captureBundlePath: capture.bundlePath,
    allowedEvidenceRoot: root,
    runArtifactRoot: join(root, "runtime-intake"),
    runAt,
  });
  assert.equal(first.validationHash, intake.intakeHash);
});

test("mixed v1 and v1.1 evidence passes preflight without becoming a graph run", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-v11-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const artifactSpecs = [
    {
      fixture: "contact-public.json",
      output: "contact-public.json",
      producerMode: "public_web",
      redactionStatus: "public",
    },
    {
      fixture: "social-facebook-partial-v1.1.json",
      output: "social-facebook-partial-v1.1.json",
      producerMode: "read_only_export",
      redactionStatus: "redacted",
    },
    {
      fixture: "search-console-summary-v1.1.json",
      output: "search-console-summary-v1.1.json",
      producerMode: "read_only_export",
      redactionStatus: "redacted",
    },
    {
      fixture: "ga4-v1.1.json",
      output: "ga4-v1.1.json",
      producerMode: "read_only_export",
      redactionStatus: "redacted",
    },
  ] as const;
  const evidence: JsonRecord[] = [];
  const sourceRuns: JsonRecord[] = [];
  for (const [index, spec] of artifactSpecs.entries()) {
    const artifact = JSON.parse(
      await readFile(join(fixtures, spec.fixture), "utf8"),
    ) as JsonRecord;
    artifact.producer.mode = spec.producerMode;
    artifact.redaction_status = spec.redactionStatus;
    if (artifact.source === "facebook_insights") {
      artifact.account_id = "1211320332069277";
    }
    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    await writeFile(join(root, spec.output), artifactText);
    evidence.push({
      evidence_id: artifact.evidence_id,
      lane: artifact.lane,
      source: artifact.source,
      artifact_path: spec.output,
      artifact_sha256: sha256Bytes(artifactText),
      captured_at: artifact.captured_at,
      fresh_through: artifact.fresh_through,
      data_state: artifact.data_state,
      redaction_status: artifact.redaction_status,
      producer_mode: artifact.producer.mode,
    });
    const accountOrPropertyId =
      artifact.lane === "organic_social"
        ? artifact.account_id
        : artifact.lane === "contact_discovery"
          ? artifact.account_or_collection_id
          : artifact.property_id;
    sourceRuns.push({
      source_run_id: `source-run:mixed:${index + 1}`,
      lane: artifact.lane,
      source: artifact.source,
      account_or_property_id: accountOrPropertyId,
      status: artifact.data_state === "complete" ? "verified_complete" : "verified_partial",
      started_at: artifact.captured_at,
      completed_at: artifact.captured_at,
      fresh_through: artifact.fresh_through,
      data_state: artifact.data_state,
      records_captured:
        artifact.payload.records?.length ??
        artifact.payload.partial_post_observations?.length ??
        artifact.payload.events?.length ??
        artifact.payload.tables?.dates?.rows?.length ??
        0,
      evidence_refs: [artifact.evidence_id],
    });
  }
  const bundle = {
    schema_version: "code-the-future.growth-capture-bundle.v1",
    bundle_id: "bundle:real:mixed-v11-validator-test",
    created_at: "2026-08-08T16:00:00-04:00",
    objective_window: { start: "2026-08-08", end: "2026-10-06" },
    metric_definition_version: "ctf-growth-metrics-v1.1",
    source_runs: sourceRuns,
    evidence,
  };
  const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
  const bundlePath = join(root, "capture-bundle.json");
  await writeFile(bundlePath, bundleText);
  const before = await listTree(root);
  const result = await validateRealCaptureBundle({
    captureBundlePath: bundlePath,
    allowedEvidenceRoot: root,
    runAt,
    expectedCaptureSha256: sha256Bytes(bundleText),
  });
  assert.deepEqual(await listTree(root), before);
  assert.equal(result.status, "valid");
  assert.equal(result.evidenceCount, 4);
  assert.equal(result.assetCount, 0);
  assert.equal(result.countsTowardThreeRunGate, false);
  assert.equal(result.runtimeCompatible, true);
  assert.equal(result.metricDefinitionCompatibility, "current");
  assert.equal(result.modelCalled, false);
  assert.equal(result.graphStateModified, false);
  assert.equal(result.externalActionStatus, "not_executed");
});

test("known legacy metric definitions validate read-only but cannot enter runtime", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-legacy-metrics-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await prepareRealCapture(root);
  const bundle = JSON.parse(await readFile(capture.bundlePath, "utf8")) as JsonRecord;
  bundle.metric_definition_version = "ctf-growth-metrics-v1";
  const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
  await writeFile(capture.bundlePath, bundleText);

  const result = await validateRealCaptureBundle({
    captureBundlePath: capture.bundlePath,
    allowedEvidenceRoot: root,
    runAt,
    expectedCaptureSha256: sha256Bytes(bundleText),
  });
  assert.equal(result.status, "valid");
  assert.equal(result.runtimeCompatible, false);
  assert.equal(result.metricDefinitionCompatibility, "legacy_read_only");

  const before = await listTree(root);
  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: capture.bundlePath,
        allowedEvidenceRoot: root,
        runArtifactRoot: join(root, "runtime-intake-must-not-exist"),
        runAt,
      }),
    /Shadow runtime requires metric definition ctf-growth-metrics-v1\.1/u,
  );
  assert.deepEqual(await listTree(root), before);
});

test("arbitrary metric-definition identifiers fail schema validation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-unknown-metrics-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await prepareRealCapture(root);
  const bundle = JSON.parse(await readFile(capture.bundlePath, "utf8")) as JsonRecord;
  bundle.metric_definition_version = "ctf-growth-metrics-custom";
  const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
  await writeFile(capture.bundlePath, bundleText);

  await assert.rejects(
    () =>
      validateRealCaptureBundle({
        captureBundlePath: capture.bundlePath,
        allowedEvidenceRoot: root,
        runAt,
      }),
    /Invalid option/u,
  );
});

test("validator rejects synthetic, hash-mismatched, and privacy-unsafe captures without writes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-reject-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      validateRealCaptureBundle({
        captureBundlePath: join(fixtures, "capture-bundle.json"),
        allowedEvidenceRoot: fixtures,
        runAt,
      }),
    ArtifactPolicyError,
  );

  const hashRoot = join(root, "hash");
  const hashCapture = await prepareRealCapture(hashRoot);
  await writeFile(join(hashRoot, "search-console.json"), "{}\n");
  const hashTree = await listTree(hashRoot);
  await assert.rejects(
    () =>
      validateRealCaptureBundle({
        captureBundlePath: hashCapture.bundlePath,
        allowedEvidenceRoot: hashRoot,
        runAt,
      }),
    ArtifactConflictError,
  );
  assert.deepEqual(await listTree(hashRoot), hashTree);

  const privacyRoot = join(root, "privacy");
  const privacyCapture = await prepareRealCapture(privacyRoot, (artifact) => {
    if (artifact.lane === "contact_discovery" && artifact.source === "public_web") {
      artifact.payload.records[0].contains_minor_data = true;
    }
  });
  const privacyTree = await listTree(privacyRoot);
  await assert.rejects(
    () =>
      validateRealCaptureBundle({
        captureBundlePath: privacyCapture.bundlePath,
        allowedEvidenceRoot: privacyRoot,
        runAt,
      }),
    /Privacy-unsafe contact evidence rejected before persistence/u,
  );
  assert.deepEqual(await listTree(privacyRoot), privacyTree);
});

test("validator enforces aggregate file-count and byte limits without writes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-budget-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await prepareRealCapture(root);
  const before = await listTree(root);
  const bundleByteLength = (await readFile(capture.bundlePath)).byteLength;

  await assert.rejects(
    () =>
      validateRealCaptureBundle({
        captureBundlePath: capture.bundlePath,
        allowedEvidenceRoot: root,
        runAt,
        maxCaptureFileCount: 1,
      }),
    /aggregate file-count limit/u,
  );
  await assert.rejects(
    () =>
      validateRealCaptureBundle({
        captureBundlePath: capture.bundlePath,
        allowedEvidenceRoot: root,
        runAt,
        maxCaptureTotalBytes: bundleByteLength,
      }),
    /aggregate byte intake limit/u,
  );
  assert.deepEqual(await listTree(root), before);
});

test("bounded reader rejects deterministic growth after its initial stat", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-growth-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "growing-evidence.json");
  const initialBytes = Buffer.from("{\"stable\":true}\n", "utf8");
  await writeFile(path, initialBytes);

  await assert.rejects(
    () =>
      testOnlyReadBoundedFile({
        path,
        allowedRoot: root,
        maxBytes: initialBytes.byteLength,
        remainingCaptureBytes: initialBytes.byteLength,
        afterInitialStat: () => appendFile(path, "x"),
      }),
    /Evidence grew during bounded read/u,
  );
});

test("CLI needs no API key, writes no state, and has no synthetic-evidence option", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "ctf-growth-validate-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await prepareRealCapture(root);
  const before = await listTree(root);
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;
  environment.CODE_THE_FUTURE_GROWTH_STATE_ROOT = join(root, "must-not-create-state");

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/validate-capture.ts",
      "--capture",
      capture.bundlePath,
      "--evidence-root",
      root,
      "--run-at",
      runAt,
      "--sha",
      capture.bundleSha256,
    ],
    { cwd: packageRoot, env: environment },
  );
  assert.equal(stderr, "");
  const output = JSON.parse(stdout) as JsonRecord;
  assert.equal(output.status, "valid");
  assert.equal(output.validationScope, "capture_preflight_only");
  assert.equal(output.countsTowardThreeRunGate, false);
  assert.equal(output.modelCalled, false);
  assert.equal(output.graphStateModified, false);
  assert.deepEqual(await listTree(root), before);

  await assert.rejects(
    () =>
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx/esm",
          "src/validate-capture.ts",
          "--capture",
          join(fixtures, "capture-bundle.json"),
          "--evidence-root",
          fixtures,
          "--run-at",
          runAt,
          "--allow-synthetic-evidence",
        ],
        { cwd: packageRoot, env: environment },
      ),
    (error: unknown) => {
      const stderrText = String((error as { stderr?: string }).stderr ?? "");
      assert.deepEqual(JSON.parse(stderrText), {
        status: "invalid",
        code: "invalid_arguments",
        error: "Validator arguments are invalid.",
      });
      assert.doesNotMatch(stderrText, /allow-synthetic-evidence/u);
      return true;
    },
  );

  const schemaRoot = join(root, "schema-error");
  const schemaCapture = await prepareRealCapture(schemaRoot);
  const malformedBundle = JSON.parse(
    await readFile(schemaCapture.bundlePath, "utf8"),
  ) as JsonRecord;
  const sensitiveIdentifier = "evidence:Parent-Jane-Doe";
  malformedBundle.evidence[0].evidence_id = sensitiveIdentifier;
  malformedBundle.evidence[1].evidence_id = sensitiveIdentifier;
  await writeFile(
    schemaCapture.bundlePath,
    `${JSON.stringify(malformedBundle, null, 2)}\n`,
  );
  await assert.rejects(
    () =>
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx/esm",
          "src/validate-capture.ts",
          "--capture",
          schemaCapture.bundlePath,
          "--evidence-root",
          schemaRoot,
          "--run-at",
          runAt,
        ],
        { cwd: packageRoot, env: environment },
      ),
    (error: unknown) => {
      const stderrText = String((error as { stderr?: string }).stderr ?? "");
      assert.deepEqual(JSON.parse(stderrText), {
        status: "invalid",
        code: "schema_validation_failed",
        error: "Capture or digest schema validation failed.",
      });
      assert.doesNotMatch(stderrText, /Parent-Jane-Doe/u);
      return true;
    },
  );

  const sensitivePath = join(root, "Parent-Jane-Doe", "private-capture.json");
  await assert.rejects(
    () =>
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx/esm",
          "src/validate-capture.ts",
          "--capture",
          sensitivePath,
          "--evidence-root",
          dirname(sensitivePath),
          "--run-at",
          runAt,
        ],
        { cwd: packageRoot, env: environment },
      ),
    (error: unknown) => {
      const stderrText = String((error as { stderr?: string }).stderr ?? "");
      assert.deepEqual(JSON.parse(stderrText), {
        status: "invalid",
        code: "path_validation_failed",
        error: "Capture path validation or file access failed.",
      });
      assert.doesNotMatch(stderrText, /Parent-Jane-Doe|private-capture/u);
      return true;
    },
  );
});
