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
import { analyzeGrowthPortfolio } from "../src/domain.js";
import {
  EvidenceArtifactSchema,
  MetricSnapshotSchema,
} from "../src/schema.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const runAt = "2026-08-09T15:00:00-04:00";

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
  bundle.created_at = runAt;
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

  assert.equal(first.evidence.length, 5);
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

test("day-zero smoke fixture reports missing lanes as baseline gaps", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const smokeRunAt = "2026-08-08T23:00:00-04:00";
  const intake = await intakeCaptureBundle({
    captureBundlePath: join(fixtures, "capture-bundle-day-zero.json"),
    allowedEvidenceRoot: fixtures,
    runArtifactRoot: join(root, "run"),
    runAt: smokeRunAt,
    allowSyntheticEvidence: true,
  });
  assert.equal(intake.evidence.length, 1);
  const portfolio = analyzeGrowthPortfolio({
    bundle: intake.bundle,
    evidence: intake.evidence.map((entry) => entry.artifact),
    runAt: smokeRunAt,
  });
  assert.equal(
    portfolio.lanes.find((lane) => lane.lane === "organic_social")?.status,
    "baseline_gap",
  );
  assert.equal(
    portfolio.lanes.find((lane) => lane.lane === "contact_discovery")?.status,
    "baseline_gap",
  );
});

test("runtime intake requires offset-qualified run instants and an in-window project date", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const invalidRunAt of [
    "2026-08-09",
    "2026-08-09T15:00:00",
    "August 9, 2026 3:00 PM",
  ]) {
    const runRoot = join(root, `invalid-${invalidRunAt.length}`);
    await assert.rejects(
      () =>
        intakeCaptureBundle({
          captureBundlePath: join(fixtures, "capture-bundle.json"),
          allowedEvidenceRoot: fixtures,
          runArtifactRoot: runRoot,
          runAt: invalidRunAt,
          allowSyntheticEvidence: true,
        }),
      /explicit UTC offset/u,
    );
    await assertMissing(runRoot);
  }

  const outsideRoot = join(root, "outside-objective");
  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: join(fixtures, "capture-bundle.json"),
        allowedEvidenceRoot: fixtures,
        runArtifactRoot: outsideRoot,
        runAt: "2026-10-08T00:00:00-04:00",
        allowSyntheticEvidence: true,
      }),
    /objective window/u,
  );
  await assertMissing(outsideRoot);
});

test("date-only evidence is bounded by the project calendar at UTC rollover", async () => {
  const contact = JSON.parse(
    await readFile(join(fixtures, "contact-history.json"), "utf8"),
  ) as Record<string, any>;
  contact.captured_at = "2026-08-09T20:30:00-04:00";
  contact.fresh_through = "2026-08-09";
  assert.equal(EvidenceArtifactSchema.safeParse(contact).success, true);
  contact.fresh_through = "2026-08-10";
  assert.equal(EvidenceArtifactSchema.safeParse(contact).success, false);

  const gsc = JSON.parse(
    await readFile(join(fixtures, "search-console.json"), "utf8"),
  ) as Record<string, any>;
  gsc.captured_at = "2026-08-09T20:30:00-04:00";
  gsc.fresh_through = "2026-08-09";
  gsc.payload.date_window.end = "2026-08-09";
  assert.equal(EvidenceArtifactSchema.safeParse(gsc).success, true);
  gsc.fresh_through = "2026-08-10";
  assert.equal(EvidenceArtifactSchema.safeParse(gsc).success, false);
});

test("metric windows cannot end before they start", () => {
  assert.equal(
    MetricSnapshotSchema.safeParse({
      metric_id: "metric:reversed-window",
      lane: "search_console",
      metric_name: "reversed_window",
      value: null,
      unit: "count",
      window_start: "2026-08-09",
      window_end: "2026-08-08",
      complete: false,
      evidence_refs: ["missing:evidence"],
    }).success,
    false,
  );
});

test("learner-identifying protected URLs are rejected before any run bytes persist", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const sensitiveLearnerUrl =
    "https://codethefuture.net/studentdemos/Sensitive-Student-Name";
  const capture = await singleEvidenceCapture({
    root,
    fixtureName: "search-console.json",
    mutate: (artifact) => {
      artifact.payload.rows[0].page = sensitiveLearnerUrl;
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
      assert.match(error.message, /rejected before persistence/u);
      assert.doesNotMatch(error.message, /Sensitive-Student-Name/u);
      return true;
    },
  );
  await assertMissing(capture.runRoot);
});

