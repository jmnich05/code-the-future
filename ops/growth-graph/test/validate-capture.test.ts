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
const runAt = "2026-08-08T16:00:00-04:00";

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
    mutateArtifact?.(artifact);

    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    await writeFile(join(root, declaration.artifact_path as string), artifactText);
    declaration.artifact_sha256 = sha256Bytes(artifactText);
    declaration.producer_mode = producerMode;
    declaration.redaction_status = redactionStatus;
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
  assert.equal(first.sourceRunCount, 4);
  assert.equal(first.evidenceCount, 4);
  assert.equal(first.assetCount, 2);
  assert.equal(first.groupRulesArtifactCount, 0);
  assert.deepEqual(first.lanes, {
    organic_social: { sourceRunCount: 2, evidenceCount: 2 },
    contact_discovery: { sourceRunCount: 1, evidenceCount: 1 },
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
    if (artifact.lane === "contact_discovery") {
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
