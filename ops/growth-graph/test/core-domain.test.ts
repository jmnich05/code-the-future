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
  isProtectedIndexPath,
  normalizeContactIdentity,
} from "../src/domain.js";
import {
  CaptureBundleSchema,
  type EvidenceArtifact,
  EvidenceArtifactSchema,
  SearchConsoleEvidenceArtifactSchema,
} from "../src/schema.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const runAt = "2026-08-08T16:00:00-04:00";

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
      "search-console.json",
    ].map(async (name) => EvidenceArtifactSchema.parse(await fixtureJson(name))),
  );
  return { bundle, evidence };
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

test("paid-influenced follower snapshots never become an organic baseline", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const instagram = evidence.find((item) => item.evidence_id === "evidence:social:instagram");
  if (!instagram || instagram.lane !== "organic_social") assert.fail("expected social fixture");
  instagram.payload.follower_snapshots[1]!.paid_influence = "mixed";
  const result = analyzeSocialLane({ bundle: source.bundle, evidence, runAt });
  assert.equal(result.status, "baseline_gap");
  assert.equal(result.metrics.find((item) => item.platform === "instagram")?.value, null);
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

test("prior and do-not-contact history compare only SHA-256 identity fingerprints", async () => {
  for (const historyField of [
    "prior_identity_fingerprints",
    "do_not_contact_identity_fingerprints",
  ] as const) {
    const source = await inputs();
    const evidence = structuredClone(source.evidence);
    const contact = evidence.find((item) => item.evidence_id === "evidence:contact:public");
    if (!contact || contact.lane !== "contact_discovery") assert.fail("expected contact fixture");
    const normalizedIdentity = normalizeContactIdentity(contact.payload.records[0]!);
    contact.payload[historyField] = [
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
  if (!search || search.lane !== "search_console") assert.fail("expected GSC fixture");
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

test("protected learner paths block SEO advancement", async () => {
  const source = await inputs();
  const evidence = structuredClone(source.evidence);
  const search = evidence.find((item) => item.evidence_id === "evidence:gsc:property");
  if (!search || search.lane !== "search_console") assert.fail("expected GSC fixture");
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

test("Search Console property and every observed page must share one property host", async () => {
  for (const defect of ["property_url", "row_page"] as const) {
    const source = await inputs();
    const evidence = structuredClone(source.evidence);
    const search = evidence.find((item) => item.evidence_id === "evidence:gsc:property");
    if (!search || search.lane !== "search_console") assert.fail("expected GSC fixture");
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
