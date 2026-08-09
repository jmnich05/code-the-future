import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  analyzeContactLane,
  analyzeGrowthPortfolio,
  analyzeSearchConsoleLane,
  analyzeSocialLane,
  fingerprintNormalizedContactIdentity,
  isParentIntentQuery,
  isProtectedIndexPath,
  normalizeContactIdentity,
} from "../src/domain.js";
import {
  CaptureBundleSchema,
  EVIDENCE_ATTESTATION_SCHEMA_VERSION,
  type EvidenceArtifact,
  EvidenceArtifactSchema,
  Ga4EvidenceArtifactSchema,
  SearchConsoleEvidenceArtifactSchema,
  SearchConsoleSummaryEvidenceArtifactSchema,
  SocialEvidenceArtifactV1_1Schema,
} from "../src/schema.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const runAt = "2026-08-09T15:00:00-04:00";

async function fixtureJson(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(fixtures, name), "utf8")) as unknown;
}

async function inputs(): Promise<{
  bundle: ReturnType<typeof CaptureBundleSchema.parse>;
  evidence: EvidenceArtifact[];
}> {
  const bundle = CaptureBundleSchema.parse(await fixtureJson("capture-bundle.json"));
  const evidence = await Promise.all(
    [
      "social-instagram.json",
      "social-facebook.json",
      "contact-public.json",
      "contact-history.json",
      "search-console.json",
    ].map(async (name) => EvidenceArtifactSchema.parse(await fixtureJson(name))),
  );
  return { bundle, evidence };
}

async function typedFacebookOnlyInputs(options?: {
  capturedAt?: string;
  closingRecordedAt?: string;
  postPublishedAt?: string;
}): Promise<{
  bundle: ReturnType<typeof CaptureBundleSchema.parse>;
  evidence: EvidenceArtifact[];
}> {
  const capturedAt = options?.capturedAt ?? "2026-08-09T20:30:00-04:00";
  const closingRecordedAt =
    options?.closingRecordedAt ?? "2026-08-09T19:00:00-04:00";
  const artifact = (await fixtureJson(
    "social-facebook-typed-v1.1.json",
  )) as Record<string, any>;
  artifact.producer.mode = "authenticated_read";
  artifact.redaction_status = "redacted";
  artifact.captured_at = capturedAt;
  artifact.fresh_through = "2026-08-09";
  artifact.payload.follower_snapshots[1].recorded_at = closingRecordedAt;
  if (options?.postPublishedAt) {
    for (const post of artifact.payload.posts) {
      post.published_at = options.postPublishedAt;
    }
  }

  const bundle = (await fixtureJson(
    "capture-bundle-facebook-typed-v1.1.json",
  )) as Record<string, any>;
  bundle.created_at = "2026-08-09T20:40:00-04:00";
  bundle.source_runs[0].started_at = "2026-08-09T20:00:00-04:00";
  bundle.source_runs[0].completed_at = capturedAt;
  bundle.source_runs[0].fresh_through = "2026-08-09";
  bundle.evidence[0].captured_at = capturedAt;
  bundle.evidence[0].fresh_through = "2026-08-09";
  bundle.evidence[0].redaction_status = "redacted";
  bundle.evidence[0].producer_mode = "authenticated_read";

  return {
    bundle: CaptureBundleSchema.parse(bundle),
    evidence: [SocialEvidenceArtifactV1_1Schema.parse(artifact)],
  };
}

test("deterministic portfolio keeps lanes separate and excludes branded GSC clicks", async () => {
  const source = await inputs();
  const analysis = analyzeGrowthPortfolio({ ...source, runAt });

  assert.deepEqual(
    analysis.lanes.map((lane) => lane.lane),
    ["organic_social", "contact_discovery", "search_console"],
  );
  assert.equal(analysis.overall_status, "eligible");
  const social = analysis.lanes[0];
  assert.equal(social.metrics.find((item) => item.platform === "instagram")?.value, 5);
  assert.equal(social.metrics.find((item) => item.platform === "facebook")?.value, 3);
  assert.equal(social.decision, "repeat", "one complete arm is not a valid comparison");
  const search = analysis.lanes[2];
  assert.equal(
    search.metrics.find((item) => item.metric_name === "nonbrand_parent_intent_gsc_clicks_28d")
      ?.value,
    10,
  );
});

test("every direct analyzer fails closed outside the project objective window", async () => {
  const source = await inputs();
  const analyzers = [
    analyzeSocialLane,
    analyzeContactLane,
    analyzeSearchConsoleLane,
    analyzeGrowthPortfolio,
  ] as const;
  for (const runAtBoundary of [
    "2026-08-07T23:59:59-04:00",
    "2026-10-08T00:00:00-04:00",
  ]) {
    for (const analyzer of analyzers) {
      assert.throws(
        () => analyzer({ ...source, runAt: runAtBoundary }),
        /outside the objective window/u,
      );
    }
  }
  for (const runAtBoundary of [
    "2026-08-08T00:00:00-04:00",
    "2026-10-07T23:59:59-04:00",
  ]) {
    assert.doesNotThrow(() =>
      analyzeGrowthPortfolio({ ...source, runAt: runAtBoundary }),
    );
  }
  assert.throws(
    () => analyzeGrowthPortfolio({ ...source, runAt: "2026-08-09T12:00:00" }),
    /explicit UTC offset/u,
  );
});

test("nonbrand parent intent requires two normalized query-token families", () => {
  for (const query of [
    "code-the-future kids coding camp",
    "code_the_future parent AI class",
    "Code The Future youth STEM program",
  ]) {
    assert.equal(isParentIntentQuery(query), false, query);
  }
  for (const query of ["louisville bourbon", "ai company", "coding software"]) {
    assert.equal(isParentIntentQuery(query), false, query);
  }
  for (const query of [
    "coding camp louisville",
    "AI classes for kids",
    "parent robotics workshop",
  ]) {
    assert.equal(isParentIntentQuery(query), true, query);
  }
});

test("social scaling requires two arms with three mature executions on one platform", async () => {
  const source = await inputs();
  const instagram = structuredClone(
    source.evidence.find((item) => item.evidence_id === "evidence:social:instagram")!,
  );
  if (instagram.lane !== "organic_social") assert.fail("expected social fixture");
  const secondArm = instagram.payload.posts.map((post, index) => ({
    ...post,
    post_id: `ig-comparison-${index + 1}`,
    arm: "community-proof",
  }));
  instagram.payload.posts.push(...secondArm);
  const evidence = source.evidence.map((item) =>
    item.evidence_id === instagram.evidence_id ? instagram : item,
  );

  assert.equal(analyzeSocialLane({ bundle: source.bundle, evidence, runAt }).decision, "propose_scale");
});

