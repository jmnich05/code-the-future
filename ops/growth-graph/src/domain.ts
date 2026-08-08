import { createHash } from "node:crypto";

import {
  CONSENT_REVOCATION_CHECK_MAX_AGE_MS,
  type ContactEvidenceArtifactSchema,
  type EvidenceArtifact,
  type GrowthCaptureBundle,
  type LaneAnalysis,
  LaneAnalysisSchema,
  type MetricSnapshot,
  type OpportunityCandidate,
  PORTFOLIO_ANALYSIS_SCHEMA_VERSION,
  type PortfolioAnalysis,
  PortfolioAnalysisSchema,
  type SearchConsoleEvidenceArtifactSchema,
  type SocialEvidenceArtifactSchema,
} from "./schema.js";
import type { z } from "zod";

type SocialEvidence = z.infer<typeof SocialEvidenceArtifactSchema>;
type ContactEvidence = z.infer<typeof ContactEvidenceArtifactSchema>;
type SearchEvidence = z.infer<typeof SearchConsoleEvidenceArtifactSchema>;

const DAY_MS = 86_400_000;
const SOCIAL_MATURITY_MS = 72 * 60 * 60 * 1_000;
const CONTACT_FRESHNESS_MS = 7 * DAY_MS;
const PROTECTED_INDEX_PATHS = [
  "/platform",
  "/play",
  "/studentdemos",
  "/curriculum",
  "/admin",
  "/docs",
  "/api",
  "/checkout-success",
] as const;
const BRAND_QUERY = /\b(?:code\s*the\s*future|codethefuture|code\s*future\s*louisville)\b/i;
const PARENT_INTENT_QUERY =
  /\b(?:ai|coding|computer|stem|technology|summer|camp|class|classes|club|program|kids?|children|child|youth|teen|parent|louisville)\b/i;

function stableId(prefix: string, parts: readonly string[]): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 20);
  return `${prefix}:${digest}`;
}

function fingerprint(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function instant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Validated instant could not be parsed");
  return parsed;
}

function isoDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function laneEvidenceIds(evidence: readonly EvidenceArtifact[], lane: LaneAnalysis["lane"]): string[] {
  return evidence
    .filter((artifact) => artifact.lane === lane)
    .map((artifact) => artifact.evidence_id)
    .sort((left, right) => left.localeCompare(right));
}

function sourceCoverage(
  bundle: GrowthCaptureBundle,
  lane: LaneAnalysis["lane"],
): LaneAnalysis["source_coverage"] {
  const runs = bundle.source_runs.filter((run) => run.lane === lane);
  if (runs.length === 0) return "missing";
  return runs.every(
    (run) => run.status === "verified_complete" && run.data_state === "complete",
  )
    ? "complete"
    : "partial";
}

function metric(input: MetricSnapshot): MetricSnapshot {
  return input;
}

function candidate(input: OpportunityCandidate): OpportunityCandidate {
  return input;
}

