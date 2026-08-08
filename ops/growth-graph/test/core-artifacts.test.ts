import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ArtifactConflictError,
  ArtifactPolicyError,
  SecretMaterialError,
  assertNoSecrets,
  intakeCaptureBundle,
  sha256Bytes,
  writeImmutableArtifact,
} from "../src/artifacts.js";
import { EvidenceArtifactSchema } from "../src/schema.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const runAt = "2026-08-08T16:00:00-04:00";

async function temporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ctf-growth-core-"));
}

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(
    () => stat(path),
    (error: unknown) =>
      error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}

async function singleEvidenceCapture(input: {
  root: string;
  fixtureName: string;
  mutate: (artifact: Record<string, any>) => void;
}): Promise<{ allowed: string; bundlePath: string; runRoot: string }> {
  const allowed = join(input.root, "allowed");
  await mkdir(allowed);
  const artifact = JSON.parse(
    await readFile(join(fixtures, input.fixtureName), "utf8"),
  ) as Record<string, any>;
  input.mutate(artifact);
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  const artifactName = "evidence.json";
  await writeFile(join(allowed, artifactName), artifactText);
  for (const asset of artifact.payload?.assets ?? []) {
    await copyFile(join(fixtures, asset.artifact_path), join(allowed, asset.artifact_path));
  }

  const bundle = JSON.parse(
    await readFile(join(fixtures, "capture-bundle.json"), "utf8"),
  ) as Record<string, any>;
  const declaration = bundle.evidence.find(
    (item: Record<string, unknown>) => item.evidence_id === artifact.evidence_id,
  );
  const sourceRun = bundle.source_runs.find((item: Record<string, unknown>) =>
    (item.evidence_refs as string[]).includes(artifact.evidence_id),
  );
  assert.ok(declaration);
  assert.ok(sourceRun);
  declaration.artifact_path = artifactName;
  declaration.artifact_sha256 = sha256Bytes(artifactText);
  bundle.evidence = [declaration];
  bundle.source_runs = [sourceRun];
  const bundlePath = join(allowed, "bundle.json");
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  return { allowed, bundlePath, runRoot: join(input.root, "run") };
}

test("synthetic intake is explicit, immutable, and replay-safe", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    captureBundlePath: join(fixtures, "capture-bundle.json"),
    allowedEvidenceRoot: fixtures,
    runArtifactRoot: join(root, "run"),
    runAt,
  };

  await assert.rejects(() => intakeCaptureBundle(options), ArtifactPolicyError);
  const first = await intakeCaptureBundle({ ...options, allowSyntheticEvidence: true });
  const replay = await intakeCaptureBundle({ ...options, allowSyntheticEvidence: true });

  assert.equal(first.evidence.length, 4);
  assert.equal(first.assetArtifacts.length, 2);
  assert.equal(first.groupRulesArtifacts.length, 0);
  assert.equal(first.bundleArtifact.outcome, "created");
  assert.equal(replay.bundleArtifact.outcome, "replayed");
  assert.equal(first.intakeHash, replay.intakeHash);
  assert.equal((await stat(first.bundleArtifact.path)).mode & 0o777, 0o600);
  for (const item of first.evidence) {
    assert.equal((await stat(item.immutableArtifact.path)).mode & 0o777, 0o600);
  }
  for (const item of first.assetArtifacts) {
    assert.equal((await stat(item.immutableArtifact.path)).mode & 0o777, 0o600);
  }
});

test("group rules are copied as immutable capture-backed bytes", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const intake = await intakeCaptureBundle({
    captureBundlePath: join(fixtures, "capture-bundle-group-admin.json"),
    allowedEvidenceRoot: fixtures,
    runArtifactRoot: join(root, "run"),
    runAt,
    allowSyntheticEvidence: true,
  });
  assert.equal(intake.groupRulesArtifacts.length, 1);
  const rules = intake.groupRulesArtifacts[0]!;
  assert.equal(rules.evidenceId, "evidence:contact:group-admin");
  assert.equal(rules.recordId, "contact-record:public-group-admin");
  assert.equal(
    rules.contentSha256,
    "2e475ae220d9b899cae69af9bd6e387309133b7eb64fe8f83320dc450b53818f",
  );
  assert.equal(rules.byteLength, 91);
  assert.equal(rules.immutableArtifact.sha256, rules.contentSha256);
  assert.equal((await stat(rules.immutableArtifact.path)).mode & 0o777, 0o600);
});