test("zero-reach posts cannot count as mature executions or enter scoring", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  for (const artifact of evidence) {
    if (artifact.lane !== "organic_social") continue;
    for (const post of artifact.payload.posts) post.reach = 0;
  }

  const result = analyzeSocialLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.status, "observe_more");
  assert.equal(result.decision, "observe_more");
  assert.match(result.issues.join(" "), /excluded because reach was below 1/u);
  assert.match(result.issues.join(" "), /No organic post has a mature/u);
});

test("expired, stale, or subject-mismatched consent quarantines person media", async () => {
  const source = await inputs();
  for (const defect of [
    "expired",
    "stale_revocation_check",
    "adult_for_child",
    "guardian_for_adult",
  ] as const) {
    const evidence = structuredClone(source.evidence);
    const instagram = evidence.find((item) => item.evidence_id === "evidence:social:instagram");
    if (!instagram || instagram.lane !== "organic_social") assert.fail("expected social fixture");
    const consent = instagram.payload.consents[0]!;
    if (defect === "expired") consent.expires_at = "2026-08-07T12:00:00-04:00";
    else if (defect === "stale_revocation_check") {
      consent.revocation_checked_at = "2026-08-06T12:00:00-04:00";
    } else if (defect === "adult_for_child") consent.subject_basis = "adult";
    else instagram.payload.assets[0]!.subject_classification = "adult_only";
    const result = analyzeSocialLane({ bundle: source.bundle, evidence, runAt });
    assert.equal(result.status, "quarantined");
    assert.equal(result.opportunities.length, 0);
  }
});

test("conflicting duplicate consent IDs quarantine deterministically in either order", async () => {
  const source = await inputs();
  const firstEvidence = structuredClone(source.evidence);
  const firstInstagram = firstEvidence.find(
    (item) => item.evidence_id === "evidence:social:instagram",
  );
  if (!firstInstagram || firstInstagram.lane !== "organic_social") {
    assert.fail("expected social fixture");
  }
  const activeConsent = structuredClone(firstInstagram.payload.consents[0]!);
  const conflictingConsent = {
    ...structuredClone(activeConsent),
    revoked_at: "2026-08-09T14:00:00-04:00",
  };
  firstInstagram.payload.consents = [activeConsent, conflictingConsent];

  const reversedEvidence = structuredClone(firstEvidence);
  const reversedInstagram = reversedEvidence.find(
    (item) => item.evidence_id === "evidence:social:instagram",
  );
  if (!reversedInstagram || reversedInstagram.lane !== "organic_social") {
    assert.fail("expected social fixture");
  }
  reversedInstagram.payload.consents.reverse();

  const first = analyzeSocialLane({
    bundle: source.bundle,
    evidence: firstEvidence,
    runAt,
  });
  const reversed = analyzeSocialLane({
    bundle: source.bundle,
    evidence: reversedEvidence,
    runAt,
  });
  assert.deepEqual(reversed, first);
  assert.equal(first.status, "quarantined");
  assert.equal(first.opportunities.length, 0);
  assert.match(
    first.issues.join(" "),
    /Duplicate social consent identities make authorization ambiguous/u,
  );
});

test("paid-influenced follower snapshots never become an organic baseline", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const instagram = evidence.find((item) => item.evidence_id === "evidence:social:instagram");
  if (!instagram || instagram.lane !== "organic_social") assert.fail("expected social fixture");
  instagram.payload.follower_snapshots[1]!.paid_influence = "mixed";
  const result = analyzeSocialLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.status, "eligible");
  assert.equal(result.metrics.find((item) => item.platform === "instagram")?.value, null);
  assert.equal(result.opportunities[0]?.kind, "social_experiment");
  assert.equal(result.opportunities[0]?.platform, "facebook");
});

test("typed Facebook remains decision-eligible when Instagram is missing", async () => {
  const source = await typedFacebookOnlyInputs();
  const result = analyzeSocialLane({
    ...source,
    runAt: "2026-08-09T21:00:00-04:00",
  });
  const facebookMetric = result.metrics.find(
    (item) => item.platform === "facebook",
  );
  const instagramMetric = result.metrics.find(
    (item) => item.platform === "instagram",
  );
  assert.equal(result.status, "eligible");
  assert.equal(result.source_coverage, "partial");
  assert.equal(facebookMetric?.value, 3);
  assert.equal(facebookMetric?.window_end, "2026-08-09");
  assert.deepEqual(facebookMetric?.evidence_refs, [
    "evidence:social:facebook:typed",
  ]);
  assert.equal(instagramMetric?.value, null);
  assert.deepEqual(instagramMetric?.evidence_refs, ["missing:evidence"]);
  assert.equal(result.opportunities[0]?.kind, "social_experiment");
  assert.equal(result.opportunities[0]?.platform, "facebook");
});

test("typed Meta proof conditionally unifies older asset-ID observations with the Page", async () => {
  const source = await typedFacebookOnlyInputs();
  const partialRaw = (await fixtureJson(
    "social-facebook-partial-v1.1.json",
  )) as Record<string, any>;
  partialRaw.producer.mode = "read_only_export";
  partialRaw.redaction_status = "redacted";
  partialRaw.account_id = "1211320332069277";
  const partial = SocialEvidenceArtifactV1_1Schema.parse(partialRaw);
  const bundle = structuredClone(source.bundle);
  bundle.evidence.push({
    evidence_id: partial.evidence_id,
    lane: partial.lane,
    source: partial.source,
    artifact_path: "social-facebook-partial-v1.1.json",
    artifact_sha256: "0".repeat(64),
    captured_at: partial.captured_at,
    fresh_through: partial.fresh_through,
    data_state: partial.data_state,
    redaction_status: partial.redaction_status,
    producer_mode: partial.producer.mode,
  });
  bundle.source_runs.push({
    source_run_id: "source-run:facebook:older-asset-observation",
    lane: "organic_social",
    source: "facebook_insights",
    account_or_property_id: partial.account_id,
    status: "verified_partial",
    started_at: partial.captured_at,
    completed_at: partial.captured_at,
    fresh_through: partial.fresh_through,
    data_state: "partial",
    records_captured: 1,
    evidence_refs: [partial.evidence_id],
  });

  const forward = analyzeSocialLane({
    bundle,
    evidence: [partial, ...source.evidence],
    runAt: "2026-08-09T21:00:00-04:00",
  });
  const reversed = analyzeSocialLane({
    bundle,
    evidence: [...source.evidence, partial],
    runAt: "2026-08-09T21:00:00-04:00",
  });
  assert.deepEqual(reversed, forward);
  assert.equal(forward.status, "eligible");
  assert.equal(forward.opportunities[0]?.kind, "social_experiment");
  assert.doesNotMatch(forward.issues.join(" "), /Multiple facebook accounts/u);

  const withoutTypedProof = structuredClone(source.evidence);
  delete (withoutTypedProof[0] as any).meta_identity;
  const unsafe = analyzeSocialLane({
    bundle,
    evidence: [partial, ...withoutTypedProof],
    runAt: "2026-08-09T21:00:00-04:00",
  });
  assert.equal(unsafe.status, "quarantined");
  assert.match(unsafe.issues.join(" "), /Multiple facebook accounts/u);
});

