import { createHash } from "node:crypto";

import {
  addProjectCalendarDays,
  evaluateCodeTheFutureProjectIdentity,
  isProtectedIndexPath,
  normalizedIndexPath,
  projectCalendarDate,
  projectDateIsWithinWindow,
  protectedIndexPathCategory,
} from "./project-policy.js";
import {
  CONSENT_REVOCATION_CHECK_MAX_AGE_MS,
  type ContactEvidenceArtifactSchema,
  EVIDENCE_ATTESTATION_SCHEMA_VERSION,
  EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1,
  type EvidenceArtifact,
  type Ga4EvidenceArtifactSchema,
  type GrowthCaptureBundle,
  type LaneAnalysis,
  LaneAnalysisSchema,
  type MetricSnapshot,
  type OpportunityCandidate,
  PORTFOLIO_ANALYSIS_SCHEMA_VERSION,
  type PortfolioAnalysis,
  PortfolioAnalysisSchema,
  type SearchConsoleEvidenceArtifactV1Schema,
  type SearchConsoleSummaryEvidenceArtifactSchema,
  type SocialEvidenceArtifactSchema,
} from "./schema.js";
import type { z } from "zod";

type SocialEvidence = z.infer<typeof SocialEvidenceArtifactSchema>;
type ContactEvidence = z.infer<typeof ContactEvidenceArtifactSchema>;
type SearchEvidenceV1 = z.infer<typeof SearchConsoleEvidenceArtifactV1Schema>;
type SearchSummaryEvidence = z.infer<
  typeof SearchConsoleSummaryEvidenceArtifactSchema
>;
type Ga4Evidence = z.infer<typeof Ga4EvidenceArtifactSchema>;
type SearchEvidence = SearchEvidenceV1 | SearchSummaryEvidence | Ga4Evidence;

const DAY_MS = 86_400_000;
const SOCIAL_MATURITY_MS = 72 * 60 * 60 * 1_000;
const MIN_SOCIAL_SCORING_REACH = 1;
const CONTACT_FRESHNESS_MS = 7 * DAY_MS;
const BRAND_QUERY = /\b(?:code\s+the\s+future|codethefuture|code\s+future\s+louisville)\b/u;
const AUDIENCE_QUERY =
  /\b(?:parents?|kids?|children|child|youth|teens?|famil(?:y|ies))\b/u;
const SUBJECT_QUERY =
  /\b(?:ai|coding|computer|technology|stem|robotics)\b/u;
const PROGRAM_QUERY =
  /\b(?:camps?|class(?:es)?|clubs?|programs?|courses?|workshops?|lessons?)\b/u;

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

function assertProjectRunWithinObjectiveWindow(
  bundle: GrowthCaptureBundle,
  runAt: string,
): string {
  const runDate = projectCalendarDate(runAt);
  if (!projectDateIsWithinWindow(runDate, bundle.objective_window)) {
    throw new RangeError("Project run date falls outside the objective window");
  }
  return runDate;
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

function sourceCoverageFor(
  bundle: GrowthCaptureBundle,
  lane: LaneAnalysis["lane"],
  source: GrowthCaptureBundle["source_runs"][number]["source"],
  evidenceIds?: ReadonlySet<string>,
): LaneAnalysis["source_coverage"] {
  if (evidenceIds?.size === 0) return "missing";
  const runs = bundle.source_runs.filter(
    (run) =>
      run.lane === lane &&
      run.source === source &&
      (evidenceIds === undefined ||
        run.evidence_refs.some((evidenceId) => evidenceIds.has(evidenceId))),
  );
  if (runs.length === 0) return "missing";
  const completeEvidenceIds = new Set(
    runs
      .filter(
        (run) =>
          run.status === "verified_complete" && run.data_state === "complete",
      )
      .flatMap((run) => run.evidence_refs),
  );
  return runs.every(
    (run) => run.status === "verified_complete" && run.data_state === "complete",
  ) &&
    (evidenceIds === undefined ||
      [...evidenceIds].every((evidenceId) => completeEvidenceIds.has(evidenceId)))
    ? "complete"
    : "partial";
}

function verifiedCompleteEvidenceIds(
  bundle: GrowthCaptureBundle,
  lane: LaneAnalysis["lane"],
  source?: GrowthCaptureBundle["source_runs"][number]["source"],
): Set<string> {
  const completeDeclarations = new Set(
    bundle.evidence
      .filter(
        (evidence) =>
          evidence.lane === lane &&
          evidence.data_state === "complete" &&
          (source === undefined || evidence.source === source),
      )
      .map((evidence) => evidence.evidence_id),
  );
  const eligible = new Set<string>();
  for (const run of bundle.source_runs) {
    if (
      run.lane !== lane ||
      (source !== undefined && run.source !== source) ||
      run.status !== "verified_complete" ||
      run.data_state !== "complete"
    ) {
      continue;
    }
    for (const evidenceId of run.evidence_refs) {
      if (completeDeclarations.has(evidenceId)) eligible.add(evidenceId);
    }
  }
  return eligible;
}

function completeSourceRunFreshThrough(
  bundle: GrowthCaptureBundle,
  evidenceId: string,
  artifactFreshThrough?: string,
): string | undefined {
  const runs = bundle.source_runs.filter(
    (run) =>
      run.evidence_refs.includes(evidenceId) &&
      run.status === "verified_complete" &&
      run.data_state === "complete",
  );
  if (runs.length !== 1) return undefined;
  const run = runs[0]!;
  if (run.fresh_through === undefined) return undefined;
  const linkedDeclarations = run.evidence_refs.map((reference) =>
    bundle.evidence.filter((declaration) => declaration.evidence_id === reference),
  );
  if (
    linkedDeclarations.some(
      (matches) => matches.length !== 1 || matches[0]!.fresh_through === undefined,
    )
  ) {
    return undefined;
  }
  const targetDeclaration = linkedDeclarations
    .flat()
    .find((declaration) => declaration.evidence_id === evidenceId);
  if (
    !targetDeclaration ||
    (artifactFreshThrough !== undefined &&
      targetDeclaration.fresh_through !== artifactFreshThrough)
  ) {
    return undefined;
  }
  const conservativeFreshThrough = linkedDeclarations
    .flatMap((matches) => matches[0]!.fresh_through ?? [])
    .sort()[0];
  return run.fresh_through === conservativeFreshThrough
    ? run.fresh_through
    : undefined;
}

function metric(input: MetricSnapshot): MetricSnapshot {
  return input;
}

function candidate(input: OpportunityCandidate): OpportunityCandidate {
  return input;
}

function sameCanonicalLocation(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      leftUrl.protocol.toLowerCase() === rightUrl.protocol.toLowerCase() &&
      leftUrl.host.toLowerCase() === rightUrl.host.toLowerCase() &&
      normalizedIndexPath(left) === normalizedIndexPath(right)
    );
  } catch {
    return normalizedIndexPath(left) === normalizedIndexPath(right);
  }
}