test("social media asset bytes must match their consent-linked attestation", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const allowed = join(root, "allowed");
  const { mkdir, copyFile } = await import("node:fs/promises");
  await mkdir(allowed);
  await copyFile(join(fixtures, "social-instagram.json"), join(allowed, "social.json"));
  await writeFile(join(allowed, "asset-instagram.txt"), "different synthetic media bytes\n");
  const bundle = JSON.parse(
    await readFile(join(fixtures, "capture-bundle.json"), "utf8"),
  ) as Record<string, unknown> & {
    source_runs: Array<Record<string, unknown>>;
    evidence: Array<Record<string, unknown>>;
  };
  bundle.source_runs = [bundle.source_runs[0]!];
  bundle.evidence = [bundle.evidence[0]!];
  bundle.evidence[0]!.artifact_path = "social.json";
  await writeFile(join(allowed, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);

  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: join(allowed, "bundle.json"),
        allowedEvidenceRoot: allowed,
        runArtifactRoot: join(root, "run"),
        runAt,
        allowSyntheticEvidence: true,
      }),
    /Social asset bytes do not match attestation/u,
  );
});

test("intake rejects a symlink that resolves outside the allowed root", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const allowed = join(root, "allowed");
  await writeFile(join(root, "placeholder"), "x");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(allowed));

  const bundle = JSON.parse(
    await readFile(join(fixtures, "capture-bundle.json"), "utf8"),
  ) as Record<string, unknown> & {
    source_runs: Array<Record<string, unknown>>;
    evidence: Array<Record<string, unknown>>;
  };
  bundle.source_runs = [bundle.source_runs[0]!];
  bundle.evidence = [bundle.evidence[0]!];
  bundle.evidence[0]!.artifact_path = "escape.json";
  await writeFile(join(allowed, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
  await symlink(join(fixtures, "social-instagram.json"), join(allowed, "escape.json"));

  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: join(allowed, "bundle.json"),
        allowedEvidenceRoot: allowed,
        runArtifactRoot: join(root, "run"),
        runAt,
        allowSyntheticEvidence: true,
      }),
    /escapes the allowed evidence root/u,
  );
});

test("declared artifact hash mismatch and immutable replacement both fail closed", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const allowed = join(root, "allowed");
  await import("node:fs/promises").then(({ mkdir, cp }) =>
    Promise.all([
      mkdir(allowed),
      cp(join(fixtures, "social-instagram.json"), join(root, "social-copy.json")),
    ]),
  );
  const bundle = JSON.parse(
    await readFile(join(fixtures, "capture-bundle.json"), "utf8"),
  ) as Record<string, unknown> & {
    source_runs: Array<Record<string, unknown>>;
    evidence: Array<Record<string, unknown>>;
  };
  bundle.source_runs = [bundle.source_runs[0]!];
  bundle.evidence = [bundle.evidence[0]!];
  bundle.evidence[0]!.artifact_path = "social.json";
  bundle.evidence[0]!.artifact_sha256 = "0".repeat(64);
  await import("node:fs/promises").then(({ copyFile }) =>
    copyFile(join(fixtures, "social-instagram.json"), join(allowed, "social.json")),
  );
  await writeFile(join(allowed, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: join(allowed, "bundle.json"),
        allowedEvidenceRoot: allowed,
        runArtifactRoot: join(root, "run"),
        runAt,
        allowSyntheticEvidence: true,
      }),
    ArtifactConflictError,
  );

  const immutablePath = join(root, "immutable.json");
  await writeImmutableArtifact(immutablePath, "first");
  await assert.rejects(
    () => writeImmutableArtifact(immutablePath, "second"),
    ArtifactConflictError,
  );
});

test("secret-like material is rejected before artifacts", () => {
  const tokenShapedValue = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
  assert.throws(
    () => assertNoSecrets({ note: `OPENAI_API_KEY=${tokenShapedValue}` }),
    SecretMaterialError,
  );
  for (const name of [
    "NOTIFY_SECRET",
    "STRIPE_SECRET_KEY",
    "SUPABASE_DB_PASSWORD",
    "ANOTHER_SYSTEM_PASSWORD",
  ]) {
    assert.throws(
      () => assertNoSecrets(`${name}=synthetic-sensitive-value`),
      SecretMaterialError,
    );
  }
  assert.throws(
    () => assertNoSecrets({ NOTIFY_SECRET: "synthetic value containing spaces" }),
    SecretMaterialError,
  );
});