test("social maturity is fixed at capture time and cannot age in during replay", async () => {
  const source = await typedFacebookOnlyInputs({
    postPublishedAt: "2026-08-07T21:00:00-04:00",
  });
  const capturedResult = analyzeSocialLane({
    ...source,
    runAt: "2026-08-09T21:00:00-04:00",
  });
  const replayedResult = analyzeSocialLane({
    ...source,
    runAt: "2026-08-13T21:00:00-04:00",
  });
  assert.equal(capturedResult.opportunities.length, 0);
  assert.equal(replayedResult.opportunities.length, 0);
  assert.equal(replayedResult.decision, "observe_more");
  assert.match(
    replayedResult.issues.join(" "),
    /No organic post has a mature 72-hour insight window/u,
  );
});

test("complete social capture is current only through the exact 24-hour boundary", async () => {
  const source = await typedFacebookOnlyInputs();
  const exactBoundary = analyzeSocialLane({
    ...source,
    runAt: "2026-08-10T20:30:00-04:00",
  });
  const beyondBoundary = analyzeSocialLane({
    ...source,
    runAt: "2026-08-10T20:30:00.001-04:00",
  });
  assert.equal(exactBoundary.opportunities[0]?.kind, "social_experiment");
  assert.equal(beyondBoundary.opportunities.length, 0);
  assert.equal(
    beyondBoundary.metrics.find((item) => item.platform === "facebook")?.value,
    null,
  );
  assert.match(beyondBoundary.issues.join(" "), /not capture-current/u);
});

test("complete social evidence without capture-date freshness is observation-only", async () => {
  for (const freshnessGap of ["artifact", "source"] as const) {
    const source = await typedFacebookOnlyInputs();
    const evidence = structuredClone(source.evidence);
    const bundle = structuredClone(source.bundle);
    if (freshnessGap === "artifact") delete (evidence[0] as any).fresh_through;
    else delete (bundle.source_runs[0] as any).fresh_through;
    const result = analyzeSocialLane({
      bundle,
      evidence,
      runAt: "2026-08-09T21:00:00-04:00",
    });
    assert.equal(result.metrics.find((item) => item.platform === "facebook")?.value, null);
    assert.equal(result.opportunities.length, 0);
    assert.match(result.issues.join(" "), /exactly bound source\/artifact freshness/u);
  }
});

test("contact discovery deduplicates and never echoes a DNC identity", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const contact = evidence.find((item) => item.evidence_id === "evidence:contact:public");
  if (!contact || contact.lane !== "contact_discovery") assert.fail("expected contact fixture");
  const duplicate = {
    ...contact.payload.records[0]!,
    record_id: "contact-record:library-duplicate",
  };
  contact.payload.records.push(duplicate);
  let result = analyzeContactLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(
    result.metrics.find(
      (item) => item.metric_name === "deterministically_qualified_discovery_candidates",
    )?.value,
    1,
  );

  contact.payload.records[0]!.do_not_contact = true;
  contact.payload.records[0]!.organization_name = "Sensitive Parent Identity Do Not Echo";
  contact.payload.records[0]!.identity_hint = "sensitive-parent-identity-do-not-echo";
  contact.payload.records.splice(1);
  result = analyzeContactLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.opportunities.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /Sensitive Parent Identity|sensitive-parent-identity/u);
  assert.match(JSON.stringify(result), /contact-record:library/u);
});

test("incomplete contact and do-not-contact history cannot advance a candidate", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const contact = evidence.find(
    (item) => item.evidence_id === "evidence:contact:history",
  );
  if (!contact || contact.lane !== "contact_discovery") {
    assert.fail("expected contact-history fixture");
  }
  contact.payload.history_complete = false;
  const result = analyzeContactLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.status, "baseline_gap");
  assert.equal(result.opportunities.length, 0);
  assert.equal(
    result.metrics.find(
      (item) => item.metric_name === "deterministically_qualified_discovery_candidates",
    )?.value,
    1,
  );
});

test("contact history uses the project date across the evening UTC rollover", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const bundle = structuredClone(source.bundle);
  const history = evidence.find(
    (item) => item.evidence_id === "evidence:contact:history",
  );
  if (!history || history.lane !== "contact_discovery") {
    assert.fail("expected contact-history fixture");
  }
  history.captured_at = "2026-08-09T20:30:00-04:00";
  history.fresh_through = "2026-08-09";
  const declaration = bundle.evidence.find(
    (item) => item.evidence_id === history.evidence_id,
  );
  const sourceRun = bundle.source_runs.find((item) =>
    item.evidence_refs.includes(history.evidence_id),
  );
  assert.ok(declaration);
  assert.ok(sourceRun);
  declaration.captured_at = history.captured_at;
  declaration.fresh_through = history.fresh_through;
  sourceRun.started_at = history.captured_at;
  sourceRun.completed_at = history.captured_at;
  sourceRun.fresh_through = history.fresh_through;

  const result = analyzeContactLane({
    bundle,
    evidence,
    runAt: "2026-08-09T21:00:00-04:00",
  });
  assert.equal(result.status, "eligible");
  assert.equal(result.opportunities.length, 1);
});

test("prior and do-not-contact history compare only SHA-256 identity fingerprints", async () => {
  for (const historyField of [
    "prior_identity_fingerprints",
    "do_not_contact_identity_fingerprints",
  ] as const) {
    const source = await inputs();
    const evidence = structuredClone(source.evidence);
    const contact = evidence.find((item) => item.evidence_id === "evidence:contact:public");
    const history = evidence.find((item) => item.evidence_id === "evidence:contact:history");
    if (!contact || contact.lane !== "contact_discovery") assert.fail("expected contact fixture");
    if (!history || history.lane !== "contact_discovery") assert.fail("expected history fixture");
    const normalizedIdentity = normalizeContactIdentity(contact.payload.records[0]!);
    history.payload[historyField] = [
      fingerprintNormalizedContactIdentity(normalizedIdentity),
    ];
    const result = analyzeContactLane({ bundle: source.bundle, evidence, runAt });
    assert.equal(result.opportunities.length, 0);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(normalizedIdentity, "u"));
  }

  const raw = (await fixtureJson("contact-public.json")) as Record<string, any>;
  raw.payload.prior_identity_fingerprints = ["raw-normalized-identity"];
  assert.equal(EvidenceArtifactSchema.safeParse(raw).success, false);
});