test("v1.1 partial social intake retains no raw media or asset bytes", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const allowed = join(root, "allowed");
  await mkdir(allowed);
  const artifact = JSON.parse(
    await readFile(join(fixtures, "social-facebook-partial-v1.1.json"), "utf8"),
  ) as Record<string, any>;
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(join(allowed, "evidence.json"), artifactText);

  const bundle = JSON.parse(
    await readFile(join(fixtures, "capture-bundle.json"), "utf8"),
  ) as Record<string, any>;
  const declaration = bundle.evidence.find(
    (item: Record<string, unknown>) => item.source === "facebook_insights",
  );
  const sourceRun = bundle.source_runs.find(
    (item: Record<string, unknown>) => item.source === "facebook_insights",
  );
  assert.ok(declaration);
  assert.ok(sourceRun);
  Object.assign(declaration, {
    evidence_id: artifact.evidence_id,
    artifact_path: "evidence.json",
    artifact_sha256: sha256Bytes(artifactText),
    captured_at: artifact.captured_at,
    fresh_through: artifact.fresh_through,
    data_state: artifact.data_state,
    redaction_status: artifact.redaction_status,
    producer_mode: artifact.producer.mode,
  });
  Object.assign(sourceRun, {
    account_or_property_id: artifact.account_id,
    status: "verified_partial",
    started_at: artifact.captured_at,
    completed_at: artifact.captured_at,
    fresh_through: artifact.fresh_through,
    data_state: artifact.data_state,
    records_captured: artifact.payload.partial_post_observations.length,
    evidence_refs: [artifact.evidence_id],
  });
  bundle.evidence = [declaration];
  bundle.source_runs = [sourceRun];
  bundle.created_at = runAt;
  const bundlePath = join(allowed, "bundle.json");
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);

  const intake = await intakeCaptureBundle({
    captureBundlePath: bundlePath,
    allowedEvidenceRoot: allowed,
    runArtifactRoot: join(root, "run"),
    runAt,
    allowSyntheticEvidence: true,
  });
  assert.equal(intake.evidence.length, 1);
  assert.equal(intake.assetArtifacts.length, 0);
  assert.equal(intake.evidence[0]!.artifact.lane, "organic_social");

  sourceRun.status = "verified_complete";
  sourceRun.data_state = "complete";
  const mismatchedBundlePath = join(allowed, "bundle-complete-mismatch.json");
  await writeFile(mismatchedBundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const mismatchedRunRoot = join(root, "mismatched-run");
  await assert.rejects(
    () =>
      intakeCaptureBundle({
        captureBundlePath: mismatchedBundlePath,
        allowedEvidenceRoot: allowed,
        runArtifactRoot: mismatchedRunRoot,
        runAt,
        allowSyntheticEvidence: true,
      }),
    /Complete source run references partial evidence/u,
  );
  await assertMissing(mismatchedRunRoot);
});