function hasUnsafeProtectedCanonical(page: {
  url: string;
  indexable: boolean;
  canonical_url?: string | undefined;
}): boolean {
  if (!page.canonical_url || !isProtectedIndexPath(page.canonical_url)) {
    return false;
  }
  return !(
    !page.indexable &&
    isProtectedIndexPath(page.url) &&
    sameCanonicalLocation(page.url, page.canonical_url)
  );
}

export { isProtectedIndexPath } from "./project-policy.js";

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
  const duplicateIds = <T>(items: readonly T[], identity: (item: T) => string): Set<string> => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of items) {
      const id = identity(item);
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    return duplicates;
  };
  const duplicateAssetIds = duplicateIds(
    artifact.payload.assets,
    (asset) => asset.asset_id,
  );
  const duplicateConsentIds = duplicateIds(
    artifact.payload.consents,
    (consent) => consent.consent_id,
  );
  if (duplicateAssetIds.size > 0) {
    issues.push("Duplicate social asset identities make consent scope ambiguous");
  }
  if (duplicateConsentIds.size > 0) {
    issues.push("Duplicate social consent identities make authorization ambiguous");
  }
  for (const asset of artifact.payload.assets) {
    if (
      new Set(asset.consent_refs).size !== asset.consent_refs.length ||
      new Set(asset.media_kinds).size !== asset.media_kinds.length
    ) {
      issues.push(`Asset ${asset.asset_id} repeats consent or media scope values`);
    }
  }
  for (const post of artifact.payload.posts) {
    if (new Set(post.asset_refs).size !== post.asset_refs.length) {
      issues.push(`Post ${post.post_id} repeats an asset reference`);
    }
  }
  for (const consent of artifact.payload.consents) {
    if (
      new Set(consent.allowed_channels).size !== consent.allowed_channels.length ||
      new Set(consent.allowed_media).size !== consent.allowed_media.length
    ) {
      issues.push(`Consent ${consent.consent_id} repeats an authorization scope`);
    }
  }
  const assets = new Map(
    artifact.payload.assets
      .filter((asset) => !duplicateAssetIds.has(asset.asset_id))
      .map((asset) => [asset.asset_id, asset]),
  );
  const consents = new Map(
    artifact.payload.consents
      .filter((consent) => !duplicateConsentIds.has(consent.consent_id))
      .map((consent) => [consent.consent_id, consent]),
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
  const runDate = assertProjectRunWithinObjectiveWindow(input.bundle, input.runAt);
  const allArtifacts = input.evidence.filter(
    (artifact): artifact is SocialEvidence => artifact.lane === "organic_social",
  );
  const identityDecisions = new Map(
    allArtifacts.map((artifact) => [
      artifact.evidence_id,
      evaluateCodeTheFutureProjectIdentity(artifact),
    ]),
  );
  const artifacts = allArtifacts.filter(
    (artifact) => identityDecisions.get(artifact.evidence_id)?.accepted === true,
  );
  const evidenceRefs = laneEvidenceIds(input.evidence, "organic_social");
  const runAtMs = instant(input.runAt);
  const windowStart = input.bundle.objective_window.start;
  const objectiveWindowEnd = input.bundle.objective_window.end;
  const windowEnd = runDate < objectiveWindowEnd ? runDate : objectiveWindowEnd;
  const issues: string[] = [];
  const metrics: MetricSnapshot[] = [];
  const decisionEligibleIds = verifiedCompleteEvidenceIds(
    input.bundle,
    "organic_social",
  );
  let privacyUnsafe = false;
  let identityUnsafe = false;
  let accountConflict = false;
  let evidenceConflict = false;
  let matureOrganicPostCount = 0;
  let insufficientReachPostCount = 0;
  let completeComparisonCount = 0;
  const completeBaselinePlatforms = new Set<"instagram" | "facebook">();
  const platformCoverage = new Map<
    "instagram" | "facebook",
    LaneAnalysis["source_coverage"]
  >();
  const opportunityInputs: Array<{
    platform: "instagram" | "facebook";
    postId: string;
    accountId: string;
    score: number;
    controlledVariable: string;
    evidenceId: string;
  }> = [];

  for (const artifact of allArtifacts) {
    const identity = identityDecisions.get(artifact.evidence_id)!;
    if (!identity.accepted) {
      identityUnsafe = true;
      issues.push(
        `Project social identity policy rejected ${artifact.evidence_id}: ${identity.reason ?? "identity mismatch"}`,
      );
    } else if (!identity.decision_eligible) {
      issues.push(
        `${artifact.evidence_id} is retained as identity-limited observation only and cannot drive a decision`,
      );
    }
  }

  for (const platform of ["instagram", "facebook"] as const) {
    const scopedArtifacts = artifacts.filter((artifact) => artifact.platform === platform);
    const expectedSource =
      platform === "instagram" ? "instagram_insights" : "facebook_insights";
    const platformArtifacts = scopedArtifacts.filter(
      (artifact) => artifact.source === expectedSource,
    );
    const excludedPerformanceArtifacts = scopedArtifacts.filter(
      (artifact) =>
        artifact.source !== expectedSource &&
        (artifact.payload.follower_snapshots.length > 0 ||
          artifact.payload.posts.length > 0 ||
          ("partial_post_observations" in artifact.payload &&
            artifact.payload.partial_post_observations.length > 0)),
    );
    if (excludedPerformanceArtifacts.length > 0) {
      issues.push(
        `${platform} performance evidence from a non-matching insight source was excluded`,
      );
    }
    for (const artifact of scopedArtifacts) {
      const consent = socialConsentSafe(artifact, runAtMs);
      if (!consent.safe) privacyUnsafe = true;
      issues.push(...consent.issues);
    }
    const experimentArms = new Map<string, Map<string, number>>();
    if (platformArtifacts.length === 0) {
      platformCoverage.set(platform, "missing");
      issues.push(`Missing ${platform} insight evidence`);
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
          evidence_refs: ["missing:evidence"],
        }),
      );
      continue;
    }
    const typedFacebookMigrationArtifact =
      platform === "facebook"
        ? platformArtifacts.find(
            (artifact) =>
              artifact.schema_version ===
                EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1 &&
              artifact.data_state === "complete" &&
              identityDecisions.get(artifact.evidence_id)?.decision_eligible === true &&
              artifact.meta_identity !== undefined,
          )
        : undefined;
    const typedFacebookMigrationProof =
      typedFacebookMigrationArtifact?.schema_version ===
      EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1
        ? typedFacebookMigrationArtifact.meta_identity
        : undefined;
    const canonicalAccountId = (artifact: SocialEvidence): string =>
      typedFacebookMigrationProof !== undefined &&
      artifact.account_id === typedFacebookMigrationProof.asset_id
        ? typedFacebookMigrationProof.page_id
        : artifact.account_id;
    const platformAccounts = new Set(
      platformArtifacts.map((artifact) => canonicalAccountId(artifact)),
    );
    if (platformAccounts.size > 1) {
      accountConflict = true;
      issues.push(`Multiple ${platform} accounts cannot form one growth baseline`);
    }

    const decisionArtifacts = platformArtifacts.filter(
      (artifact) => {
        const captureDate = projectCalendarDate(artifact.captured_at);
        const captureAgeMs = runAtMs - instant(artifact.captured_at);
        return (
          artifact.data_state === "complete" &&
          decisionEligibleIds.has(artifact.evidence_id) &&
          identityDecisions.get(artifact.evidence_id)?.decision_eligible === true &&
          captureAgeMs >= 0 &&
          captureAgeMs <= DAY_MS &&
          artifact.fresh_through === captureDate &&
          completeSourceRunFreshThrough(
            input.bundle,
            artifact.evidence_id,
            artifact.fresh_through,
          ) === captureDate
        );
      },
    );
    if (
      platformArtifacts.some(
        (artifact) =>
          artifact.data_state === "complete" &&
          decisionEligibleIds.has(artifact.evidence_id) &&
          identityDecisions.get(artifact.evidence_id)?.decision_eligible === true,
      ) &&
      decisionArtifacts.length === 0
    ) {
      issues.push(
        `${platform} complete evidence is not capture-current with exactly bound source/artifact freshness and is observation-only`,
      );
    }
    const decisionCoverage = sourceCoverageFor(
      input.bundle,
      "organic_social",
      expectedSource,
      new Set(decisionArtifacts.map((artifact) => artifact.evidence_id)),
    );
    platformCoverage.set(
      platform,
      decisionCoverage === "complete"
        ? "complete"
        : platformArtifacts.length > 0
          ? "partial"
          : "missing",
    );
    const snapshotsAtInstant = new Map<
      string,
      {
        snapshot: SocialEvidence["payload"]["follower_snapshots"][number];
        signature: string;
        conflict: boolean;
      }
    >();
    for (const artifact of decisionArtifacts) {
      for (const snapshot of artifact.payload.follower_snapshots) {
        const key = `${canonicalAccountId(artifact)}\u0000${snapshot.recorded_at}`;
        const signature = JSON.stringify(snapshot);
        const current = snapshotsAtInstant.get(key);
        if (!current) {
          snapshotsAtInstant.set(key, { snapshot, signature, conflict: false });
        } else if (current.signature !== signature) {
          current.conflict = true;
          evidenceConflict = true;
        }
      }
    }
    if ([...snapshotsAtInstant.values()].some((entry) => entry.conflict)) {
      issues.push(
        `Conflicting ${platform} follower snapshots at the same recorded instant were excluded`,
      );
    }
    const snapshots = [...snapshotsAtInstant.values()]
      .filter((entry) => !entry.conflict)
      .map((entry) => entry.snapshot)
      .filter((snapshot) => {
        const day = projectCalendarDate(snapshot.recorded_at);
        return day >= windowStart && day <= windowEnd;
      })
      .sort((left, right) => instant(left.recorded_at) - instant(right.recorded_at));
    const opening = snapshots.find(
      (snapshot) => projectCalendarDate(snapshot.recorded_at) === windowStart,
    );
    const closing = [...snapshots]
      .reverse()
      .find((snapshot) => projectCalendarDate(snapshot.recorded_at) > windowStart);
    const observedWindowEnd = snapshots.at(-1)
      ? projectCalendarDate(snapshots.at(-1)!.recorded_at)
      : windowEnd;
    const organicSnapshots = snapshots.every((snapshot) => snapshot.paid_influence === "none");
    const complete =
      decisionCoverage === "complete" &&
      opening !== undefined &&
      closing !== undefined &&
      projectCalendarDate(opening.recorded_at) !==
        projectCalendarDate(closing.recorded_at) &&
      organicSnapshots &&
      !evidenceConflict;
    if (complete) completeBaselinePlatforms.add(platform);
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
        window_end: observedWindowEnd,
        complete,
        evidence_refs: platformArtifacts
          .map((artifact) => artifact.evidence_id)
          .sort((left, right) => left.localeCompare(right)),
      }),
    );

    const latestPosts = new Map<
      string,
      {
        post: SocialEvidence["payload"]["posts"][number];
        accountId: string;
        evidenceId: string;
        capturedAt: string;
      }
    >();
    const orderedArtifacts = [...platformArtifacts].sort(
      (left, right) =>
        instant(left.captured_at) - instant(right.captured_at) ||
        left.evidence_id.localeCompare(right.evidence_id),
    );
    const completePostRows = new Map<string, { signature: string; conflict: boolean }>();
    for (const artifact of decisionArtifacts) {
      for (const post of artifact.payload.posts) {
        const key = [
          canonicalAccountId(artifact),
          platform,
          post.post_id,
          artifact.captured_at,
        ].join("\u0000");
        const signature = JSON.stringify(post);
        const current = completePostRows.get(key);
        if (!current) {
          completePostRows.set(key, { signature, conflict: false });
        } else if (current.signature !== signature) {
          current.conflict = true;
          evidenceConflict = true;
        }
      }
    }
    if ([...completePostRows.values()].some((entry) => entry.conflict)) {
      issues.push(
        `Conflicting ${platform} complete post rows at the same capture instant were excluded`,
      );
    }
    const completePostIsConflicted = (
      artifact: SocialEvidence,
      post: SocialEvidence["payload"]["posts"][number],
    ): boolean =>
      completePostRows.get(
        [
          canonicalAccountId(artifact),
          platform,
          post.post_id,
          artifact.captured_at,
        ].join("\u0000"),
      )?.conflict === true;
    const latestObservation = new Map<
      string,
      { capturedAt: string; capturedAtMs: number; kind: "complete" | "partial" }
    >();
    const observePost = (
      postId: string,
      accountId: string,
      capturedAt: string,
      kind: "complete" | "partial",
    ): void => {
      const key = `${accountId}\u0000${postId}`;
      const capturedAtMs = instant(capturedAt);
      const current = latestObservation.get(key);
      if (
        !current ||
        capturedAtMs > current.capturedAtMs ||
        (capturedAtMs === current.capturedAtMs && kind === "partial")
      ) {
        latestObservation.set(key, { capturedAt, capturedAtMs, kind });
      }
    };
    let partialObservationCount = 0;
    for (const artifact of orderedArtifacts) {
      for (const post of artifact.payload.posts) {
        const decisionEligible =
          artifact.data_state === "complete" &&
          decisionEligibleIds.has(artifact.evidence_id) &&
          identityDecisions.get(artifact.evidence_id)?.decision_eligible === true &&
          !completePostIsConflicted(artifact, post);
        observePost(
          post.post_id,
          canonicalAccountId(artifact),
          artifact.captured_at,
          decisionEligible ? "complete" : "partial",
        );
      }
      if ("partial_post_observations" in artifact.payload) {
        partialObservationCount += artifact.payload.partial_post_observations.length;
        for (const post of artifact.payload.partial_post_observations) {
          observePost(
            post.post_id,
            canonicalAccountId(artifact),
            artifact.captured_at,
            "partial",
          );
        }
      }
    }
    if (partialObservationCount > 0) {
      issues.push(
        `${partialObservationCount} ${platform} partial post observation${
          partialObservationCount === 1 ? " was" : "s were"
        } retained as evidence and excluded from scoring`,
      );
    }
    for (const artifact of orderedArtifacts) {
      for (const post of artifact.payload.posts) {
        const supportedAssetShape =
          post.asset_refs.length > 0 ||
          (platform === "facebook" && post.format === "text");
        if (!supportedAssetShape) {
          issues.push(
            `${platform} post ${post.post_id} lacks a supported immutable asset scope and was excluded from analysis`,
          );
          continue;
        }
        const canonicalAccount = canonicalAccountId(artifact);
        const latest = latestObservation.get(
          `${canonicalAccount}\u0000${post.post_id}`,
        );
        if (
          latest?.kind !== "complete" ||
          latest.capturedAtMs !== instant(artifact.captured_at)
        ) {
          continue;
        }
        latestPosts.set(`${canonicalAccount}\u0000${post.post_id}`, {
          post,
          accountId: canonicalAccount,
          evidenceId: artifact.evidence_id,
          capturedAt: artifact.captured_at,
        });
      }
    }
    const matureByTime = [...latestPosts.values()].filter(
      ({ post, capturedAt }) =>
        post.paid_status === "organic" &&
        instant(capturedAt) - instant(post.published_at) >= SOCIAL_MATURITY_MS,
    );
    insufficientReachPostCount += matureByTime.filter(
      ({ post }) => post.reach < MIN_SOCIAL_SCORING_REACH,
    ).length;
    const mature = matureByTime.filter(
      ({ post }) => post.reach >= MIN_SOCIAL_SCORING_REACH,
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
  if (insufficientReachPostCount > 0) {
    issues.push(
      `${insufficientReachPostCount} mature organic post${
        insufficientReachPostCount === 1 ? " was" : "s were"
      } excluded because reach was below ${MIN_SOCIAL_SCORING_REACH}`,
    );
  }
  if (matureOrganicPostCount > 0 && completeComparisonCount === 0) {
    issues.push(
      "No platform has two comparable experiment arms with at least three mature executions each",
    );
  }

  opportunityInputs.sort(
    (left, right) => right.score - left.score || left.postId.localeCompare(right.postId),
  );
  const best = opportunityInputs.find((item) =>
    completeBaselinePlatforms.has(item.platform),
  );
  const followerBaselineComplete = completeBaselinePlatforms.size > 0;
  const coverageValues = [...platformCoverage.values()];
  const coverage: LaneAnalysis["source_coverage"] = coverageValues.every(
    (value) => value === "complete",
  )
    ? "complete"
    : coverageValues.some((value) => value !== "missing")
      ? "partial"
      : "missing";
  const opportunities: OpportunityCandidate[] =
    best &&
    !privacyUnsafe &&
    !identityUnsafe &&
    !accountConflict &&
    !evidenceConflict &&
    followerBaselineComplete
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

  const baselineComplete = followerBaselineComplete;
  const status: LaneAnalysis["status"] =
    privacyUnsafe || identityUnsafe || accountConflict || evidenceConflict
    ? "quarantined"
    : !baselineComplete
      ? "baseline_gap"
      : opportunities.length === 0
        ? "observe_more"
        : "eligible";
  const decision: LaneAnalysis["decision"] =
    privacyUnsafe || identityUnsafe || accountConflict || evidenceConflict
    ? "stop"
    : !baselineComplete || opportunities.length === 0
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
  assertProjectRunWithinObjectiveWindow(input.bundle, input.runAt);
  const allArtifacts = input.evidence.filter(
    (artifact): artifact is ContactEvidence => artifact.lane === "contact_discovery",
  );
  const identityDecisions = new Map(
    allArtifacts.map((artifact) => [
      artifact.evidence_id,
      evaluateCodeTheFutureProjectIdentity(artifact),
    ]),
  );
  const artifacts = allArtifacts.filter(
    (artifact) => identityDecisions.get(artifact.evidence_id)?.accepted === true,
  );
  const evidenceRefs = laneEvidenceIds(input.evidence, "contact_discovery");
  const coverage = sourceCoverage(input.bundle, "contact_discovery");
  const runAtMs = instant(input.runAt);
  const issues: string[] = [];
  const prior = new Set<string>();
  const blocked = new Set<string>();
  const historyDecisionEligibleIds = verifiedCompleteEvidenceIds(
    input.bundle,
    "contact_discovery",
    "contact_history",
  );
  const historyArtifacts = artifacts.filter(
    (artifact) => {
      const captureDate = projectCalendarDate(artifact.captured_at);
      const age = runAtMs - instant(artifact.captured_at);
      return (
        artifact.source === "contact_history" &&
        artifact.data_state === "complete" &&
        historyDecisionEligibleIds.has(artifact.evidence_id) &&
        identityDecisions.get(artifact.evidence_id)?.decision_eligible === true &&
        age >= 0 &&
        age <= DAY_MS &&
        artifact.fresh_through === captureDate &&
        completeSourceRunFreshThrough(
          input.bundle,
          artifact.evidence_id,
          artifact.fresh_through,
        ) ===
          captureDate
      );
    },
  );
  const historyComplete =
    historyArtifacts.length > 0 &&
    historyArtifacts.every((artifact) => artifact.payload.history_complete);
  let privacyUnsafe = false;
  let identityUnsafe = false;

  for (const artifact of allArtifacts) {
    const identity = identityDecisions.get(artifact.evidence_id)!;
    if (!identity.accepted) {
      identityUnsafe = true;
      issues.push(
        `Project contact-source policy rejected ${artifact.evidence_id}: ${identity.reason ?? "source mismatch"}`,
      );
    }
  }

  for (const artifact of artifacts) {
    const recordIds = artifact.payload.records.map((record) => record.record_id);
    if (new Set(recordIds).size !== recordIds.length) {
      privacyUnsafe = true;
      issues.push(
        `Duplicate contact record IDs make approval binding ambiguous in ${artifact.evidence_id}`,
      );
    }
  }
  const crossArtifactRecordIds = new Map<string, string>();
  for (const artifact of artifacts) {
    for (const record of artifact.payload.records) {
      const signature = JSON.stringify(record);
      const current = crossArtifactRecordIds.get(record.record_id);
      if (current !== undefined && current !== signature) {
        privacyUnsafe = true;
        issues.push(
          `Conflicting contact record ID ${record.record_id} makes approval binding ambiguous`,
        );
      } else if (current === undefined) {
        crossArtifactRecordIds.set(record.record_id, signature);
      }
    }
  }

  for (const artifact of historyArtifacts) {
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
      selectedEvidenceId: string;
    }
  >();
  for (const artifact of artifacts.filter(
    (candidate) => candidate.source === "public_web",
  )) {
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
      if (
        record.source_type === "public_group_admin" &&
        record.group_rules_captured &&
        (record.group_rules_captured_at === undefined ||
          runAtMs - instant(record.group_rules_captured_at) < 0 ||
          runAtMs - instant(record.group_rules_captured_at) > 7 * DAY_MS)
      ) {
        issues.push(
          `Group rules are not fresh within seven days for any approval-capable group proposal: ${record.record_id}`,
        );
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
        const candidateSelectionKey = `${artifact.evidence_id}\u0000${record.record_id}`;
        const currentSelectionKey = `${current.selectedEvidenceId}\u0000${current.record.record_id}`;
        if (
          score > current.score ||
          (score === current.score &&
            candidateSelectionKey.localeCompare(currentSelectionKey) < 0)
        ) {
          current.record = record;
          current.score = score;
          current.selectedEvidenceId = artifact.evidence_id;
        }
      } else {
        merged.set(identity, {
          record,
          evidenceRefs: new Set([artifact.evidence_id]),
          score,
          selectedEvidenceId: artifact.evidence_id,
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
    complete:
      coverage === "complete" && historyComplete && !privacyUnsafe && !identityUnsafe,
    evidence_refs: evidenceRefs.length > 0 ? evidenceRefs : ["missing:evidence"],
  });
  const best = qualified[0];
  const bestGroupRulesFresh =
    best !== undefined &&
    best[1].record.group_rules_captured &&
    best[1].record.group_rules_captured_at !== undefined &&
    runAtMs - instant(best[1].record.group_rules_captured_at) >= 0 &&
    runAtMs - instant(best[1].record.group_rules_captured_at) <= 7 * DAY_MS;
  const opportunities: OpportunityCandidate[] =
    best &&
    !privacyUnsafe &&
    !identityUnsafe &&
    historyComplete &&
    coverage === "complete"
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
            selected_evidence_id: best[1].selectedEvidenceId,
            identity_fingerprint: fingerprintNormalizedContactIdentity(best[0]),
            organization_name: best[1].record.organization_name,
            ...(best[1].record.public_contact_channel
              ? { destination: best[1].record.public_contact_channel }
              : {}),
            source_url: best[1].record.source_url,
            group_rules_captured: bestGroupRulesFresh,
            ...(bestGroupRulesFresh && best[1].record.group_rules_url
              ? { group_rules_url: best[1].record.group_rules_url }
              : {}),
          }),
        ]
      : [];

  const status: LaneAnalysis["status"] = privacyUnsafe || identityUnsafe
    ? "quarantined"
    : coverage !== "complete" || !historyComplete
      ? "baseline_gap"
      : "eligible";

  return LaneAnalysisSchema.parse({
    lane: "contact_discovery",
    status,
    decision:
      privacyUnsafe || identityUnsafe
        ? "stop"
        : status === "eligible"
          ? "repeat"
          : "observe_more",
    source_coverage: coverage,
    issues: [...new Set(issues)],
    evidence_refs: evidenceRefs,
    metrics: [primaryMetric, driverMetric],
    opportunities,
  });
}