test("minor or private-member capture quarantines the contact lane", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const contact = evidence.find((item) => item.evidence_id === "evidence:contact:public");
  if (!contact || contact.lane !== "contact_discovery") assert.fail("expected contact fixture");
  contact.payload.records[0]!.contains_minor_data = true;
  contact.payload.records[0]!.subject_type = "minor";
  const result = analyzeContactLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.status, "quarantined");
  assert.equal(result.opportunities.length, 0);
});

test("GSC fresh-through is required and multiple properties block analysis", async () => {
  const raw = (await fixtureJson("search-console.json")) as Record<string, unknown>;
  delete raw.fresh_through;
  assert.equal(SearchConsoleEvidenceArtifactSchema.safeParse(raw).success, false);

  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const search = evidence.find((item) => item.evidence_id === "evidence:gsc:property");
  if (
    !search ||
    search.lane !== "search_console" ||
    search.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  evidence.push({
    ...structuredClone(search),
    evidence_id: "evidence:gsc:second-property",
    property_id: "sc-domain:other.example",
    property_url: "https://other.example/",
  });
  const result = analyzeSearchConsoleLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.status, "quarantined");
  assert.equal(result.opportunities.length, 0);
});

test("GSC maturity windows use the project date after evening UTC rollover", async () => {
  const source = await inputs();
  const result = analyzeSearchConsoleLane({
    ...source,
    runAt: "2026-08-09T20:30:00-04:00",
  });
  const clicks = result.metrics.find(
    (item) => item.metric_name === "nonbrand_parent_intent_gsc_clicks_28d",
  );
  assert.equal(clicks?.window_start, "2026-07-10");
  assert.equal(clicks?.window_end, "2026-08-06");
});

test("protected learner paths block SEO advancement", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const search = evidence.find((item) => item.evidence_id === "evidence:gsc:property");
  if (
    !search ||
    search.lane !== "search_console" ||
    search.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  search.payload.page_inventory[1]!.indexable = true;
  search.payload.page_inventory[1]!.robots_allowed = true;
  const result = analyzeSearchConsoleLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.status, "quarantined");
  assert.equal(isProtectedIndexPath("https://codethefuture.net/platform/lesson"), true);
  for (const protectedPath of [
    "/play",
    "/studentdemos/project",
    "https://codethefuture.net/%70lay/session",
    "https://codethefuture.net/%2573tudentdemos/project",
    "/%2fplay/session",
  ]) {
    assert.equal(isProtectedIndexPath(protectedPath), true, protectedPath);
  }
});