test("privacy-unsafe contact evidence is rejected before any run bytes are retained", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await singleEvidenceCapture({
    root,
    fixtureName: "contact-public.json",
    mutate: (artifact) => {
      artifact.payload.records[0].organization_name = "Synthetic child identity must not persist";
      artifact.payload.records[0].subject_type = "minor";
      artifact.payload.records[0].contains_minor_data = true;
    },
  });

  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: capture.bundlePath,
        allowedEvidenceRoot: capture.allowed,
        runArtifactRoot: capture.runRoot,
        runAt,
        allowSyntheticEvidence: true,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactPolicyError);
      assert.match(error.message, /Privacy-unsafe contact evidence rejected before persistence/u);
      assert.doesNotMatch(error.message, /child identity must not persist/u);
      return true;
    },
  );
  await assertMissing(capture.runRoot);
});

test("expired or wrongly scoped social consent leaves no evidence or asset copy", async (context) => {
  for (const defect of ["expired_guardian", "guardian_for_adult"] as const) {
    const root = await temporaryRoot();
    context.after(() => rm(root, { recursive: true, force: true }));
    const capture = await singleEvidenceCapture({
      root,
      fixtureName: "social-instagram.json",
      mutate: (artifact) => {
        if (defect === "expired_guardian") {
          artifact.payload.consents[0].expires_at = "2026-08-07T23:59:59-04:00";
        } else {
          artifact.payload.assets[0].subject_classification = "adult_only";
          artifact.payload.consents[0].subject_basis = "guardian";
        }
      },
    });

    await assert.rejects(
      () =>
        intakeCaptureBundle({
          captureBundlePath: capture.bundlePath,
          allowedEvidenceRoot: capture.allowed,
          runArtifactRoot: capture.runRoot,
          runAt,
          allowSyntheticEvidence: true,
        }),
      /lacks active instagram-scoped (?:guardian|adult) consent/u,
    );
    await assertMissing(capture.runRoot);
  }
});

test("stale capture-backed consent revocation status fails closed", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await singleEvidenceCapture({
    root,
    fixtureName: "social-instagram.json",
    mutate: (artifact) => {
      artifact.payload.consents[0].revocation_checked_at =
        "2026-08-06T15:20:00-04:00";
    },
  });

  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: capture.bundlePath,
        allowedEvidenceRoot: capture.allowed,
        runArtifactRoot: capture.runRoot,
        runAt,
        allowSyntheticEvidence: true,
      }),
    /revocation status must be checked from captured evidence within 24 hours/u,
  );
  await assertMissing(capture.runRoot);
});

test("revoked social consent requires human review without retaining identifying details", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const sensitiveAssetId = "asset:sensitive-person-marker";
  const capture = await singleEvidenceCapture({
    root,
    fixtureName: "social-instagram.json",
    mutate: (artifact) => {
      artifact.payload.assets[0].asset_id = sensitiveAssetId;
      artifact.payload.assets[0].consent_refs = ["consent:revoked-marker"];
      artifact.payload.posts.forEach((post: Record<string, any>) => {
        post.asset_refs = [sensitiveAssetId];
      });
      artifact.payload.consents[0].consent_id = "consent:revoked-marker";
      artifact.payload.consents[0].asset_id = sensitiveAssetId;
      artifact.payload.consents[0].revoked_at = "2026-08-07T12:00:00-04:00";
    },
  });

  let rejection: unknown;
  try {
    await intakeCaptureBundle({
      captureBundlePath: capture.bundlePath,
      allowedEvidenceRoot: capture.allowed,
      runArtifactRoot: capture.runRoot,
      runAt,
      allowSyntheticEvidence: true,
    });
  } catch (error) {
    rejection = error;
  }
  assert.ok(rejection instanceof ArtifactPolicyError);
  assert.match(rejection.message, /human review is required for any already-published use/u);
  assert.doesNotMatch(rejection.message, /sensitive-person-marker|revoked-marker/u);
  await assertMissing(capture.runRoot);
});

test("no_person cannot conceal voice, name, or artifact media", async () => {
  for (const mediaKind of ["voice", "name", "artifact"] as const) {
    const artifact = JSON.parse(
      await readFile(join(fixtures, "social-instagram.json"), "utf8"),
    ) as Record<string, any>;
    artifact.payload.assets[0].subject_classification = "no_person";
    artifact.payload.assets[0].media_kinds = [mediaKind];
    artifact.payload.assets[0].consent_refs = [];
    artifact.payload.consents = [];
    const result = EvidenceArtifactSchema.safeParse(artifact);
    assert.equal(result.success, false, `expected ${mediaKind} to require a person classification`);
  }
});
