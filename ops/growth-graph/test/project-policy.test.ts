import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  addProjectCalendarDays,
  CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY,
  evaluateCodeTheFutureProjectIdentity,
  isSanitizedProtectedPathCategory,
  projectCalendarDate,
} from "../src/project-policy.js";
import {
  defaultManualIdempotencyKey,
  resolveSyntheticRunAt,
} from "../src/cli-policy.js";
import { EvidenceArtifactSchema } from "../src/schema.js";
import {
  computeRuntimeManifestHash,
  type JsonValue,
} from "../src/workflow.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(packageRoot, "test", "fixtures");

const realProducer = {
  adapter: "code-the-future.growth-capture-adapter" as const,
  version: "1.1.0" as const,
  mode: "read_only_export" as const,
};

test("project calendar dates and arithmetic remain stable across UTC rollover and DST", () => {
  assert.equal(projectCalendarDate("2026-08-10T00:30:00.000Z"), "2026-08-09");
  assert.equal(addProjectCalendarDays("2026-03-09", -1), "2026-03-08");
  assert.equal(addProjectCalendarDays("2026-11-02", -1), "2026-11-01");
  assert.equal(addProjectCalendarDays("2026-03-08", 1), "2026-03-09");
});

test("only exact non-identifying protected path categories are intake-safe", () => {
  assert.equal(
    isSanitizedProtectedPathCategory("https://codethefuture.net/platform/"),
    true,
  );
  for (const unsafe of [
    "https://codethefuture.net/studentdemos/Sensitive-Student-Name",
    "https://codethefuture.net/studentdemos/?student=Sensitive-Student-Name",
    "https://codethefuture.net/%2573tudentdemos/Sensitive-Student-Name",
    "https://codethefuture.net/studentdemos/%2e%2e/studentdemos/Sensitive-Student-Name",
  ]) {
    assert.equal(isSanitizedProtectedPathCategory(unsafe), false, unsafe);
  }
});

test("manual CLI idempotency buckets by the project-local calendar day", () => {
  const digest = "a".repeat(64);
  assert.equal(
    defaultManualIdempotencyKey(digest, "2026-08-10T00:30:00.000Z"),
    defaultManualIdempotencyKey(digest, "2026-08-10T03:59:59.999Z"),
  );
  assert.notEqual(
    defaultManualIdempotencyKey(digest, "2026-08-10T03:59:59.999Z"),
    defaultManualIdempotencyKey(digest, "2026-08-10T04:00:00.000Z"),
  );
});

test("fixed CLI clocks are strict and synthetic-only", () => {
  assert.throws(
    () => resolveSyntheticRunAt("2026-08-08T23:00:00-04:00", false),
    /synthetic-evidence/u,
  );
  assert.throws(
    () => resolveSyntheticRunAt("2026-08-08T23:00:00", true),
    /Invalid ISO datetime/u,
  );
  assert.equal(
    resolveSyntheticRunAt("2026-08-08T23:00:00-04:00", true),
    "2026-08-08T23:00:00-04:00",
  );
});

test("project identity policy separates Meta asset, Page, and portfolio IDs", () => {
  const verified = evaluateCodeTheFutureProjectIdentity({
    schema_version: "code-the-future.growth-evidence.v1.1",
    source: "facebook_insights",
    producer: realProducer,
    redaction_status: "redacted",
    data_state: "complete",
    platform: "facebook",
    account_id: "61592857947154",
    meta_identity: {
      asset_id: "1211320332069277",
      page_id: "61592857947154",
      business_portfolio_id: "1382097470521196",
    },
  });
  assert.deepEqual(verified, { accepted: true, decision_eligible: true });

  const untypedPartial = evaluateCodeTheFutureProjectIdentity({
    schema_version: "code-the-future.growth-evidence.v1",
    source: "facebook_insights",
    producer: { ...realProducer, version: "1.0.0" },
    redaction_status: "redacted",
    data_state: "partial",
    platform: "facebook",
    account_id: "1211320332069277",
  });
  assert.deepEqual(untypedPartial, { accepted: true, decision_eligible: false });

  const wrongPortfolio = evaluateCodeTheFutureProjectIdentity({
    schema_version: "code-the-future.growth-evidence.v1.1",
    source: "facebook_insights",
    producer: realProducer,
    redaction_status: "redacted",
    data_state: "complete",
    platform: "facebook",
    account_id: "61592857947154",
    meta_identity: {
      asset_id: "1211320332069277",
      page_id: "61592857947154",
      business_portfolio_id: "1382097470521197",
    },
  });
  assert.equal(wrongPortfolio.accepted, false);
});