export function isProtectedIndexPath(urlOrPath: string): boolean {
  let pathname = urlOrPath;
  try {
    pathname = new URL(urlOrPath).pathname;
  } catch {
    pathname = urlOrPath.split(/[?#]/u, 1)[0] ?? urlOrPath;
  }
  for (let pass = 0; pass < 5; pass += 1) {
    try {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    } catch {
      break;
    }
  }
  const pathOnly = pathname.split(/[?#]/u, 1)[0] ?? pathname;
  const segments: string[] = [];
  for (const segment of pathOnly.replace(/\\/gu, "/").split(/\/+/u)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  const normalized = `/${segments.join("/")}`.toLowerCase();
  return PROTECTED_INDEX_PATHS.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function normalizeContactIdentity(input: {
  organization_name: string;
  contact_label?: string | undefined;
  public_contact_channel?: string | undefined;
  identity_hint?: string | undefined;
}): string {
  const normalize = (value: string): string =>
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .trim()
      .replace(/\s+/gu, "-");
  if (input.identity_hint) return normalize(input.identity_hint);
  let channel = input.public_contact_channel ?? "";
  try {
    const url = new URL(channel.includes("://") ? channel : `https://${channel}`);
    channel = `${url.hostname.replace(/^www\./u, "")}${url.pathname.replace(/\/$/u, "")}`;
  } catch {
    channel = channel.toLowerCase();
  }
  return [input.organization_name, input.contact_label ?? "", channel]
    .map(normalize)
    .filter(Boolean)
    .join(":");
}

export function fingerprintNormalizedContactIdentity(identity: string): string {
  return fingerprint([identity]);
}

function socialConsentSafe(
  artifact: SocialEvidence,
  runAtMs: number,
): { safe: boolean; issues: string[] } {
  const issues: string[] = [];
  const assets = new Map(artifact.payload.assets.map((asset) => [asset.asset_id, asset]));
  const consents = new Map(
    artifact.payload.consents.map((consent) => [consent.consent_id, consent]),
  );

  for (const post of artifact.payload.posts) {
    for (const assetId of post.asset_refs) {
      const asset = assets.get(assetId);
      if (!asset) {
        issues.push(`Post ${post.post_id} references missing asset ${assetId}`);
        continue;
      }
      if (asset.subject_classification === "no_person") continue;
      const requiredBasis =
        asset.subject_classification === "adult_only" ? "adult" : "guardian";
      const scopedConsent = asset.consent_refs
        .map((consentId) => consents.get(consentId))
        .find(
          (consent) =>
            consent !== undefined &&
            consent.asset_id === asset.asset_id &&
            consent.subject_basis === requiredBasis &&
            consent.allowed_channels.includes(artifact.platform) &&
            asset.media_kinds.every((kind) => consent.allowed_media.includes(kind)) &&
            instant(consent.granted_at) <= runAtMs &&
            instant(consent.revocation_checked_at) <= runAtMs &&
            runAtMs - instant(consent.revocation_checked_at) <=
              CONSENT_REVOCATION_CHECK_MAX_AGE_MS &&
            (!consent.expires_at || instant(consent.expires_at) > runAtMs) &&
            (!consent.revoked_at || instant(consent.revoked_at) > runAtMs),
        );
      if (!scopedConsent) {
        issues.push(
          `Asset ${asset.asset_id} lacks active ${artifact.platform}-scoped consent`,
        );
      }
    }
  }
  return { safe: issues.length === 0, issues };
}

export function analyzeSocialLane(input: {
  bundle: GrowthCaptureBundle;
  evidence: EvidenceArtifact[];
  runAt: string;
}): LaneAnalysis {
  const artifacts = input.evidence.filter(
    (artifact): artifact is SocialEvidence => artifact.lane === "organic_social",
  );
  const evidenceRefs = laneEvidenceIds(input.evidence, "organic_social");
  const coverage = sourceCoverage(input.bundle, "organic_social");
  const runAtMs = instant(input.runAt);
  const windowStart = input.bundle.objective_window.start;
  const windowEnd = input.bundle.objective_window.end;
  const issues: string[] = [];
  const metrics: MetricSnapshot[] = [];
  let privacyUnsafe = false;
  let accountConflict = false;
  let matureOrganicPostCount = 0;
  let completeComparisonCount = 0;
  const opportunityInputs: Array<{
    platform: "instagram" | "facebook";
    postId: string;
    accountId: string;
    score: number;
    controlledVariable: string;
    evidenceId: string;
  }> = [];

  for (const platform of ["instagram", "facebook"] as const) {
    const platformArtifacts = artifacts.filter((artifact) => artifact.platform === platform);
    const experimentArms = new Map<string, Map<string, number>>();
    if (platformArtifacts.length === 0) {
      issues.push(`Missing ${platform} evidence`);
      metrics.push(
        metric({
          metric_id: `social-followers:${platform}`,
          lane: "organic_social",
          metric_name: "organic_net_new_followers_60d",
          platform,
          value: null,
          unit: "count",
          window_start: windowStart,
          window_end: windowEnd,
          complete: false,
          evidence_refs: evidenceRefs.length > 0 ? evidenceRefs : ["missing:evidence"],
        }),
      );
      continue;
    }
    const platformAccounts = new Set(platformArtifacts.map((artifact) => artifact.account_id));
    if (platformAccounts.size > 1) {
      accountConflict = true;
      issues.push(`Multiple ${platform} accounts cannot form one growth baseline`);
    }

    const snapshots = platformArtifacts
      .flatMap((artifact) => artifact.payload.follower_snapshots)
      .filter((snapshot) => {
        const day = snapshot.recorded_at.slice(0, 10);
        return day >= windowStart && day <= windowEnd;
      })
      .sort((left, right) => instant(left.recorded_at) - instant(right.recorded_at));
    const opening = snapshots[0];
    const closing = snapshots.at(-1);
    const organicSnapshots = snapshots.every((snapshot) => snapshot.paid_influence === "none");
    const complete =
      coverage === "complete" &&
      snapshots.length >= 2 &&
      opening !== undefined &&
      closing !== undefined &&
      opening.recorded_at !== closing.recorded_at &&
      organicSnapshots;
    if (!complete) {
      issues.push(`Incomplete organic follower baseline for ${platform}`);
    }
    metrics.push(
      metric({
        metric_id: `social-followers:${platform}`,
        lane: "organic_social",
        metric_name: "organic_net_new_followers_60d",
        platform,
        value: complete ? closing.followers - opening.followers : null,
        unit: "count",
        window_start: windowStart,
        window_end: windowEnd,
        complete,
        evidence_refs: platformArtifacts.map((artifact) => artifact.evidence_id),
      }),
    );

    const latestPosts = new Map<
      string,
      {
        post: SocialEvidence["payload"]["posts"][number];
        accountId: string;
        evidenceId: string;
      }
    >();
    for (const artifact of [...platformArtifacts].sort(
      (left, right) => instant(left.captured_at) - instant(right.captured_at),
    )) {
      const consent = socialConsentSafe(artifact, runAtMs);
      if (!consent.safe) privacyUnsafe = true;
      issues.push(...consent.issues);
      for (const post of artifact.payload.posts) {
        latestPosts.set(post.post_id, {
          post,
          accountId: artifact.account_id,
          evidenceId: artifact.evidence_id,
        });
      }
    }
    const mature = [...latestPosts.values()].filter(
      ({ post }) =>
        post.paid_status === "organic" &&
        runAtMs - instant(post.published_at) >= SOCIAL_MATURITY_MS,
    );
    matureOrganicPostCount += mature.length;
    for (const { post, accountId, evidenceId } of mature) {
      if (post.experiment_id && post.arm && post.controlled_variable) {
        const experimentKey = `${post.experiment_id}:${post.controlled_variable}`;
        const arms = experimentArms.get(experimentKey) ?? new Map<string, number>();
        arms.set(post.arm, (arms.get(post.arm) ?? 0) + 1);
        experimentArms.set(experimentKey, arms);
      }
      const highIntent = post.shares + post.saves + post.substantive_comments;
      const highIntentRate = post.reach > 0 ? highIntent / post.reach : 0;
      const negativeRate =
        post.reach > 0 ? (post.unfollows + post.hides + post.reports) / post.reach : 0;
      const score = clampScore(highIntentRate * 1_000 - negativeRate * 2_000 + 50);
      opportunityInputs.push({
        platform,
        postId: post.post_id,
        accountId,
        score,
        controlledVariable: post.controlled_variable ?? "hook",
        evidenceId,
      });
    }
    completeComparisonCount += [...experimentArms.values()].filter(
      (arms) => [...arms.values()].filter((count) => count >= 3).length >= 2,
    ).length;
  }

  if (matureOrganicPostCount === 0) {
    issues.push("No organic post has a mature 72-hour insight window");
  }
  if (matureOrganicPostCount > 0 && completeComparisonCount === 0) {
    issues.push(
      "No platform has two comparable experiment arms with at least three mature executions each",
    );
  }

  opportunityInputs.sort(
    (left, right) => right.score - left.score || left.postId.localeCompare(right.postId),
  );
  const best = opportunityInputs[0];
  const opportunities: OpportunityCandidate[] =
    best && !privacyUnsafe && !accountConflict
      ? [
          candidate({
            candidate_id: stableId("social", [best.platform, best.postId, best.controlledVariable]),
            lane: "organic_social",
            kind: "social_experiment",
            summary: `Test one ${best.controlledVariable} variation on ${best.platform}, anchored to mature organic post ${best.postId}; keep paid distribution separate and remeasure after 72 hours.`,
            score: best.score,
            controlled_variable: best.controlledVariable,
            evidence_refs: [best.evidenceId],
            platform: best.platform,
            account_id: best.accountId,
            anchor_post_id: best.postId,
          }),
        ]
      : [];

  const baselineComplete = metrics.every((item) => item.complete);
  const status: LaneAnalysis["status"] = privacyUnsafe || accountConflict
    ? "quarantined"
    : !baselineComplete
      ? "baseline_gap"
      : matureOrganicPostCount === 0
        ? "observe_more"
        : "eligible";
  const decision: LaneAnalysis["decision"] = privacyUnsafe || accountConflict
    ? "stop"
    : !baselineComplete || matureOrganicPostCount === 0
      ? "observe_more"
      : completeComparisonCount > 0
        ? "propose_scale"
        : "repeat";

  return LaneAnalysisSchema.parse({
    lane: "organic_social",
    status,
    decision,
    source_coverage: coverage,
    issues: [...new Set(issues)],
    evidence_refs: evidenceRefs,
    metrics,
    opportunities,
  });
}

function permissionMatches(record: ContactEvidence["payload"]["records"][number]): boolean {
  if (record.source_visibility !== "public") return false;
  switch (record.subject_type) {
    case "organization":
      return record.permission_basis === "public_org_channel";
    case "public_group_admin":
      return record.permission_basis === "public_group_admin_channel";
    case "parent_opt_in":
      return record.permission_basis === "direct_parent_opt_in";
    case "parent_referral":
      return record.permission_basis === "introduced_referral_with_permission";
    default:
      return false;
  }
}

export function analyzeContactLane(input: {
  bundle: GrowthCaptureBundle;
  evidence: EvidenceArtifact[];
  runAt: string;
}): LaneAnalysis {
  const artifacts = input.evidence.filter(
    (artifact): artifact is ContactEvidence => artifact.lane === "contact_discovery",
  );
  const evidenceRefs = laneEvidenceIds(input.evidence, "contact_discovery");
  const coverage = sourceCoverage(input.bundle, "contact_discovery");
  const runAtMs = instant(input.runAt);
  const issues: string[] = [];
  const prior = new Set<string>();
  const blocked = new Set<string>();
  let historyComplete = artifacts.length > 0;
  let privacyUnsafe = false;

  for (const artifact of artifacts) {
    historyComplete &&= artifact.payload.history_complete;
    artifact.payload.prior_identity_fingerprints.forEach((value) => prior.add(value));
    artifact.payload.do_not_contact_identity_fingerprints.forEach((value) =>
      blocked.add(value),
    );
  }

  const merged = new Map<
    string,
    {
      record: ContactEvidence["payload"]["records"][number];
      evidenceRefs: Set<string>;
      score: number;
    }
  >();
  for (const artifact of artifacts) {
    for (const record of artifact.payload.records) {
      const identity = normalizeContactIdentity(record);
      const identityFingerprint = fingerprintNormalizedContactIdentity(identity);
      const age = runAtMs - instant(record.verified_at);
      if (
        record.contains_minor_data ||
        record.subject_type === "minor" ||
        record.subject_type === "private_group_member" ||
        record.subject_type === "personal_parent_profile" ||
        record.source_visibility === "private"
      ) {
        privacyUnsafe = true;
        issues.push(`Privacy-unsafe discovery record rejected: ${record.record_id}`);
        continue;
      }
      if (age < 0 || age > CONTACT_FRESHNESS_MS) {
        issues.push(`Discovery record is not verified within seven days: ${record.record_id}`);
        continue;
      }
      if (!permissionMatches(record)) {
        issues.push(`Unsupported permission basis: ${record.record_id}`);
        continue;
      }
      if (record.do_not_contact || blocked.has(identityFingerprint)) {
        issues.push(`Do-not-contact record preserved and blocked: ${record.record_id}`);
        continue;
      }
      if (prior.has(identityFingerprint)) continue;
      if (record.source_type === "public_group_admin" && !record.group_rules_captured) {
        issues.push(`Group rules missing for any future group-post proposal: ${record.record_id}`);
      }
      const score = clampScore(
        ((record.mission_fit +
          record.louisville_relevance +
          record.parent_community_access +
          record.actionability) /
          20) *
          100,
      );
      const current = merged.get(identity);
      if (current) {
        current.evidenceRefs.add(artifact.evidence_id);
        if (score > current.score) {
          current.record = record;
          current.score = score;
        }
      } else {
        merged.set(identity, {
          record,
          evidenceRefs: new Set([artifact.evidence_id]),
          score,
        });
      }
    }
  }

  if (!historyComplete) issues.push("Prior contact and do-not-contact history is incomplete");
  const qualified = [...merged.entries()].sort(
    ([leftId, left], [rightId, right]) => right.score - left.score || leftId.localeCompare(rightId),
  );
  const primaryMetric = metric({
    metric_id: "contacts:approved-qualified",
    lane: "contact_discovery",
    metric_name: "approved_qualified_discovery_records_60d",
    value: null,
    unit: "count",
    window_start: input.bundle.objective_window.start,
    window_end: input.bundle.objective_window.end,
    complete: false,
    evidence_refs: evidenceRefs.length > 0 ? evidenceRefs : ["missing:evidence"],
  });
  const driverMetric = metric({
    metric_id: "contacts:deterministic-candidates",
    lane: "contact_discovery",
    metric_name: "deterministically_qualified_discovery_candidates",
    value: qualified.length,
    unit: "count",
    complete: coverage === "complete" && historyComplete && !privacyUnsafe,
    evidence_refs: evidenceRefs.length > 0 ? evidenceRefs : ["missing:evidence"],
  });
  const best = qualified[0];
  const opportunities: OpportunityCandidate[] =
    best && !privacyUnsafe
      ? [
          candidate({
            candidate_id: stableId("contact", [best[0]]),
            lane: "contact_discovery",
            kind: "contact_discovery",
            summary: `Review ${best[1].record.organization_name} as a permission-safe public discovery record; this authorizes neither outreach nor a group post.`,
            score: best[1].score,
            controlled_variable: "discovery_source_lane",
            evidence_refs: [...best[1].evidenceRefs].sort(),
            record_id: best[1].record.record_id,
            identity_fingerprint: fingerprintNormalizedContactIdentity(best[0]),
            organization_name: best[1].record.organization_name,
            ...(best[1].record.public_contact_channel
              ? { destination: best[1].record.public_contact_channel }
              : {}),
            source_url: best[1].record.source_url,
            group_rules_captured: best[1].record.group_rules_captured,
            ...(best[1].record.group_rules_url
              ? { group_rules_url: best[1].record.group_rules_url }
              : {}),
          }),
        ]
      : [];

  const status: LaneAnalysis["status"] = privacyUnsafe
    ? "quarantined"
    : coverage !== "complete" || !historyComplete
      ? "baseline_gap"
      : "eligible";

  return LaneAnalysisSchema.parse({
    lane: "contact_discovery",
    status,
    decision: privacyUnsafe ? "stop" : status === "eligible" ? "repeat" : "observe_more",
    source_coverage: coverage,
    issues: [...new Set(issues)],
    evidence_refs: evidenceRefs,
    metrics: [primaryMetric, driverMetric],
    opportunities,
  });
}

function isParentIntentQuery(query: string): boolean {
  return !BRAND_QUERY.test(query) && PARENT_INTENT_QUERY.test(query);
}

function normalizedHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/u, "");
  } catch {
    return undefined;
  }
}

function searchPropertyHostScope(
  artifact: SearchEvidence,
): { host: string; includeSubdomains: boolean } | undefined {
  const propertyUrlHost = normalizedHostname(artifact.property_url);
  if (!propertyUrlHost) return undefined;
  const domainProperty = /^sc-domain:(.+)$/iu.exec(artifact.property_id);
  if (domainProperty?.[1]) {
    const domain = domainProperty[1].toLowerCase().replace(/\.$/u, "");
    if (propertyUrlHost !== domain && !propertyUrlHost.endsWith(`.${domain}`)) {
      return undefined;
    }
    return { host: domain, includeSubdomains: true };
  }
  const prefixPropertyHost = normalizedHostname(artifact.property_id);
  if (!prefixPropertyHost || prefixPropertyHost !== propertyUrlHost) return undefined;
  return { host: propertyUrlHost, includeSubdomains: false };
}

function hostIsInScope(
  candidateUrl: string,
  scope: { host: string; includeSubdomains: boolean },
): boolean {
  const candidate = normalizedHostname(candidateUrl);
  if (!candidate) return false;
  return (
    candidate === scope.host ||
    (scope.includeSubdomains && candidate.endsWith(`.${scope.host}`))
  );
}

function searchArtifactHostsMatchProperty(artifact: SearchEvidence): boolean {
  const scope = searchPropertyHostScope(artifact);
  if (!scope) return false;
  return (
    artifact.payload.rows.every((row) => hostIsInScope(row.page, scope)) &&
    artifact.payload.page_inventory.every(
      (page) =>
        hostIsInScope(page.url, scope) &&
        (!page.canonical_url || hostIsInScope(page.canonical_url, scope)),
    )
  );
}

export function analyzeSearchConsoleLane(input: {
  bundle: GrowthCaptureBundle;
  evidence: EvidenceArtifact[];
  runAt: string;
}): LaneAnalysis {
  const artifacts = input.evidence.filter(
    (artifact): artifact is SearchEvidence => artifact.lane === "search_console",
  );
  const evidenceRefs = laneEvidenceIds(input.evidence, "search_console");
  const coverage = sourceCoverage(input.bundle, "search_console");
  const runAtMs = instant(input.runAt);
  const matureEnd = isoDate(runAtMs - 3 * DAY_MS);
  const windowStart = isoDate(runAtMs - 30 * DAY_MS);
  const issues: string[] = [];
  const properties = new Set(artifacts.map((artifact) => artifact.property_id));
  const propertyConflict = properties.size > 1;
  if (propertyConflict) issues.push("Multiple Search Console properties cannot form one baseline");
  const propertyHostConflict = artifacts.some(
    (artifact) => !searchArtifactHostsMatchProperty(artifact),
  );
  if (propertyHostConflict) {
    issues.push("Search Console page hosts do not match the attested property");
  }

  const inventory = new Map(
    artifacts.flatMap((artifact) => artifact.payload.page_inventory).map((page) => [page.url, page]),
  );
  const unsafeIndexed = [...inventory.values()].filter(
    (page) => page.indexable && isProtectedIndexPath(page.url),
  );
  if (unsafeIndexed.length > 0) {
    issues.push(
      `Protected learner/admin paths appear indexable: ${unsafeIndexed
        .map((page) => new URL(page.url).pathname)
        .join(", ")}`,
    );
  }

  const sourceMetadataComplete =
    coverage === "complete" &&
    artifacts.some(
      (artifact) =>
        artifact.source === "search_console" &&
        artifact.data_state === "complete" &&
        artifact.fresh_through >= matureEnd &&
        artifact.payload.date_window.start <= windowStart &&
        artifact.payload.date_window.end >= matureEnd &&
        !propertyConflict &&
        !propertyHostConflict,
    );
  if (artifacts.some((artifact) => artifact.data_state === "top_rows")) {
    issues.push("Search Console export contains top rows rather than complete coverage");
  }
  if (
    artifacts.some(
      (artifact) => artifact.fresh_through && artifact.fresh_through > matureEnd,
    )
  ) {
    issues.push("Rows newer than the three-day maturity cutoff are excluded from decisions");
  }

  const uniqueRows = new Map<
    string,
    {
      row: SearchEvidence["payload"]["rows"][number];
      evidenceIds: Set<string>;
    }
  >();
  let rowConflict = false;
  for (const artifact of artifacts.filter((item) => item.source === "search_console")) {
    for (const row of artifact.payload.rows) {
      const key = [row.date, row.query, row.page, row.country, row.device].join("\u0000");
      const current = uniqueRows.get(key);
      if (!current) {
        uniqueRows.set(key, { row, evidenceIds: new Set([artifact.evidence_id]) });
        continue;
      }
      current.evidenceIds.add(artifact.evidence_id);
      if (
        current.row.clicks !== row.clicks ||
        current.row.impressions !== row.impressions ||
        current.row.position !== row.position
      ) {
        rowConflict = true;
      }
    }
  }
  if (rowConflict) {
    issues.push("Conflicting duplicate Search Console rows block metric calculation");
  }
  const sourceComplete = sourceMetadataComplete && !rowConflict;
  if (!sourceComplete) {
    issues.push("Search Console query/page baseline is partial, stale, or does not cover 28 mature days");
  }

  const rows = [...uniqueRows.values()]
    .filter(({ row }) => row.date >= windowStart && row.date <= matureEnd)
    .filter(({ row }) => isParentIntentQuery(row.query))
    .filter(({ row }) => {
      const page = inventory.get(row.page);
      return (
        page?.public_enrollment_page === true &&
        page.indexable &&
        page.robots_allowed &&
        !isProtectedIndexPath(row.page)
      );
    });
  const clicks = rows.reduce((sum, item) => sum + item.row.clicks, 0);
  const impressions = rows.reduce((sum, item) => sum + item.row.impressions, 0);

  for (const artifact of artifacts) {
    if (
      artifact.payload.generate_lead_events !== undefined &&
      artifact.payload.successful_form_responses !== undefined &&
      artifact.payload.generate_lead_events > artifact.payload.successful_form_responses
    ) {
      issues.push("GA4 generate_lead exceeds successful form responses; attribution is untrusted");
    }
    if (artifact.payload.verified_purchases === undefined) {
      issues.push("Verified-purchase evidence is absent; conversion quality remains a gap");
    }
  }

  const aggregates = new Map<
    string,
    { query: string; page: string; clicks: number; impressions: number; weightedPosition: number; refs: Set<string> }
  >();
  for (const { row, evidenceIds } of rows) {
    const key = `${row.query}\u0000${row.page}`;
    const current = aggregates.get(key) ?? {
      query: row.query,
      page: row.page,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      refs: new Set<string>(),
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.weightedPosition += row.position * row.impressions;
    evidenceIds.forEach((evidenceId) => current.refs.add(evidenceId));
    aggregates.set(key, current);
  }
  const candidates = [...aggregates.values()]
    .map((entry) => ({
      ...entry,
      position: entry.impressions > 0 ? entry.weightedPosition / entry.impressions : 0,
      score: clampScore(
        Math.min(70, Math.log10(entry.impressions + 1) * 25) +
          Math.max(0, 20 - Math.abs(8 - (entry.impressions > 0 ? entry.weightedPosition / entry.impressions : 0))),
      ),
    }))
    .filter((entry) => entry.impressions >= 10 && entry.position >= 4 && entry.position <= 20)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.impressions - left.impressions ||
        left.query.localeCompare(right.query),
    );
  const best = candidates[0];
  const propertyId = [...properties][0];
  const opportunities: OpportunityCandidate[] =
    best && propertyId && !propertyConflict && !propertyHostConflict
    ? [
        candidate({
          candidate_id: stableId("seo", [best.query, best.page]),
          lane: "search_console",
          kind: "seo_experiment",
          summary: `Test one parent-intent alignment change for query "${best.query}" on ${best.page}; measure mature 14/28-day clicks and CTR before any deploy decision.`,
          score: best.score,
          controlled_variable: "title_meta_alignment",
          evidence_refs: [...best.refs].sort(),
          property_id: propertyId,
          page_url: best.page,
          query_cluster: best.query,
        }),
      ]
    : [];

  const metrics: MetricSnapshot[] = [
    metric({
      metric_id: "gsc:nonbrand-parent-intent-clicks",
      lane: "search_console",
      metric_name: "nonbrand_parent_intent_gsc_clicks_28d",
      value: sourceComplete ? clicks : null,
      unit: "count",
      window_start: windowStart,
      window_end: matureEnd,
      complete: sourceComplete,
      evidence_refs: evidenceRefs.length > 0 ? evidenceRefs : ["missing:evidence"],
    }),
    metric({
      metric_id: "gsc:nonbrand-parent-intent-impressions",
      lane: "search_console",
      metric_name: "nonbrand_parent_intent_gsc_impressions_28d",
      value: sourceComplete ? impressions : null,
      unit: "count",
      window_start: windowStart,
      window_end: matureEnd,
      complete: sourceComplete,
      evidence_refs: evidenceRefs.length > 0 ? evidenceRefs : ["missing:evidence"],
    }),
  ];

  const unsafeIndexing = unsafeIndexed.length > 0;
  const status: LaneAnalysis["status"] =
    unsafeIndexing || propertyConflict || propertyHostConflict
    ? "quarantined"
    : !sourceComplete
      ? "baseline_gap"
      : opportunities.length === 0
        ? "observe_more"
        : "eligible";
  const decision: LaneAnalysis["decision"] =
    unsafeIndexing || propertyConflict || propertyHostConflict
    ? "repair"
    : sourceComplete
      ? opportunities.length > 0
        ? "repeat"
        : "observe_more"
      : "observe_more";

  return LaneAnalysisSchema.parse({
    lane: "search_console",
    status,
    decision,
    source_coverage: coverage,
    issues: [...new Set(issues)],
    evidence_refs: evidenceRefs,
    metrics,
    opportunities,
  });
}

export function analyzeGrowthPortfolio(input: {
  bundle: GrowthCaptureBundle;
  evidence: EvidenceArtifact[];
  runAt: string;
}): PortfolioAnalysis {
  const lanes = [
    analyzeSocialLane(input),
    analyzeContactLane(input),
    analyzeSearchConsoleLane(input),
  ] as const;
  const overallStatus: PortfolioAnalysis["overall_status"] = lanes.some(
    (lane) => lane.status === "quarantined",
  )
    ? "quarantined"
    : lanes.every((lane) => lane.status === "eligible")
      ? "eligible"
      : "partial";
  return PortfolioAnalysisSchema.parse({
    schema_version: PORTFOLIO_ANALYSIS_SCHEMA_VERSION,
    run_at: input.runAt,
    bundle_id: input.bundle.bundle_id,
    lanes,
    overall_status: overallStatus,
  });
}