test("source-run account and property identities must match their evidence", async (context) => {
  const root = await temporaryRoot();
  context.after(() => rm(root, { recursive: true, force: true }));
  const capture = await singleEvidenceCapture({
    root,
    fixtureName: "social-facebook.json",
    mutate: (artifact) => {
      artifact.account_id = "different-facebook-account";
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
    /Source-run identity does not match evidence/u,
  );
  await assertMissing(capture.runRoot);
});

test("v1.1 complete media rows require an attested asset", async () => {
  const artifact = JSON.parse(
    await readFile(join(fixtures, "social-facebook.json"), "utf8"),
  ) as Record<string, any>;
  artifact.schema_version = "code-the-future.growth-evidence.v1.1";
  artifact.producer.version = "1.1.0";
  artifact.payload.partial_post_observations = [];
  artifact.payload.posts[0].asset_refs = [];
  assert.equal(EvidenceArtifactSchema.safeParse(artifact).success, false);
});

test("v1.1 partial observations reject orphan media and consent records", async () => {
  const artifact = JSON.parse(
    await readFile(join(fixtures, "social-facebook-partial-v1.1.json"), "utf8"),
  ) as Record<string, any>;
  artifact.payload.assets = [
    {
      asset_id: "asset:orphan",
      artifact_path: "orphan.bin",
      content_sha256: "0".repeat(64),
      byte_length: 1,
      subject_classification: "no_person",
      media_kinds: ["image"],
      consent_refs: [],
    },
  ];
  assert.equal(EvidenceArtifactSchema.safeParse(artifact).success, false);

  artifact.payload.assets = [];
  artifact.payload.consents = [
    {
      consent_id: "consent:orphan",
      asset_id: "asset:missing",
      subject_basis: "adult",
      allowed_channels: ["facebook"],
      allowed_media: ["image"],
      evidence_reference: "synthetic consent fixture",
      granted_at: "2026-08-08T12:00:00-04:00",
      revocation_checked_at: "2026-08-08T15:00:00-04:00",
    },
  ];
  assert.equal(EvidenceArtifactSchema.safeParse(artifact).success, false);
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
  for (const assignment of [
    "access_token=opaquevalue123",
    'api_key = "opaque-value"',
    "password='opaque-value'",
    "https://api.example.test/callback#access_token=opaquevalue123",
    "https://api.example.test/callback#state=safe&refresh_token=opaquevalue123",
    "https://operator:password@example.test/path",
    "https://%6fperator:%70assword@example.test/path",
  ]) {
    assert.throws(() => assertNoSecrets(assignment), SecretMaterialError);
  }
  assert.doesNotThrow(() =>
    assertNoSecrets({
      authorization: {
        authorization_basis: "none_needed",
        subject_basis: "none_needed",
      },
    }),
  );
});

test("evidence schemas reject future observations, unsafe provenance, and ambiguous IDs", async () => {
  const social = JSON.parse(
    await readFile(join(fixtures, "social-instagram.json"), "utf8"),
  ) as Record<string, any>;
  social.payload.follower_snapshots[1].recorded_at =
    "2026-08-10T14:00:00-04:00";
  assert.equal(EvidenceArtifactSchema.safeParse(social).success, false);

  const futurePost = JSON.parse(
    await readFile(join(fixtures, "social-facebook.json"), "utf8"),
  ) as Record<string, any>;
  futurePost.payload.posts[0].published_at = "2026-08-10T14:00:00-04:00";
  assert.equal(EvidenceArtifactSchema.safeParse(futurePost).success, false);

  const partial = JSON.parse(
    await readFile(join(fixtures, "social-facebook-partial-v1.1.json"), "utf8"),
  ) as Record<string, any>;
  partial.payload.partial_post_observations[0].provenance.source_url =
    "https://business.facebook.com/latest/insights/content/?view=posts#details";
  assert.equal(EvidenceArtifactSchema.safeParse(partial).success, false);

  const nonMinimized = JSON.parse(
    await readFile(join(fixtures, "social-facebook-partial-v1.1.json"), "utf8"),
  ) as Record<string, any>;
  nonMinimized.payload.posts.push(futurePost.payload.posts[0]);
  assert.equal(EvidenceArtifactSchema.safeParse(nonMinimized).success, false);

  const socialUniquenessCases: ReadonlyArray<{
    name: string;
    mutate: (artifact: Record<string, any>) => void;
  }> = [
    {
      name: "asset_id",
      mutate: (artifact) => {
        artifact.payload.assets.push(structuredClone(artifact.payload.assets[0]));
      },
    },
    {
      name: "consent_id",
      mutate: (artifact) => {
        artifact.payload.consents.push(structuredClone(artifact.payload.consents[0]));
      },
    },
    {
      name: "asset consent_refs",
      mutate: (artifact) => {
        artifact.payload.assets[0].consent_refs.push(
          artifact.payload.assets[0].consent_refs[0],
        );
      },
    },
    {
      name: "asset media_kinds",
      mutate: (artifact) => {
        artifact.payload.assets[0].media_kinds.push(
          artifact.payload.assets[0].media_kinds[0],
        );
      },
    },
    {
      name: "consent allowed_channels",
      mutate: (artifact) => {
        artifact.payload.consents[0].allowed_channels.push(
          artifact.payload.consents[0].allowed_channels[0],
        );
      },
    },
    {
      name: "consent allowed_media",
      mutate: (artifact) => {
        artifact.payload.consents[0].allowed_media.push(
          artifact.payload.consents[0].allowed_media[0],
        );
      },
    },
    {
      name: "post asset_refs",
      mutate: (artifact) => {
        artifact.payload.posts[0].asset_refs.push(
          artifact.payload.posts[0].asset_refs[0],
        );
      },
    },
  ];
  const validSocial = JSON.parse(
    await readFile(join(fixtures, "social-instagram.json"), "utf8"),
  ) as Record<string, any>;
  for (const uniquenessCase of socialUniquenessCases) {
    const artifact = structuredClone(validSocial);
    uniquenessCase.mutate(artifact);
    assert.equal(
      EvidenceArtifactSchema.safeParse(artifact).success,
      false,
      uniquenessCase.name,
    );
  }

  const contact = JSON.parse(
    await readFile(join(fixtures, "contact-public.json"), "utf8"),
  ) as Record<string, any>;
  contact.payload.history_complete = true;
  assert.equal(
    EvidenceArtifactSchema.safeParse(structuredClone(contact)).success,
    true,
    "legacy v1 public-web history claims remain parseable",
  );
  contact.payload.records.push(structuredClone(contact.payload.records[0]));
  contact.payload.records[0].verified_at = "2026-08-10T14:00:00-04:00";
  assert.equal(EvidenceArtifactSchema.safeParse(contact).success, false);

  const gsc = JSON.parse(
    await readFile(join(fixtures, "search-console.json"), "utf8"),
  ) as Record<string, any>;
  gsc.fresh_through = "2026-08-09";
  gsc.payload.date_window.end = "2026-08-09";
  gsc.payload.rows[0].date = "2026-08-09";
  assert.equal(EvidenceArtifactSchema.safeParse(gsc).success, false);

  const ga4 = JSON.parse(
    await readFile(join(fixtures, "ga4-v1.1.json"), "utf8"),
  ) as Record<string, any>;
  ga4.fresh_through = "2026-08-09";
  ga4.payload.date_window.end = "2026-08-09";
  assert.equal(EvidenceArtifactSchema.safeParse(ga4).success, false);
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