test("provisional Instagram and GA4 evidence remains observation-only", () => {
  const instagram = evaluateCodeTheFutureProjectIdentity({
    schema_version: "code-the-future.growth-evidence.v1",
    source: "instagram_insights",
    producer: { ...realProducer, version: "1.0.0" },
    redaction_status: "redacted",
    data_state: "partial",
    platform: "instagram",
    account_id: "codethefuturelouisville",
  });
  assert.deepEqual(instagram, { accepted: true, decision_eligible: false });
  assert.equal(
    evaluateCodeTheFutureProjectIdentity({
      schema_version: "code-the-future.growth-evidence.v1",
      source: "instagram_insights",
      producer: { ...realProducer, version: "1.0.0" },
      redaction_status: "redacted",
      data_state: "complete",
      platform: "instagram",
      account_id: "codethefuturelouisville",
    }).accepted,
    false,
  );

  const ga4Partial = evaluateCodeTheFutureProjectIdentity({
    schema_version: "code-the-future.growth-evidence.v1.1",
    source: "ga4",
    producer: realProducer,
    redaction_status: "redacted",
    data_state: "partial",
    property_id: "547164458",
    stream: { state: "unavailable", reason: "permission_limited" },
  });
  assert.deepEqual(ga4Partial, { accepted: true, decision_eligible: false });
  assert.equal(
    evaluateCodeTheFutureProjectIdentity({
      schema_version: "code-the-future.growth-evidence.v1.1",
      source: "ga4",
      producer: realProducer,
      redaction_status: "redacted",
      data_state: "complete",
      property_id: "547164458",
      stream: { state: "unavailable", reason: "permission_limited" },
    }).accepted,
    false,
  );
  assert.deepEqual(
    evaluateCodeTheFutureProjectIdentity({
      schema_version: "code-the-future.growth-evidence.v1",
      source: "ga4",
      producer: { ...realProducer, version: "1.0.0" },
      redaction_status: "redacted",
      data_state: "complete",
      property_id: "547164458",
    }),
    { accepted: true, decision_eligible: false },
  );
});

test("real GSC identity is URL-prefix only and synthetic markers must be paired", () => {
  const gscBase = {
    schema_version: "code-the-future.growth-evidence.v1" as const,
    source: "search_console" as const,
    producer: { ...realProducer, version: "1.0.0" as const },
    redaction_status: "redacted" as const,
    data_state: "complete" as const,
    property_url: "https://codethefuture.net/",
  };
  assert.equal(
    evaluateCodeTheFutureProjectIdentity({
      ...gscBase,
      property_id: "https://codethefuture.net/",
    }).decision_eligible,
    true,
  );
  assert.equal(
    evaluateCodeTheFutureProjectIdentity({
      ...gscBase,
      property_id: "sc-domain:codethefuture.net",
    }).accepted,
    false,
  );
  assert.equal(
    evaluateCodeTheFutureProjectIdentity({
      ...gscBase,
      property_id: "https://codethefuture.net/",
      property_url: "https://foo.codethefuture.net/",
    }).accepted,
    false,
  );
  assert.equal(
    evaluateCodeTheFutureProjectIdentity({
      ...gscBase,
      producer: { ...gscBase.producer, mode: "synthetic_fixture" },
    }).accepted,
    false,
  );
});

test("schema binds source to producer mode while authenticated public-web capture stays valid", async () => {
  const contact = JSON.parse(
    await readFile(join(fixtures, "contact-public.json"), "utf8"),
  ) as Record<string, any>;
  contact.producer.mode = "authenticated_read";
  contact.redaction_status = "public";
  assert.equal(EvidenceArtifactSchema.safeParse(contact).success, true);

  contact.source = "contact_history";
  contact.producer.mode = "public_web";
  assert.equal(EvidenceArtifactSchema.safeParse(contact).success, false);

  contact.producer.mode = "synthetic_fixture";
  contact.redaction_status = "public";
  assert.equal(EvidenceArtifactSchema.safeParse(contact).success, false);
});

test("CLI runtime manifest explicitly hashes the versioned project identity policy", async () => {
  const cliSource = await readFile(join(packageRoot, "src", "cli.ts"), "utf8");
  assert.match(
    cliSource,
    /projectIdentityPolicy:\s*\n?\s*CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY/u,
  );
  const withPolicy = await computeRuntimeManifestHash([], {
    projectIdentityPolicy:
      CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY as unknown as JsonValue,
  });
  const withoutPolicy = await computeRuntimeManifestHash([], {});
  assert.notEqual(withPolicy, withoutPolicy);
});