test("Search Console performance rows on protected paths quarantine independently of inventory", async () => {
  const source = await inputs();
  const exactEvidence = structuredClone(source.evidence);
  const exact = exactEvidence.find(
    (item) => item.evidence_id === "evidence:gsc:property",
  );
  if (
    !exact ||
    exact.lane !== "search_console" ||
    exact.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  exact.payload.rows[0]!.page = "https://codethefuture.net/platform/";
  const exactResult = analyzeSearchConsoleLane({
    bundle: source.bundle,
    evidence: exactEvidence,
    runAt,
  });
  assert.equal(exactResult.status, "quarantined");
  assert.equal(exactResult.decision, "repair");
  assert.equal(exactResult.opportunities.length, 0);
  assert.match(
    exactResult.issues.join(" "),
    /Protected learner\/admin path categories appear in Search Console performance rows/u,
  );

  const summary = SearchConsoleSummaryEvidenceArtifactSchema.parse(
    await fixtureJson("search-console-summary-v1.1.json"),
  );
  summary.payload.tables.pages.rows[0]!.page =
    "https://codethefuture.net/studentdemos/project";
  const summaryBundle = structuredClone(source.bundle);
  const summaryRun = summaryBundle.source_runs.find(
    (run) => run.source === "search_console",
  );
  assert.ok(summaryRun);
  summaryRun.status = "verified_partial";
  summaryRun.data_state = "top_rows";
  summaryRun.account_or_property_id = summary.property_id;
  summaryRun.evidence_refs = [summary.evidence_id];
  const summaryResult = analyzeSearchConsoleLane({
    bundle: summaryBundle,
    evidence: [summary],
    runAt,
  });
  assert.equal(summaryResult.status, "quarantined");
  assert.equal(summaryResult.decision, "repair");
  assert.equal(summaryResult.opportunities.length, 0);
  assert.match(
    summaryResult.issues.join(" "),
    /Protected learner\/admin path categories appear in Search Console performance rows/u,
  );
});

test("unprotected pages cannot canonicalize into protected learner paths", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const search = evidence.find(
    (item) => item.evidence_id === "evidence:gsc:property",
  );
  if (
    !search ||
    search.lane !== "search_console" ||
    search.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  const protectedLocation =
    "https://codethefuture.net/studentdemos/Sensitive-Student-Name";
  search.payload.page_inventory[0]!.indexable = false;
  search.payload.page_inventory[0]!.canonical_url = protectedLocation;

  const result = analyzeSearchConsoleLane({
    bundle: source.bundle,
    evidence,
    runAt,
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.status, "quarantined");
  assert.equal(result.decision, "repair");
  assert.equal(result.opportunities.length, 0);
  assert.match(serialized, /\/studentdemos \(1\)/u);
  assert.doesNotMatch(serialized, /Sensitive-Student-Name|sensitive-student-name/u);
});

test("a non-indexable protected page may safely self-canonicalize", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const search = evidence.find(
    (item) => item.evidence_id === "evidence:gsc:property",
  );
  if (
    !search ||
    search.lane !== "search_console" ||
    search.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  search.payload.page_inventory[1] = {
    ...search.payload.page_inventory[1]!,
    indexable: false,
    robots_allowed: true,
    canonical_url: "https://codethefuture.net/platform/",
  };
  const result = analyzeSearchConsoleLane({
    bundle: source.bundle,
    evidence,
    runAt,
  });
  assert.notEqual(result.status, "quarantined");
  assert.doesNotMatch(
    result.issues.join(" "),
    /Protected learner\/admin path categories appear in indexable or canonical inventory/u,
  );
});

test("partial site inventory can block but never enable an SEO candidate", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const gsc = evidence.find(
    (item) => item.evidence_id === "evidence:gsc:property",
  );
  if (
    !gsc ||
    gsc.lane !== "search_console" ||
    gsc.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  gsc.payload.page_inventory[0]!.public_enrollment_page = false;
  const partialInventory = structuredClone(gsc);
  partialInventory.evidence_id = "evidence:site-inventory:partial";
  partialInventory.source = "site_inventory";
  partialInventory.data_state = "partial";
  partialInventory.payload.rows = [];
  partialInventory.payload.page_inventory = [
    {
      ...structuredClone(gsc.payload.page_inventory[0]!),
      public_enrollment_page: true,
    },
  ];
  evidence.push(partialInventory);

  const bundle = structuredClone(source.bundle);
  bundle.evidence.push({
    evidence_id: partialInventory.evidence_id,
    lane: "search_console",
    source: "site_inventory",
    artifact_path: "site-inventory-partial.json",
    artifact_sha256: "0".repeat(64),
    captured_at: partialInventory.captured_at,
    fresh_through: partialInventory.fresh_through,
    data_state: "partial",
    redaction_status: partialInventory.redaction_status,
    producer_mode: partialInventory.producer.mode,
  });
  bundle.source_runs.push({
    source_run_id: "source-run:site-inventory:partial",
    lane: "search_console",
    source: "site_inventory",
    account_or_property_id: partialInventory.property_id,
    status: "verified_partial",
    started_at: partialInventory.captured_at,
    completed_at: partialInventory.captured_at,
    fresh_through: partialInventory.fresh_through,
    data_state: "partial",
    records_captured: 1,
    evidence_refs: [partialInventory.evidence_id],
  });

  const result = analyzeSearchConsoleLane({ bundle, evidence, runAt });
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.status, "observe_more");
  for (const metric of result.metrics) {
    assert.equal(metric.evidence_refs.includes(partialInventory.evidence_id), false);
  }
});

test("GSC metrics remain null without complete inventory coverage for every in-window row", async () => {
  for (const inventoryState of ["empty", "partial_only"] as const) {
    const source = await inputs();
    const evidence = structuredClone(source.evidence);
    const gsc = evidence.find(
      (item) => item.evidence_id === "evidence:gsc:property",
    );
    if (
      !gsc ||
      gsc.lane !== "search_console" ||
      gsc.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
    ) {
      assert.fail("expected legacy GSC fixture");
    }
    const observedPage = structuredClone(gsc.payload.page_inventory[0]!);
    gsc.payload.page_inventory = [];
    const bundle = structuredClone(source.bundle);

    if (inventoryState === "partial_only") {
      const partialInventory = structuredClone(gsc);
      partialInventory.evidence_id = "evidence:site-inventory:partial-only";
      partialInventory.source = "site_inventory";
      partialInventory.data_state = "partial";
      partialInventory.payload.rows = [];
      partialInventory.payload.page_inventory = [observedPage];
      evidence.push(partialInventory);
      bundle.evidence.push({
        evidence_id: partialInventory.evidence_id,
        lane: "search_console",
        source: "site_inventory",
        artifact_path: "site-inventory-partial-only.json",
        artifact_sha256: "0".repeat(64),
        captured_at: partialInventory.captured_at,
        fresh_through: partialInventory.fresh_through,
        data_state: "partial",
        redaction_status: partialInventory.redaction_status,
        producer_mode: partialInventory.producer.mode,
      });
      bundle.source_runs.push({
        source_run_id: "source-run:site-inventory:partial-only",
        lane: "search_console",
        source: "site_inventory",
        account_or_property_id: partialInventory.property_id,
        status: "verified_partial",
        started_at: partialInventory.captured_at,
        completed_at: partialInventory.captured_at,
        fresh_through: partialInventory.fresh_through,
        data_state: "partial",
        records_captured: 1,
        evidence_refs: [partialInventory.evidence_id],
      });
    }

    const result = analyzeSearchConsoleLane({ bundle, evidence, runAt });
    assert.equal(result.status, "baseline_gap", inventoryState);
    assert.equal(result.opportunities.length, 0, inventoryState);
    assert.equal(result.metrics.every((item) => item.value === null), true, inventoryState);
    assert.equal(result.metrics.every((item) => item.complete === false), true, inventoryState);
    assert.match(
      result.issues.join(" "),
      /Verified-complete site inventory does not cover every in-window Search Console page row/u,
      inventoryState,
    );
  }
});

test("standalone site inventory requires conservatively bound source freshness", async () => {
  for (const freshness of [
    "fresh",
    "artifact_stale",
    "source_missing",
    "source_underclaim",
    "source_overclaim",
  ] as const) {
    const source = await inputs();
    const evidence = structuredClone(source.evidence);
    const gsc = evidence.find(
      (item) => item.evidence_id === "evidence:gsc:property",
    );
    if (
      !gsc ||
      gsc.lane !== "search_console" ||
      gsc.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
    ) {
      assert.fail("expected legacy GSC fixture");
    }
    const observedPage = structuredClone(gsc.payload.page_inventory[0]!);
    gsc.payload.page_inventory = [];

    const inventory = structuredClone(gsc);
    inventory.evidence_id = `evidence:site-inventory:${freshness}`;
    inventory.source = "site_inventory";
    inventory.fresh_through =
      freshness === "artifact_stale" ? "2026-08-05" : "2026-08-06";
    inventory.payload.rows = [];
    inventory.payload.page_inventory = [observedPage];
    evidence.push(inventory);

    const bundle = structuredClone(source.bundle);
    bundle.evidence.push({
      evidence_id: inventory.evidence_id,
      lane: "search_console",
      source: "site_inventory",
      artifact_path: `site-inventory-${freshness}.json`,
      artifact_sha256: "0".repeat(64),
      captured_at: inventory.captured_at,
      fresh_through: inventory.fresh_through,
      data_state: "complete",
      redaction_status: inventory.redaction_status,
      producer_mode: inventory.producer.mode,
    });
    const inventorySourceRun = {
      source_run_id: `source-run:site-inventory:${freshness}`,
      lane: "search_console",
      source: "site_inventory",
      account_or_property_id: inventory.property_id,
      status: "verified_complete",
      started_at: inventory.captured_at,
      completed_at: inventory.captured_at,
      fresh_through:
        freshness === "source_underclaim"
          ? "2026-08-05"
          : freshness === "source_overclaim"
            ? "2026-08-07"
            : inventory.fresh_through,
      data_state: "complete",
      records_captured: 1,
      evidence_refs: [inventory.evidence_id],
    } as (typeof bundle.source_runs)[number];
    if (freshness === "source_missing") {
      delete (inventorySourceRun as { fresh_through?: string }).fresh_through;
    }
    bundle.source_runs.push(inventorySourceRun);

    const result = analyzeSearchConsoleLane({ bundle, evidence, runAt });
    const clicks = result.metrics.find(
      (item) => item.metric_name === "nonbrand_parent_intent_gsc_clicks_28d",
    );
    if (freshness === "fresh") {
      assert.equal(clicks?.value, 10);
      assert.equal(clicks?.complete, true);
    } else {
      assert.equal(result.status, "baseline_gap");
      assert.equal(clicks?.value, null);
      assert.equal(clicks?.complete, false);
      assert.equal(result.opportunities.length, 0);
      assert.match(result.issues.join(" "), /Stale standalone site inventory/u);
    }
  }
});

test("GSC rows require source freshness bound to declarations and artifacts", async () => {
  for (const sourceFreshness of ["missing", "underclaim", "overclaim"] as const) {
    const source = await inputs();
    const bundle = structuredClone(source.bundle);
    const gscRun = bundle.source_runs.find(
      (item) => item.source === "search_console",
    );
    assert.ok(gscRun);
    if (sourceFreshness === "missing") {
      delete (gscRun as { fresh_through?: string }).fresh_through;
    } else {
      gscRun.fresh_through =
        sourceFreshness === "underclaim" ? "2026-08-05" : "2026-08-07";
    }

    const result = analyzeSearchConsoleLane({
      bundle,
      evidence: source.evidence,
      runAt,
    });
    const clicks = result.metrics.find(
      (item) => item.metric_name === "nonbrand_parent_intent_gsc_clicks_28d",
    );
    assert.equal(result.status, "baseline_gap", sourceFreshness);
    assert.equal(clicks?.value, null, sourceFreshness);
    assert.equal(clicks?.complete, false, sourceFreshness);
    assert.equal(result.opportunities.length, 0, sourceFreshness);
    assert.match(result.issues.join(" "), /Stale Search Console rows/u);
  }
});

test("stale GSC artifacts cannot supply embedded inventory or performance rows", async () => {
  for (const stalePayload of ["inventory", "performance"] as const) {
    const source = await inputs();
    const evidence = structuredClone(source.evidence);
    const current = evidence.find(
      (item) => item.evidence_id === "evidence:gsc:property",
    );
    if (
      !current ||
      current.lane !== "search_console" ||
      current.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
    ) {
      assert.fail("expected legacy GSC fixture");
    }
    const originalRows = structuredClone(current.payload.rows);
    const observedPage = structuredClone(current.payload.page_inventory[0]!);
    const stale = structuredClone(current);
    stale.evidence_id = `evidence:gsc:stale-${stalePayload}`;
    stale.fresh_through = "2026-08-04";
    stale.payload.date_window.end = "2026-08-04";

    if (stalePayload === "inventory") {
      current.payload.page_inventory = [];
      stale.payload.rows = [];
      stale.payload.page_inventory = [observedPage];
    } else {
      current.payload.rows = [];
      stale.payload.rows = originalRows.map((row, index) => ({
        ...row,
        date: index === 0 ? "2026-08-04" : "2026-08-03",
      }));
      stale.payload.page_inventory = [];
    }
    evidence.push(stale);

    const bundle = structuredClone(source.bundle);
    bundle.evidence.push({
      evidence_id: stale.evidence_id,
      lane: "search_console",
      source: "search_console",
      artifact_path: `search-console-stale-${stalePayload}.json`,
      artifact_sha256: "0".repeat(64),
      captured_at: stale.captured_at,
      fresh_through: stale.fresh_through,
      data_state: "complete",
      redaction_status: stale.redaction_status,
      producer_mode: stale.producer.mode,
    });
    bundle.source_runs.push({
      source_run_id: `source-run:gsc:stale-${stalePayload}`,
      lane: "search_console",
      source: "search_console",
      account_or_property_id: stale.property_id,
      status: "verified_complete",
      started_at: stale.captured_at,
      completed_at: stale.captured_at,
      fresh_through: stale.fresh_through,
      data_state: "complete",
      records_captured:
        stale.payload.rows.length + stale.payload.page_inventory.length,
      evidence_refs: [stale.evidence_id],
    });

    const result = analyzeSearchConsoleLane({ bundle, evidence, runAt });
    const clicks = result.metrics.find(
      (item) => item.metric_name === "nonbrand_parent_intent_gsc_clicks_28d",
    );
    assert.match(result.issues.join(" "), /Stale Search Console rows/u);
    assert.equal(result.opportunities.length, 0);
    if (stalePayload === "inventory") {
      assert.equal(clicks?.value, null);
      assert.equal(clicks?.complete, false);
    } else {
      assert.equal(clicks?.value, 0);
      assert.equal(clicks?.complete, true);
      assert.equal(clicks.evidence_refs.includes(stale.evidence_id), false);
    }
  }
});

test("Search Console property and every observed page must share one property host", async () => {
  for (const defect of ["property_url", "row_page"] as const) {
    const source = await inputs();
    const evidence = structuredClone(source.evidence);
    const search = evidence.find((item) => item.evidence_id === "evidence:gsc:property");
    if (
      !search ||
      search.lane !== "search_console" ||
      search.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
    ) {
      assert.fail("expected legacy GSC fixture");
    }
    if (defect === "property_url") {
      search.property_url = "https://outside.example/";
    } else {
      search.payload.rows[0]!.page = "https://outside.example/coding-class";
    }
    const result = analyzeSearchConsoleLane({ bundle: source.bundle, evidence, runAt });
    assert.equal(result.status, "quarantined");
    assert.equal(result.opportunities.length, 0);
    assert.match(result.issues.join(" "), /hosts do not match the attested property/u);
  }
});

test("v1.1 social evidence preserves unavailable fields and excludes native lookalikes", async () => {
  const raw = (await fixtureJson("social-facebook-partial-v1.1.json")) as Record<
    string,
    any
  >;
  const parsed = SocialEvidenceArtifactV1_1Schema.parse(raw);
  const observation = parsed.payload.partial_post_observations[0]!;
  assert.deepEqual(observation.metrics.reach, {
    state: "unavailable",
    reason: "not_exposed",
  });
  assert.deepEqual(observation.metrics.saves, {
    state: "observed",
    value: 0,
    native_field: "saves",
  });
  assert.equal(parsed.payload.assets.length, 0);

  const viewersAsReach = structuredClone(raw);
  viewersAsReach.payload.partial_post_observations[0].metrics.reach = {
    state: "observed",
    value: 50,
    native_field: "viewers",
  };
  assert.equal(SocialEvidenceArtifactV1_1Schema.safeParse(viewersAsReach).success, false);

  const commentsAsSubstantive = structuredClone(raw);
  commentsAsSubstantive.payload.partial_post_observations[0].metrics.substantive_comments = {
    state: "observed",
    value: 1,
    native_field: "comments",
  };
  assert.equal(
    SocialEvidenceArtifactV1_1Schema.safeParse(commentsAsSubstantive).success,
    false,
  );
});

test("social performance rows require the matching platform insight source", async () => {
  const raw = (await fixtureJson("social-facebook-partial-v1.1.json")) as Record<
    string,
    any
  >;
  for (const invalidSource of ["instagram_insights", "consent_registry"] as const) {
    const invalid = structuredClone(raw);
    invalid.source = invalidSource;
    assert.equal(
      SocialEvidenceArtifactV1_1Schema.safeParse(invalid).success,
      false,
      invalidSource,
    );
  }

  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const facebook = evidence.find(
    (artifact) => artifact.evidence_id === "evidence:social:facebook",
  );
  if (!facebook || facebook.lane !== "organic_social") {
    assert.fail("expected Facebook fixture");
  }
  facebook.source = "consent_registry";
  const result = analyzeSocialLane({ bundle: source.bundle, evidence, runAt });
  const facebookMetric = result.metrics.find(
    (item) => item.platform === "facebook",
  );
  assert.equal(facebookMetric?.value, null);
  assert.equal(facebookMetric?.complete, false);
  assert.equal(
    result.opportunities.some(
      (opportunity) =>
        opportunity.kind === "social_experiment" &&
        opportunity.platform === "facebook",
    ),
    false,
  );
  assert.match(
    result.issues.join(" "),
    /facebook performance evidence from a non-matching insight source was excluded/u,
  );
});

test("a newer partial social capture supersedes older complete rows without scoring", async () => {
  const source = await inputs();
  const facebook = source.evidence.find(
    (artifact) => artifact.evidence_id === "evidence:social:facebook",
  );
  if (
    !facebook ||
    facebook.lane !== "organic_social" ||
    facebook.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy Facebook fixture");
  }
  const partial = SocialEvidenceArtifactV1_1Schema.parse(
    await fixtureJson("social-facebook-partial-v1.1.json"),
  );
  partial.captured_at = "2026-08-09T14:45:00-04:00";
  partial.fresh_through = "2026-08-09";
  for (const observation of partial.payload.partial_post_observations) {
    observation.provenance.observed_at = "2026-08-09T14:44:00-04:00";
  }
  partial.payload.follower_snapshots = [];
  const template = partial.payload.partial_post_observations[0]!;
  partial.payload.partial_post_observations = facebook.payload.posts.map((post) => ({
    ...structuredClone(template),
    post_id: post.post_id,
    platform_content_id: post.post_id,
  }));
  const result = analyzeSocialLane({
    bundle: source.bundle,
    evidence: [facebook, partial],
    runAt,
  });
  assert.equal(result.opportunities.length, 0);
  assert.match(result.issues.join(" "), /retained as evidence and excluded from scoring/u);
  assert.match(result.issues.join(" "), /No organic post has a mature/u);

  const falselyComplete = structuredClone(partial);
  falselyComplete.data_state = "complete";
  assert.equal(SocialEvidenceArtifactV1_1Schema.safeParse(falselyComplete).success, false);
});

test("partial strict social and GSC rows are never decision inputs", async () => {
  const source = await inputs();
  const facebook = structuredClone(
    source.evidence.find(
      (artifact) => artifact.evidence_id === "evidence:social:facebook",
    )!,
  );
  if (
    facebook.lane !== "organic_social" ||
    facebook.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy Facebook fixture");
  }
  facebook.data_state = "partial";
  const social = analyzeSocialLane({
    bundle: source.bundle,
    evidence: [facebook],
    runAt,
  });
  assert.equal(social.opportunities.length, 0);
  assert.match(social.issues.join(" "), /No organic post has a mature/u);

  const gsc = structuredClone(
    source.evidence.find(
      (artifact) => artifact.evidence_id === "evidence:gsc:property",
    )!,
  );
  if (
    gsc.lane !== "search_console" ||
    gsc.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  gsc.data_state = "partial";
  const search = analyzeSearchConsoleLane({
    bundle: source.bundle,
    evidence: [gsc],
    runAt,
  });
  assert.equal(search.opportunities.length, 0);
  assert.equal(search.metrics.every((item) => item.value === null), true);
});

test("same-instant partial social evidence suppresses complete rows in either order", async () => {
  const source = await inputs();
  const facebook = source.evidence.find(
    (artifact) => artifact.evidence_id === "evidence:social:facebook",
  );
  if (
    !facebook ||
    facebook.lane !== "organic_social" ||
    facebook.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy Facebook fixture");
  }
  const partial = SocialEvidenceArtifactV1_1Schema.parse(
    await fixtureJson("social-facebook-partial-v1.1.json"),
  );
  partial.captured_at = facebook.captured_at;
  partial.payload.follower_snapshots = [];
  const template = partial.payload.partial_post_observations[0]!;
  partial.payload.partial_post_observations = facebook.payload.posts.map((post) => ({
    ...structuredClone(template),
    post_id: post.post_id,
    platform_content_id: post.post_id,
  }));
  for (const evidence of [
    [partial, facebook],
    [facebook, partial],
  ]) {
    const result = analyzeSocialLane({ bundle: source.bundle, evidence, runAt });
    assert.equal(result.opportunities.length, 0);
    assert.match(result.issues.join(" "), /No organic post has a mature/u);
  }
});

test("separate Search Console dimension tables cannot become fabricated scoring rows", async () => {
  const source = await inputs();
  const summary = SearchConsoleSummaryEvidenceArtifactSchema.parse(
    await fixtureJson("search-console-summary-v1.1.json"),
  );
  const bundle = structuredClone(source.bundle);
  const sourceRun = bundle.source_runs.find((run) => run.source === "search_console");
  assert.ok(sourceRun);
  sourceRun.status = "verified_partial";
  sourceRun.data_state = "top_rows";
  sourceRun.account_or_property_id = summary.property_id;
  sourceRun.evidence_refs = [summary.evidence_id];
  const result = analyzeSearchConsoleLane({ bundle, evidence: [summary], runAt });
  assert.equal(result.status, "baseline_gap");
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.metrics.every((item) => item.value === null), true);
  assert.match(result.issues.join(" "), /without fabricating/u);

  const falselyComplete = structuredClone(summary) as Record<string, unknown>;
  falselyComplete.data_state = "complete";
  assert.equal(
    SearchConsoleSummaryEvidenceArtifactSchema.safeParse(falselyComplete).success,
    false,
  );
  const falseDateCoverage = structuredClone(summary);
  falseDateCoverage.payload.tables.dates.coverage = "complete";
  assert.equal(
    SearchConsoleSummaryEvidenceArtifactSchema.safeParse(falseDateCoverage).success,
    false,
  );
});

test("partial GSC summaries do not poison current exact decision coverage", async () => {
  const source = await inputs();
  const exact = source.evidence.find(
    (artifact) => artifact.evidence_id === "evidence:gsc:property",
  );
  if (
    !exact ||
    exact.lane !== "search_console" ||
    exact.schema_version !== EVIDENCE_ATTESTATION_SCHEMA_VERSION
  ) {
    assert.fail("expected legacy GSC fixture");
  }
  const summary = SearchConsoleSummaryEvidenceArtifactSchema.parse(
    await fixtureJson("search-console-summary-v1.1.json"),
  );
  summary.property_id = exact.property_id;
  summary.property_url = exact.property_url;

  const bundle = structuredClone(source.bundle);
  bundle.evidence.push({
    evidence_id: summary.evidence_id,
    lane: "search_console",
    source: "search_console",
    artifact_path: "search-console-summary-v1.1.json",
    artifact_sha256: "0".repeat(64),
    captured_at: summary.captured_at,
    fresh_through: summary.fresh_through,
    data_state: summary.data_state,
    redaction_status: summary.redaction_status,
    producer_mode: summary.producer.mode,
  });
  bundle.source_runs.push({
    source_run_id: "source-run:gsc:summary-alongside-exact",
    lane: "search_console",
    source: "search_console",
    account_or_property_id: summary.property_id,
    status: "verified_partial",
    started_at: summary.captured_at,
    completed_at: summary.captured_at,
    fresh_through: summary.fresh_through,
    data_state: summary.data_state,
    records_captured: summary.payload.tables.pages.rows.length,
    evidence_refs: [summary.evidence_id],
  });

  const result = analyzeSearchConsoleLane({
    bundle,
    evidence: [...source.evidence, summary],
    runAt,
  });
  const clicks = result.metrics.find(
    (item) => item.metric_name === "nonbrand_parent_intent_gsc_clicks_28d",
  );
  assert.equal(result.source_coverage, "partial");
  assert.equal(result.status, "eligible");
  assert.equal(clicks?.value, 10);
  assert.equal(clicks?.complete, true);
  assert.equal(clicks?.evidence_refs.includes(summary.evidence_id), false);
  assert.equal(result.opportunities.length, 1);
  assert.match(result.issues.join(" "), /separate-dimension summary artifact/u);
});

test("GA4 has an independent property identity and complete-list zero semantics", async () => {
  const source = await inputs();
  const ga4 = Ga4EvidenceArtifactSchema.parse(await fixtureJson("ga4-v1.1.json"));
  const bundle = structuredClone(source.bundle);
  bundle.evidence.push({
    evidence_id: ga4.evidence_id,
    lane: "search_console",
    source: "ga4",
    artifact_path: "ga4-v1.1.json",
    artifact_sha256: "0".repeat(64),
    captured_at: ga4.captured_at,
    fresh_through: ga4.fresh_through,
    data_state: "complete",
    redaction_status: ga4.redaction_status,
    producer_mode: ga4.producer.mode,
  });
  bundle.source_runs.push({
    source_run_id: "source-run:ga4",
    lane: "search_console",
    source: "ga4",
    account_or_property_id: ga4.property_id,
    status: "verified_complete",
    started_at: ga4.captured_at,
    completed_at: ga4.captured_at,
    fresh_through: ga4.fresh_through,
    data_state: "complete",
    records_captured: ga4.payload.events.length,
    evidence_refs: [ga4.evidence_id],
  });
  const result = analyzeSearchConsoleLane({
    bundle,
    evidence: [...source.evidence, ga4],
    runAt,
  });
  assert.doesNotMatch(result.issues.join(" "), /Multiple Search Console properties/u);
  assert.doesNotMatch(result.issues.join(" "), /GA4 stream/u);
  assert.doesNotMatch(result.issues.join(" "), /GA4 evidence does not cover/u);
  assert.doesNotMatch(result.issues.join(" "), /GA4 source-run provenance/u);
  assert.notEqual(result.status, "quarantined");
  assert.equal(ga4.payload.counts.generate_lead.state, "observed");
  assert.equal(ga4.payload.counts.generate_lead.value, 0);

  const unavailableComplete = structuredClone(ga4);
  unavailableComplete.stream = {
    state: "unavailable",
    reason: "not_exposed_in_report",
  };
  assert.equal(Ga4EvidenceArtifactSchema.safeParse(unavailableComplete).success, false);

  const unavailablePartial = structuredClone(unavailableComplete);
  unavailablePartial.data_state = "partial";
  assert.equal(Ga4EvidenceArtifactSchema.safeParse(unavailablePartial).success, true);

  const unknownScopeComplete = structuredClone(ga4);
  unknownScopeComplete.payload.traffic_scope = "unknown";
  assert.equal(Ga4EvidenceArtifactSchema.safeParse(unknownScopeComplete).success, false);
  unknownScopeComplete.data_state = "partial";
  assert.equal(Ga4EvidenceArtifactSchema.safeParse(unknownScopeComplete).success, true);

  const wrongHost = structuredClone(ga4);
  if (wrongHost.stream.state !== "verified") assert.fail("expected verified stream");
  wrongHost.stream.stream_url = "https://outside.example/";
  const wrongHostResult = analyzeSearchConsoleLane({
    bundle,
    evidence: [...source.evidence, wrongHost],
    runAt,
  });
  assert.match(
    wrongHostResult.issues.join(" "),
    /GA4 stream host does not match the Search Console site context/u,
  );

  const stale = structuredClone(ga4);
  stale.fresh_through = "2026-07-01";
  stale.payload.date_window = { start: "2026-06-01", end: "2026-07-01" };
  assert.equal(Ga4EvidenceArtifactSchema.safeParse(stale).success, true);
  const staleResult = analyzeSearchConsoleLane({
    bundle,
    evidence: [...source.evidence, stale],
    runAt,
  });
  assert.match(
    staleResult.issues.join(" "),
    /GA4 evidence does not cover the current mature window/u,
  );

  const badWindow = structuredClone(ga4);
  badWindow.payload.date_window.end = "2026-08-08";
  assert.equal(Ga4EvidenceArtifactSchema.safeParse(badWindow).success, false);

  const incompleteAbsence = structuredClone(ga4);
  incompleteAbsence.data_state = "partial";
  incompleteAbsence.payload.event_rows_coverage = "partial";
  assert.equal(Ga4EvidenceArtifactSchema.safeParse(incompleteAbsence).success, false);
});

test("legacy v1 GA4 stays parseable but cannot influence search analysis", async () => {
  const source = await inputs();
  const legacyGa4 = (await fixtureJson("search-console.json")) as Record<
    string,
    any
  >;
  legacyGa4.evidence_id = "evidence:ga4:legacy-v1";
  legacyGa4.source = "ga4";
  legacyGa4.property_id = "legacy-ga4-property";
  const parsed = EvidenceArtifactSchema.parse(legacyGa4);
  const result = analyzeSearchConsoleLane({
    bundle: source.bundle,
    evidence: [...source.evidence, parsed],
    runAt,
  });
  assert.match(result.issues.join(" "), /Legacy v1 GA4 evidence/u);
  assert.doesNotMatch(result.issues.join(" "), /Multiple Search Console properties/u);
});