export function isParentIntentQuery(query: string): boolean {
  const normalized = query
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-_]+/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
  if (BRAND_QUERY.test(normalized)) return false;
  const familyMatches = [
    AUDIENCE_QUERY.test(normalized),
    SUBJECT_QUERY.test(normalized),
    PROGRAM_QUERY.test(normalized),
  ].filter(Boolean).length;
  return familyMatches >= 2;
}

function normalizedHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/u, "");
  } catch {
    return undefined;
  }
}

function isSearchEvidenceV1(
  artifact: SearchEvidence,
): artifact is SearchEvidenceV1 {
  return artifact.schema_version === EVIDENCE_ATTESTATION_SCHEMA_VERSION;
}

function isSearchSummaryEvidence(
  artifact: SearchEvidence,
): artifact is SearchSummaryEvidence {
  return (
    artifact.schema_version === EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1 &&
    artifact.source === "search_console"
  );
}

function isGa4Evidence(artifact: SearchEvidence): artifact is Ga4Evidence {
  return (
    artifact.schema_version === EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1 &&
    artifact.source === "ga4"
  );
}

type GscPropertyEvidence = SearchEvidenceV1 | SearchSummaryEvidence;

function searchPropertyHostScope(
  artifact: GscPropertyEvidence,
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

function searchArtifactHostsMatchProperty(artifact: GscPropertyEvidence): boolean {
  const scope = searchPropertyHostScope(artifact);
  if (!scope) return false;
  if (artifact.schema_version === EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1) {
    return artifact.payload.tables.pages.rows.every((row) =>
      hostIsInScope(row.page, scope),
    );
  }
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
  const projectRunDate = assertProjectRunWithinObjectiveWindow(
    input.bundle,
    input.runAt,
  );
  const allArtifacts = input.evidence.filter(
    (artifact): artifact is SearchEvidence => artifact.lane === "search_console",
  );
  const identityDecisions = new Map(
    allArtifacts.map((artifact) => [
      artifact.evidence_id,
      evaluateCodeTheFutureProjectIdentity(artifact),
    ]),
  );
  const artifacts = allArtifacts.filter(
    (artifact) => identityDecisions.get(artifact.evidence_id)?.accepted === true,
  );
  const legacyArtifacts = artifacts.filter(isSearchEvidenceV1);
  const exactGscArtifacts = legacyArtifacts.filter(
    (artifact) => artifact.source === "search_console",
  );
  const gscDecisionEligibleIds = verifiedCompleteEvidenceIds(
    input.bundle,
    "search_console",
    "search_console",
  );
  const decisionEligibleGscArtifacts = exactGscArtifacts.filter(
    (artifact) =>
      artifact.data_state === "complete" &&
      gscDecisionEligibleIds.has(artifact.evidence_id) &&
      identityDecisions.get(artifact.evidence_id)?.decision_eligible === true,
  );
  const siteInventoryArtifacts = legacyArtifacts.filter(
    (artifact) => artifact.source === "site_inventory",
  );
  const siteInventoryDecisionEligibleIds = verifiedCompleteEvidenceIds(
    input.bundle,
    "search_console",
    "site_inventory",
  );
  const decisionEligibleSiteInventoryArtifacts = siteInventoryArtifacts.filter(
    (artifact) =>
      artifact.data_state === "complete" &&
      siteInventoryDecisionEligibleIds.has(artifact.evidence_id) &&
      identityDecisions.get(artifact.evidence_id)?.decision_eligible === true,
  );
  const legacyGa4Artifacts = legacyArtifacts.filter(
    (artifact) => artifact.source === "ga4",
  );
  const gscSummaryArtifacts = artifacts.filter(isSearchSummaryEvidence);
  const ga4Artifacts = artifacts.filter(isGa4Evidence);
  const ga4DecisionEligibleIds = verifiedCompleteEvidenceIds(
    input.bundle,
    "search_console",
    "ga4",
  );
  const gscPropertyArtifacts: GscPropertyEvidence[] = [
    ...exactGscArtifacts,
    ...siteInventoryArtifacts,
    ...gscSummaryArtifacts,
  ];
  const evidenceRefs = laneEvidenceIds(input.evidence, "search_console");
  const coverage = sourceCoverage(input.bundle, "search_console");
  const runAtMs = instant(input.runAt);
  const matureEnd = addProjectCalendarDays(projectRunDate, -3);
  const windowStart = addProjectCalendarDays(projectRunDate, -30);
  const issues: string[] = [];
  let identityUnsafe = false;
  for (const artifact of allArtifacts) {
    const identity = identityDecisions.get(artifact.evidence_id)!;
    if (!identity.accepted) {
      identityUnsafe = true;
      issues.push(
        `Project search identity policy rejected ${artifact.evidence_id}: ${identity.reason ?? "identity mismatch"}`,
      );
    } else if (!identity.decision_eligible) {
      issues.push(
        `${artifact.evidence_id} is retained as identity-limited observation only and cannot drive a decision`,
      );
    }
  }
  const currentDecisionEligibleGscArtifacts =
    decisionEligibleGscArtifacts.filter(
      (artifact) =>
        artifact.fresh_through >= matureEnd &&
        (completeSourceRunFreshThrough(
          input.bundle,
          artifact.evidence_id,
          artifact.fresh_through,
        ) ?? "") >= matureEnd &&
        artifact.payload.date_window.start <= windowStart &&
        artifact.payload.date_window.end >= matureEnd,
    );
  const gscDecisionCoverage = sourceCoverageFor(
    input.bundle,
    "search_console",
    "search_console",
    new Set(
      currentDecisionEligibleGscArtifacts.map((artifact) => artifact.evidence_id),
    ),
  );
  const enablingSiteInventoryArtifacts =
    decisionEligibleSiteInventoryArtifacts.filter(
      (artifact) =>
        artifact.fresh_through >= matureEnd &&
        (completeSourceRunFreshThrough(
          input.bundle,
          artifact.evidence_id,
          artifact.fresh_through,
        ) ?? "") >= matureEnd,
    );
  if (
    currentDecisionEligibleGscArtifacts.length <
    decisionEligibleGscArtifacts.length
  ) {
    issues.push(
      "Stale Search Console rows and embedded inventory were retained for blocking checks but excluded from metrics and enablement",
    );
  }
  if (
    enablingSiteInventoryArtifacts.length <
    decisionEligibleSiteInventoryArtifacts.length
  ) {
    issues.push(
      "Stale standalone site inventory was retained for blocking checks but cannot enable Search Console rows",
    );
  }
  const properties = new Set(
    gscPropertyArtifacts.map((artifact) => artifact.property_id),
  );
  const propertyConflict = properties.size > 1;
  if (propertyConflict) issues.push("Multiple Search Console properties cannot form one baseline");
  const propertyHostConflict = gscPropertyArtifacts.some(
    (artifact) => !searchArtifactHostsMatchProperty(artifact),
  );
  if (propertyHostConflict) {
    issues.push("Search Console page hosts do not match the attested property");
  }

  const observedInventory = [...exactGscArtifacts, ...siteInventoryArtifacts].flatMap(
    (artifact) => artifact.payload.page_inventory,
  );
  const unsafeIndexedLocations = observedInventory.flatMap((page) => [
    ...(page.indexable && isProtectedIndexPath(page.url) ? [page.url] : []),
    ...(page.canonical_url && hasUnsafeProtectedCanonical(page)
      ? [page.canonical_url]
      : []),
  ]);
  if (unsafeIndexedLocations.length > 0) {
    const categories = new Map<string, number>();
    for (const location of unsafeIndexedLocations) {
      const category = protectedIndexPathCategory(location) ?? "protected";
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
    issues.push(
      `Protected learner/admin path categories appear in indexable or canonical inventory: ${[...categories]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, count]) => `${category} (${count})`)
        .join(", ")}`,
    );
  }
  const protectedPerformancePages = [
    ...exactGscArtifacts.flatMap((artifact) =>
      artifact.payload.rows
        .filter(
          (row) =>
            (row.clicks > 0 || row.impressions > 0) &&
            isProtectedIndexPath(row.page),
        )
        .map((row) => row.page),
    ),
    ...gscSummaryArtifacts.flatMap((artifact) =>
      artifact.payload.tables.pages.rows
        .filter(
          (row) =>
            (row.clicks > 0 || row.impressions > 0) &&
            isProtectedIndexPath(row.page),
        )
        .map((row) => row.page),
    ),
  ];
  if (protectedPerformancePages.length > 0) {
    const categories = new Map<string, number>();
    for (const page of protectedPerformancePages) {
      const category = protectedIndexPathCategory(page) ?? "protected";
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
    issues.push(
      `Protected learner/admin path categories appear in Search Console performance rows: ${[
        ...categories,
      ]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, count]) => `${category} (${count})`)
        .join(", ")}`,
    );
  }

  const inventory = new Map<
    string,
    SearchEvidenceV1["payload"]["page_inventory"][number]
  >();
  let inventoryConflict = false;
  for (const artifact of [
    ...currentDecisionEligibleGscArtifacts,
    ...enablingSiteInventoryArtifacts,
  ]) {
    for (const page of artifact.payload.page_inventory) {
      const current = inventory.get(page.url);
      if (
        current &&
        (current.public_enrollment_page !== page.public_enrollment_page ||
          current.indexable !== page.indexable ||
          current.robots_allowed !== page.robots_allowed ||
          current.canonical_url !== page.canonical_url)
      ) {
        inventoryConflict = true;
      } else if (!current) {
        inventory.set(page.url, page);
      }
    }
  }
  if (inventoryConflict) {
    issues.push("Conflicting complete page-inventory rows block SEO analysis");
  }

  const sourceMetadataComplete =
    !identityUnsafe &&
    gscDecisionCoverage === "complete" &&
    currentDecisionEligibleGscArtifacts.length > 0 &&
    !propertyConflict &&
    !propertyHostConflict;
  if (
    exactGscArtifacts.some((artifact) => artifact.data_state === "top_rows") ||
    gscSummaryArtifacts.length > 0
  ) {
    issues.push("Search Console export contains top rows rather than complete coverage");
  }
  if (gscSummaryArtifacts.length > 0) {
    issues.push(
      `${gscSummaryArtifacts.length} Search Console separate-dimension summary artifact${
        gscSummaryArtifacts.length === 1 ? " was" : "s were"
      } retained without fabricating date/query/page/country/device cross-products`,
    );
  }
  if (
    [...exactGscArtifacts, ...gscSummaryArtifacts].some(
      (artifact) => artifact.fresh_through && artifact.fresh_through > matureEnd,
    )
  ) {
    issues.push("Rows newer than the three-day maturity cutoff are excluded from decisions");
  }

  const uniqueRows = new Map<
    string,
    {
      row: SearchEvidenceV1["payload"]["rows"][number];
      evidenceIds: Set<string>;
    }
  >();
  let rowConflict = false;
  for (const artifact of currentDecisionEligibleGscArtifacts) {
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
  const inWindowDecisionRows = [...uniqueRows.values()].filter(
    ({ row }) => row.date >= windowStart && row.date <= matureEnd,
  );
  const inventoryCoversDecisionRows = inWindowDecisionRows.every(({ row }) =>
    (() => {
      const page = inventory.get(row.page);
      const scope = currentDecisionEligibleGscArtifacts
        .map(searchPropertyHostScope)
        .find((candidate) => candidate !== undefined);
      return (
        page !== undefined &&
        (!page.canonical_url ||
          (scope !== undefined &&
            hostIsInScope(page.canonical_url, scope) &&
            !isProtectedIndexPath(page.canonical_url)))
      );
    })(),
  );
  if (!inventoryCoversDecisionRows) {
    issues.push(
      "Verified-complete site inventory does not cover every in-window Search Console page row",
    );
  }
  const sourceComplete =
    sourceMetadataComplete &&
    !rowConflict &&
    !inventoryConflict &&
    inventoryCoversDecisionRows;
  if (!sourceComplete) {
    issues.push("Search Console query/page baseline is partial, stale, or does not cover 28 mature days");
  }

  const rows = inWindowDecisionRows
    .filter(({ row }) => isParentIntentQuery(row.query))
    .filter(({ row }) => {
      const page = inventory.get(row.page);
      return (
        page?.public_enrollment_page === true &&
        page.indexable &&
        page.robots_allowed &&
        !isProtectedIndexPath(row.page) &&
        (!page.canonical_url || !isProtectedIndexPath(page.canonical_url))
      );
    });
  const clicks = rows.reduce((sum, item) => sum + item.row.clicks, 0);
  const impressions = rows.reduce((sum, item) => sum + item.row.impressions, 0);

  if (
    legacyArtifacts.some(
      (artifact) =>
        artifact.payload.generate_lead_events !== undefined ||
        artifact.payload.successful_form_responses !== undefined ||
        artifact.payload.verified_purchases !== undefined,
    )
  ) {
    issues.push(
      "Legacy v1 conversion counters embedded in search evidence are analysis-ineligible; recapture as GA4 v1.1",
    );
  }
  if (legacyGa4Artifacts.length > 0) {
    issues.push(
      "Legacy v1 GA4 evidence uses a conflated search schema and is analysis-ineligible",
    );
  }
  if (ga4Artifacts.length === 0) {
    issues.push("GA4 v1.1 conversion evidence is absent; conversion quality remains a gap");
  }
  const ga4Properties = new Set(ga4Artifacts.map((artifact) => artifact.property_id));
  if (ga4Properties.size > 1) {
    issues.push("Multiple GA4 properties create a conversion-quality gap");
  }
  for (const artifact of ga4Artifacts) {
    const streamUrl =
      artifact.stream.state === "verified" ? artifact.stream.stream_url : undefined;
    const streamHostMatches =
      streamUrl !== undefined &&
      gscPropertyArtifacts.some((gscArtifact) => {
        const scope = searchPropertyHostScope(gscArtifact);
        return scope !== undefined && hostIsInScope(streamUrl, scope);
      });
    if (artifact.stream.state !== "verified") {
      issues.push(
        `GA4 stream identity is unavailable for ${artifact.evidence_id}; conversion quality remains a gap`,
      );
    } else if (!streamHostMatches) {
      issues.push(
        `GA4 stream host does not match the Search Console site context for ${artifact.evidence_id}`,
      );
    }
    const currentMatureWindow =
      artifact.fresh_through >= matureEnd &&
      artifact.payload.date_window.start <= windowStart &&
      artifact.payload.date_window.end >= matureEnd;
    if (!currentMatureWindow) {
      issues.push(
        `GA4 evidence does not cover the current mature window for ${artifact.evidence_id}`,
      );
    }
    if (
      !ga4DecisionEligibleIds.has(artifact.evidence_id) ||
      identityDecisions.get(artifact.evidence_id)?.decision_eligible !== true
    ) {
      issues.push(
        `GA4 source-run provenance is incomplete for ${artifact.evidence_id}`,
      );
    }
    if (artifact.payload.traffic_scope === "unknown") {
      issues.push(`GA4 traffic scope is unknown for ${artifact.evidence_id}`);
    }
    const generateLead = artifact.payload.counts.generate_lead;
    const successfulResponses = artifact.payload.counts.successful_form_responses;
    if (
      generateLead.state === "observed" &&
      successfulResponses.state === "observed" &&
      generateLead.value > successfulResponses.value
    ) {
      issues.push("GA4 generate_lead exceeds successful form responses; attribution is untrusted");
    }
    if (artifact.payload.counts.verified_purchases.state !== "observed") {
      issues.push("Verified-purchase evidence is unavailable; conversion quality remains a gap");
    }
    if (
      artifact.data_state !== "complete" ||
      artifact.payload.event_rows_coverage !== "complete"
    ) {
      issues.push(`GA4 event coverage is incomplete for ${artifact.evidence_id}`);
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
  const propertyId = currentDecisionEligibleGscArtifacts[0]?.property_id;
  const opportunities: OpportunityCandidate[] =
    best &&
    propertyId &&
    sourceComplete &&
    !propertyConflict &&
    !propertyHostConflict
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
      evidence_refs:
        sourceComplete
          ? [
              ...currentDecisionEligibleGscArtifacts.map(
                (artifact) => artifact.evidence_id,
              ),
              ...enablingSiteInventoryArtifacts.map(
                (artifact) => artifact.evidence_id,
              ),
            ].sort()
          : gscPropertyArtifacts.length > 0
            ? gscPropertyArtifacts.map((artifact) => artifact.evidence_id).sort()
          : ["missing:evidence"],
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
      evidence_refs:
        sourceComplete
          ? [
              ...currentDecisionEligibleGscArtifacts.map(
                (artifact) => artifact.evidence_id,
              ),
              ...enablingSiteInventoryArtifacts.map(
                (artifact) => artifact.evidence_id,
              ),
            ].sort()
          : gscPropertyArtifacts.length > 0
            ? gscPropertyArtifacts.map((artifact) => artifact.evidence_id).sort()
          : ["missing:evidence"],
    }),
  ];

  const unsafeIndexing =
    unsafeIndexedLocations.length > 0 || protectedPerformancePages.length > 0;
  const status: LaneAnalysis["status"] =
    identityUnsafe || unsafeIndexing || propertyConflict || propertyHostConflict
    ? "quarantined"
    : !sourceComplete
      ? "baseline_gap"
      : opportunities.length === 0
        ? "observe_more"
        : "eligible";
  const decision: LaneAnalysis["decision"] =
    identityUnsafe || unsafeIndexing || propertyConflict || propertyHostConflict
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
