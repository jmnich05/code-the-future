import { createHash } from "node:crypto";

import { z } from "zod";

import {
  addProjectCalendarDays,
  isAllowedEvidenceProducerMode,
  projectCalendarDate,
} from "./project-policy.js";

export const CAPTURE_BUNDLE_SCHEMA_VERSION =
  "code-the-future.growth-capture-bundle.v1" as const;
export const EVIDENCE_ATTESTATION_SCHEMA_VERSION =
  "code-the-future.growth-evidence.v1" as const;
export const EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1 =
  "code-the-future.growth-evidence.v1.1" as const;
export const GRAPH_STATE_SCHEMA_VERSION =
  "code-the-future.growth-graph-state.v1" as const;
export const PORTFOLIO_ANALYSIS_SCHEMA_VERSION =
  "code-the-future.growth-portfolio-analysis.v1" as const;
export const LEGACY_APPROVAL_PACKAGE_SCHEMA_VERSION =
  "code-the-future.approval-package.v1" as const;
export const APPROVAL_PACKAGE_SCHEMA_VERSION =
  "code-the-future.approval-package.v1.1" as const;
export const CONSENT_REVOCATION_CHECK_MAX_AGE_HOURS = 24 as const;
export const CONSENT_REVOCATION_CHECK_MAX_AGE_MS =
  CONSENT_REVOCATION_CHECK_MAX_AGE_HOURS * 60 * 60 * 1_000;
export const CONTACT_APPROVAL_EVIDENCE_MAX_AGE_DAYS = 7 as const;
export const CONTACT_APPROVAL_EVIDENCE_MAX_AGE_MS =
  CONTACT_APPROVAL_EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1_000;
export const CURRENT_METRIC_DEFINITION_VERSION =
  "ctf-growth-metrics-v1.1" as const;
export const READABLE_LEGACY_METRIC_DEFINITION_VERSIONS = [
  "ctf-growth-metrics-1.0.0",
  "ctf-growth-metrics-v1",
] as const;
export const MetricDefinitionVersionSchema = z.enum([
  CURRENT_METRIC_DEFINITION_VERSION,
  ...READABLE_LEGACY_METRIC_DEFINITION_VERSIONS,
]);

export const StableIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Expected a stable identifier");

export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 digest");

export const IsoInstantSchema = z.string().datetime({ offset: true });
export const IsoDateSchema = z.iso.date();

export const GrowthLaneSchema = z.enum([
  "organic_social",
  "contact_discovery",
  "search_console",
]);
export type GrowthLane = z.infer<typeof GrowthLaneSchema>;

export const EvidenceSourceSchema = z.enum([
  "instagram_insights",
  "facebook_insights",
  "consent_registry",
  "public_web",
  "contact_history",
  "search_console",
  "site_inventory",
  "ga4",
]);
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const DataStateSchema = z.enum([
  "complete",
  "partial",
  "top_rows",
  "unknown",
]);
export const RedactionStatusSchema = z.enum(["public", "redacted", "synthetic"]);
export const ProducerModeSchema = z.enum([
  "authenticated_read",
  "read_only_export",
  "public_web",
  "synthetic_fixture",
]);

export const ImmutableArtifactReferenceSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    sha256: Sha256Schema,
    byte_length: z.number().int().nonnegative(),
    outcome: z.enum(["created", "replayed"]),
  })
  .strict();
export type ImmutableArtifactReference = z.infer<
  typeof ImmutableArtifactReferenceSchema
>;

const EvidenceReferenceBaseSchema = z
  .object({
    evidence_id: StableIdSchema,
    lane: GrowthLaneSchema,
    source: EvidenceSourceSchema,
    artifact_path: z.string().trim().min(1).max(4_096),
    artifact_sha256: Sha256Schema,
    captured_at: IsoInstantSchema,
    fresh_through: IsoDateSchema.optional(),
    data_state: DataStateSchema,
    redaction_status: RedactionStatusSchema,
    producer_mode: ProducerModeSchema,
  })
  .strict();

export const EvidenceReferenceSchema = EvidenceReferenceBaseSchema;
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export const SourceRunStatusSchema = z.enum([
  "verified_complete",
  "verified_partial",
  "auth_required",
  "challenge",
  "transient_failure",
  "unavailable",
]);

export const CaptureSourceRunSchema = z
  .object({
    source_run_id: StableIdSchema,
    lane: GrowthLaneSchema,
    source: EvidenceSourceSchema,
    account_or_property_id: z.string().trim().min(1).max(512),
    status: SourceRunStatusSchema,
    started_at: IsoInstantSchema,
    completed_at: IsoInstantSchema.optional(),
    fresh_through: IsoDateSchema.optional(),
    data_state: DataStateSchema,
    records_captured: z.number().int().nonnegative(),
    evidence_refs: z.array(StableIdSchema).min(1).max(100),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.status.startsWith("verified_") && !run.completed_at) {
      context.addIssue({
        code: "custom",
        path: ["completed_at"],
        message: "Verified source runs require completed_at",
      });
    }
    if (run.status === "verified_complete" && run.data_state !== "complete") {
      context.addIssue({
        code: "custom",
        path: ["data_state"],
        message: "verified_complete requires data_state complete",
      });
    }
    if (
      run.completed_at !== undefined &&
      Date.parse(run.completed_at) < Date.parse(run.started_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["completed_at"],
        message: "Source-run completion cannot precede its start",
      });
    }
  });
export type CaptureSourceRun = z.infer<typeof CaptureSourceRunSchema>;

export const CaptureBundleSchema = z
  .object({
    schema_version: z.literal(CAPTURE_BUNDLE_SCHEMA_VERSION),
    bundle_id: StableIdSchema,
    created_at: IsoInstantSchema,
    objective_window: z
      .object({ start: IsoDateSchema, end: IsoDateSchema })
      .strict(),
    metric_definition_version: MetricDefinitionVersionSchema,
    source_runs: z.array(CaptureSourceRunSchema).min(1).max(24),
    evidence: z.array(EvidenceReferenceSchema).min(1).max(250),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (bundle.objective_window.start > bundle.objective_window.end) {
      context.addIssue({
        code: "custom",
        path: ["objective_window"],
        message: "Objective window start must not be after end",
      });
    }
    const evidenceIds = new Set<string>();
    for (const [index, evidence] of bundle.evidence.entries()) {
      if (evidenceIds.has(evidence.evidence_id)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "evidence_id"],
          message: `Duplicate evidence_id: ${evidence.evidence_id}`,
        });
      }
      evidenceIds.add(evidence.evidence_id);
    }
    const sourceRunIds = new Set<string>();
    for (const [index, run] of bundle.source_runs.entries()) {
      if (sourceRunIds.has(run.source_run_id)) {
        context.addIssue({
          code: "custom",
          path: ["source_runs", index, "source_run_id"],
          message: `Duplicate source_run_id: ${run.source_run_id}`,
        });
      }
      sourceRunIds.add(run.source_run_id);
      for (const evidenceId of run.evidence_refs) {
        const evidence = bundle.evidence.find(
          (candidate) => candidate.evidence_id === evidenceId,
        );
        if (!evidence) {
          context.addIssue({
            code: "custom",
            path: ["source_runs", index, "evidence_refs"],
            message: `Unknown evidence reference: ${evidenceId}`,
          });
        } else if (evidence.lane !== run.lane || evidence.source !== run.source) {
          context.addIssue({
            code: "custom",
            path: ["source_runs", index, "evidence_refs"],
            message: `Evidence ${evidenceId} does not match source-run lane/source`,
          });
        }
      }
    }
  });
export type GrowthCaptureBundle = z.infer<typeof CaptureBundleSchema>;

const EvidenceProducerSchema = z
  .object({
    adapter: z.literal("code-the-future.growth-capture-adapter"),
    version: z.literal("1.0.0"),
    mode: ProducerModeSchema,
  })
  .strict();

const EvidenceProducerV1_1Schema = z
  .object({
    adapter: z.literal("code-the-future.growth-capture-adapter"),
    version: z.literal("1.1.0"),
    mode: ProducerModeSchema,
  })
  .strict();

const EvidenceArtifactBaseShape = {
  schema_version: z.literal(EVIDENCE_ATTESTATION_SCHEMA_VERSION),
  producer: EvidenceProducerSchema,
  evidence_id: StableIdSchema,
  source: EvidenceSourceSchema,
  captured_at: IsoInstantSchema,
  fresh_through: IsoDateSchema.optional(),
  data_state: DataStateSchema,
  redaction_status: RedactionStatusSchema,
} as const;

const EvidenceArtifactV1_1BaseShape = {
  schema_version: z.literal(EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1),
  producer: EvidenceProducerV1_1Schema,
  evidence_id: StableIdSchema,
  source: EvidenceSourceSchema,
  captured_at: IsoInstantSchema,
  fresh_through: IsoDateSchema.optional(),
  data_state: DataStateSchema,
  redaction_status: RedactionStatusSchema,
} as const;

export const SocialPlatformSchema = z.enum(["instagram", "facebook"]);

const SocialFormatSchema = z.enum([
  "image",
  "carousel",
  "reel",
  "video",
  "story",
  "text",
  "other",
]);

const SocialFollowerSnapshotSchema = z
  .object({
    recorded_at: IsoInstantSchema,
    followers: z.number().int().nonnegative(),
    paid_influence: z.enum(["none", "mixed", "unknown"]),
  })
  .strict();

const SocialStrictPostSchema = z
  .object({
    post_id: StableIdSchema,
    published_at: IsoInstantSchema,
    format: SocialFormatSchema,
    hook: z.string().trim().max(1_000).optional(),
    call_to_action: z.string().trim().max(1_000).optional(),
    publishing_window: z.string().trim().max(160).optional(),
    reach: z.number().int().nonnegative(),
    profile_visits: z.number().int().nonnegative(),
    new_follows: z.number().int().nonnegative(),
    shares: z.number().int().nonnegative(),
    saves: z.number().int().nonnegative(),
    substantive_comments: z.number().int().nonnegative(),
    unfollows: z.number().int().nonnegative(),
    hides: z.number().int().nonnegative(),
    reports: z.number().int().nonnegative(),
    paid_status: z.enum(["organic", "boosted", "paid", "unknown"]),
    experiment_id: StableIdSchema.optional(),
    arm: z.string().trim().min(1).max(160).optional(),
    controlled_variable: z
      .enum(["hook", "format", "call_to_action", "publishing_window"])
      .optional(),
    asset_refs: z.array(StableIdSchema).max(50),
  })
  .strict();

const SocialAssetSchema = z
  .object({
    asset_id: StableIdSchema,
    artifact_path: z.string().trim().min(1).max(4_096),
    content_sha256: Sha256Schema,
    byte_length: z.number().int().nonnegative(),
    subject_classification: z.enum([
      "no_person",
      "adult_only",
      "child_or_unknown",
    ]),
    media_kinds: z
      .array(z.enum(["image", "video", "voice", "name", "artifact"]))
      .min(1)
      .max(5),
    consent_refs: z.array(StableIdSchema).max(20),
  })
  .strict();

const SocialConsentSchema = z
  .object({
    consent_id: StableIdSchema,
    asset_id: StableIdSchema,
    subject_basis: z.enum(["none_needed", "adult", "guardian"]),
    allowed_channels: z
      .array(z.enum(["instagram", "facebook", "website", "paid_social"]))
      .min(1)
      .max(4),
    allowed_media: z
      .array(z.enum(["image", "video", "voice", "name", "artifact"]))
      .min(1)
      .max(5),
    evidence_reference: z.string().trim().min(1).max(2_048),
    granted_at: IsoInstantSchema,
    revocation_checked_at: IsoInstantSchema,
    expires_at: IsoInstantSchema.optional(),
    revoked_at: IsoInstantSchema.optional(),
  })
  .strict();

const SocialEvidencePayloadV1Schema = z
  .object({
    follower_snapshots: z.array(SocialFollowerSnapshotSchema).max(2_000),
    posts: z.array(SocialStrictPostSchema).max(10_000),
    assets: z.array(SocialAssetSchema).max(5_000),
    consents: z.array(SocialConsentSchema).max(5_000),
  })
  .strict();

const MetricUnavailableSchema = z
  .object({
    state: z.literal("unavailable"),
    reason: z.enum([
      "not_exposed",
      "data_unavailable",
      "not_applicable",
      "permission_limited",
    ]),
  })
  .strict();

function integerMetricAvailabilitySchema<const NativeField extends string>(
  nativeField: NativeField,
) {
  return z.discriminatedUnion("state", [
    z
      .object({
        state: z.literal("observed"),
        value: z.number().int().nonnegative(),
        native_field: z.literal(nativeField),
      })
      .strict(),
    MetricUnavailableSchema,
  ]);
}

function percentMetricAvailabilitySchema<const NativeField extends string>(
  nativeField: NativeField,
) {
  return z.discriminatedUnion("state", [
    z
      .object({
        state: z.literal("observed"),
        value: z.number().min(0).max(100),
        native_field: z.literal(nativeField),
      })
      .strict(),
    MetricUnavailableSchema,
  ]);
}

const PartialSocialPublicationTimeSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("verified_instant"),
      published_at: IsoInstantSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("displayed_local_time"),
      displayed_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u),
      timezone: z.literal("unknown"),
      displayed_text: z.string().trim().min(1).max(160).optional(),
    })
    .strict(),
]);

const PartialSocialPostObservationSchema = z
  .object({
    post_id: StableIdSchema,
    platform_content_id: z.string().trim().min(1).max(512),
    business_suite_content_id: z.string().trim().min(1).max(512).optional(),
    publication_time: PartialSocialPublicationTimeSchema,
    format: SocialFormatSchema,
    paid_status: z.enum(["organic", "boosted", "paid", "unknown"]),
    provenance: z
      .object({
        surface: z.enum([
          "meta_business_suite_post_insights",
          "meta_business_suite_overview",
          "meta_export",
        ]),
        source_url: z.string().url().max(4_096),
        source_url_precision: z.enum(["exact", "sanitized_surface"]),
        observed_at: IsoInstantSchema,
        observed_at_basis: z.enum(["browser_observation", "capture_persistence"]),
        measurement_basis: z.enum([
          "lifetime_through_capture",
          "dated_window",
        ]),
      })
      .strict(),
    publication_proof: z
      .object({
        url: z.string().url().max(4_096),
        verification: z.literal("authenticated_platform_link"),
      })
      .strict()
      .optional(),
    asset_attestation_state: z.literal("not_ingested"),
    metrics: z
      .object({
        reach: integerMetricAvailabilitySchema("reach"),
        profile_visits: integerMetricAvailabilitySchema("profile_visits"),
        new_follows: integerMetricAvailabilitySchema("new_follows"),
        shares: integerMetricAvailabilitySchema("shares"),
        saves: integerMetricAvailabilitySchema("saves"),
        substantive_comments: integerMetricAvailabilitySchema(
          "substantive_comments",
        ),
        unfollows: integerMetricAvailabilitySchema("unfollows"),
        hides: integerMetricAvailabilitySchema("hides"),
        reports: integerMetricAvailabilitySchema("reports"),
      })
      .strict(),
    supplemental_metrics: z
      .object({
        views: integerMetricAvailabilitySchema("views"),
        viewers: integerMetricAvailabilitySchema("viewers"),
        interactions: integerMetricAvailabilitySchema("interactions"),
        link_clicks: integerMetricAvailabilitySchema("link_clicks"),
        follows: integerMetricAvailabilitySchema("follows"),
        likes_reactions: integerMetricAvailabilitySchema("likes_reactions"),
        comments: integerMetricAvailabilitySchema("comments"),
        average_watch_time_seconds: integerMetricAvailabilitySchema(
          "average_watch_time_seconds",
        ),
        total_watch_time_seconds: integerMetricAvailabilitySchema(
          "total_watch_time_seconds",
        ),
        paid_distribution_percent: percentMetricAvailabilitySchema(
          "paid_distribution_percent",
        ),
        distribution_followers_percent: percentMetricAvailabilitySchema(
          "distribution_followers_percent",
        ),
        distribution_recommendations_percent: percentMetricAvailabilitySchema(
          "distribution_recommendations_percent",
        ),
        distribution_shares_percent: percentMetricAvailabilitySchema(
          "distribution_shares_percent",
        ),
      })
      .strict(),
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.provenance.source_url_precision !== "sanitized_surface") {
      return;
    }
    const sourceUrl = new URL(observation.provenance.source_url);
    if (sourceUrl.search !== "" || sourceUrl.hash !== "") {
      context.addIssue({
        code: "custom",
        path: ["provenance", "source_url"],
        message:
          "A sanitized authenticated surface URL cannot retain a query or fragment",
      });
    }
  });

const SocialEvidencePayloadV1_1Schema = SocialEvidencePayloadV1Schema.extend({
  partial_post_observations: z
    .array(PartialSocialPostObservationSchema)
    .max(10_000),
}).strict();

const MetaPlatformIdentitySchema = z
  .object({
    asset_id: z.string().regex(/^\d+$/u).max(160),
    page_id: z.string().regex(/^\d+$/u).max(160),
    business_portfolio_id: z.string().regex(/^\d+$/u).max(160).optional(),
  })
  .strict();

const MetaApprovalIdentitySchema = z
  .object({
    asset_id: z.string().regex(/^\d+$/u).max(160),
    page_id: z.string().regex(/^\d+$/u).max(160),
    business_portfolio_id: z.string().regex(/^\d+$/u).max(160),
  })
  .strict();

type SocialEvidenceRefinementInput = {
  schema_version:
    | typeof EVIDENCE_ATTESTATION_SCHEMA_VERSION
    | typeof EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1;
  captured_at: string;
  fresh_through?: string | undefined;
  data_state: z.infer<typeof DataStateSchema>;
  source: "instagram_insights" | "facebook_insights" | "consent_registry";
  platform: z.infer<typeof SocialPlatformSchema>;
  meta_identity?: z.infer<typeof MetaPlatformIdentitySchema> | undefined;
  payload:
    | z.infer<typeof SocialEvidencePayloadV1Schema>
    | z.infer<typeof SocialEvidencePayloadV1_1Schema>;
};

function refineSocialEvidenceArtifact(
  artifact: SocialEvidenceRefinementInput,
  context: z.RefinementCtx,
): void {
  if (
    artifact.schema_version === EVIDENCE_ATTESTATION_SCHEMA_VERSION_V1_1 &&
    artifact.data_state === "complete" &&
    artifact.fresh_through === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["fresh_through"],
      message: "Complete v1.1 social evidence requires an explicit fresh-through date",
    });
  }
  if (artifact.platform !== "facebook" && artifact.meta_identity !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["meta_identity"],
      message: "Typed Meta Page identity is supported only for Facebook evidence",
    });
  }
  const expectedInsightSource =
    artifact.platform === "instagram" ? "instagram_insights" : "facebook_insights";
  if (
    artifact.source !== "consent_registry" &&
    artifact.source !== expectedInsightSource
  ) {
    context.addIssue({
      code: "custom",
      path: ["source"],
      message: `${artifact.platform} performance evidence requires source ${expectedInsightSource}`,
    });
  }
  if (artifact.source === "consent_registry") {
    if (artifact.payload.follower_snapshots.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["payload", "follower_snapshots"],
        message: "Consent-registry evidence cannot contain follower performance rows",
      });
    }
    if (artifact.payload.posts.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["payload", "posts"],
        message: "Consent-registry evidence cannot contain post performance rows",
      });
    }
    if (
      "partial_post_observations" in artifact.payload &&
      artifact.payload.partial_post_observations.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "partial_post_observations"],
        message: "Consent-registry evidence cannot contain partial performance rows",
      });
    }
  }
  const consentById = new Map(
    artifact.payload.consents.map((consent) => [consent.consent_id, consent]),
  );
  const capturedAtMs = Date.parse(artifact.captured_at);
  const assetIds = new Set(artifact.payload.assets.map((asset) => asset.asset_id));
  const seenConsentIds = new Set<string>();

  for (const [consentIndex, consent] of artifact.payload.consents.entries()) {
    if (seenConsentIds.has(consent.consent_id)) {
      context.addIssue({
        code: "custom",
        path: ["payload", "consents", consentIndex, "consent_id"],
        message: `Duplicate social consent_id: ${consent.consent_id}`,
      });
    }
    seenConsentIds.add(consent.consent_id);
    if (new Set(consent.allowed_channels).size !== consent.allowed_channels.length) {
      context.addIssue({
        code: "custom",
        path: ["payload", "consents", consentIndex, "allowed_channels"],
        message: "Consent allowed channels must be unique",
      });
    }
    if (new Set(consent.allowed_media).size !== consent.allowed_media.length) {
      context.addIssue({
        code: "custom",
        path: ["payload", "consents", consentIndex, "allowed_media"],
        message: "Consent allowed media must be unique",
      });
    }
    const checkedAtMs = Date.parse(consent.revocation_checked_at);
    if (
      checkedAtMs < Date.parse(consent.granted_at) ||
      checkedAtMs > capturedAtMs ||
      capturedAtMs - checkedAtMs > CONSENT_REVOCATION_CHECK_MAX_AGE_MS
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "consents", consentIndex, "revocation_checked_at"],
        message:
          "Consent revocation status must be checked from captured evidence within 24 hours of capture",
      });
    }
  }

  const seenAssetIds = new Set<string>();
  for (const [assetIndex, asset] of artifact.payload.assets.entries()) {
    if (seenAssetIds.has(asset.asset_id)) {
      context.addIssue({
        code: "custom",
        path: ["payload", "assets", assetIndex, "asset_id"],
        message: `Duplicate social asset_id: ${asset.asset_id}`,
      });
    }
    seenAssetIds.add(asset.asset_id);
    if (new Set(asset.consent_refs).size !== asset.consent_refs.length) {
      context.addIssue({
        code: "custom",
        path: ["payload", "assets", assetIndex, "consent_refs"],
        message: "Asset consent references must be unique",
      });
    }
    if (new Set(asset.media_kinds).size !== asset.media_kinds.length) {
      context.addIssue({
        code: "custom",
        path: ["payload", "assets", assetIndex, "media_kinds"],
        message: "Asset media kinds must be unique",
      });
    }
    if (
      asset.subject_classification === "no_person" &&
      asset.media_kinds.some((kind) => ["voice", "name", "artifact"].includes(kind))
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "assets", assetIndex, "subject_classification"],
        message: "no_person cannot be used for voice, name, or artifact media",
      });
    }

    for (const [consentIndex, consentId] of asset.consent_refs.entries()) {
      const consent = consentById.get(consentId);
      if (!consent || consent.asset_id !== asset.asset_id) {
        context.addIssue({
          code: "custom",
          path: ["payload", "assets", assetIndex, "consent_refs", consentIndex],
          message: "Consent reference is missing or belongs to another asset",
        });
      }
    }
  }

  for (const [postIndex, post] of artifact.payload.posts.entries()) {
    if (Date.parse(post.published_at) > capturedAtMs) {
      context.addIssue({
        code: "custom",
        path: ["payload", "posts", postIndex, "published_at"],
        message: "A complete social post cannot be published after its evidence capture",
      });
    }
    if (new Set(post.asset_refs).size !== post.asset_refs.length) {
      context.addIssue({
        code: "custom",
        path: ["payload", "posts", postIndex, "asset_refs"],
        message: "Post asset references must be unique",
      });
    }
    for (const [assetIndex, assetId] of post.asset_refs.entries()) {
      if (!assetIds.has(assetId)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "posts", postIndex, "asset_refs", assetIndex],
          message: "Post references an unknown asset",
        });
      }
    }
  }

  for (const [snapshotIndex, snapshot] of artifact.payload.follower_snapshots.entries()) {
    if (Date.parse(snapshot.recorded_at) > capturedAtMs) {
      context.addIssue({
        code: "custom",
        path: ["payload", "follower_snapshots", snapshotIndex, "recorded_at"],
        message: "A follower snapshot cannot be recorded after its evidence capture",
      });
    }
  }

  if (!("partial_post_observations" in artifact.payload)) return;
  const referencedAssetIds = new Set(
    artifact.payload.posts.flatMap((post) => post.asset_refs),
  );
  for (const [assetIndex, asset] of artifact.payload.assets.entries()) {
    if (!referencedAssetIds.has(asset.asset_id)) {
      context.addIssue({
        code: "custom",
        path: ["payload", "assets", assetIndex, "asset_id"],
        message: "v1.1 social evidence cannot retain an orphan media asset",
      });
    }
  }
  const referencedConsentIds = new Set(
    artifact.payload.assets.flatMap((asset) => asset.consent_refs),
  );
  for (const [consentIndex, consent] of artifact.payload.consents.entries()) {
    if (!referencedConsentIds.has(consent.consent_id)) {
      context.addIssue({
        code: "custom",
        path: ["payload", "consents", consentIndex, "consent_id"],
        message: "v1.1 social evidence cannot retain an orphan consent record",
      });
    }
  }
  if (
    artifact.payload.partial_post_observations.length > 0 &&
    artifact.data_state === "complete"
  ) {
    context.addIssue({
      code: "custom",
      path: ["data_state"],
      message: "Partial social observations cannot be declared complete",
    });
  }
  if (
    artifact.data_state !== "complete" &&
    (artifact.payload.posts.length > 0 ||
      artifact.payload.assets.length > 0 ||
      artifact.payload.consents.length > 0)
  ) {
    context.addIssue({
      code: "custom",
      path: ["payload"],
      message:
        "Non-complete v1.1 social evidence must retain only minimized partial observations and follower snapshots",
    });
  }
  if (artifact.data_state === "complete") {
    for (const [postIndex, post] of artifact.payload.posts.entries()) {
      if (post.format !== "text" && post.asset_refs.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["payload", "posts", postIndex, "asset_refs"],
          message: "Complete non-text social posts require an attested asset",
        });
      }
    }
  }
  const seenPostIds = new Set<string>();
  for (const [postIndex, post] of artifact.payload.posts.entries()) {
    if (seenPostIds.has(post.post_id)) {
      context.addIssue({
        code: "custom",
        path: ["payload", "posts", postIndex, "post_id"],
        message: `Duplicate social post_id: ${post.post_id}`,
      });
    }
    seenPostIds.add(post.post_id);
  }
  for (const [postIndex, post] of artifact.payload.partial_post_observations.entries()) {
    if (seenPostIds.has(post.post_id)) {
      context.addIssue({
        code: "custom",
        path: ["payload", "partial_post_observations", postIndex, "post_id"],
        message: `Duplicate social post_id across complete and partial rows: ${post.post_id}`,
      });
    }
    seenPostIds.add(post.post_id);
    if (
      post.publication_time.state === "verified_instant" &&
      Date.parse(post.publication_time.published_at) > capturedAtMs
    ) {
      context.addIssue({
        code: "custom",
        path: [
          "payload",
          "partial_post_observations",
          postIndex,
          "publication_time",
          "published_at",
        ],
        message: "A verified publication instant cannot follow its evidence capture",
      });
    }
    if (Date.parse(post.provenance.observed_at) > capturedAtMs) {
      context.addIssue({
        code: "custom",
        path: [
          "payload",
          "partial_post_observations",
          postIndex,
          "provenance",
          "observed_at",
        ],
        message: "A partial observation cannot be observed after its evidence capture",
      });
    }
  }
}

export const SocialEvidenceArtifactV1Schema = z
  .object({
    ...EvidenceArtifactBaseShape,
    lane: z.literal("organic_social"),
    source: z.enum([
      "instagram_insights",
      "facebook_insights",
      "consent_registry",
    ]),
    account_id: z.string().trim().min(1).max(512),
    platform: SocialPlatformSchema,
    payload: SocialEvidencePayloadV1Schema,
  })
  .strict()
  .superRefine(refineSocialEvidenceArtifact);

export const SocialEvidenceArtifactV1_1Schema = z
  .object({
    ...EvidenceArtifactV1_1BaseShape,
    lane: z.literal("organic_social"),
    source: z.enum([
      "instagram_insights",
      "facebook_insights",
      "consent_registry",
    ]),
    account_id: z.string().trim().min(1).max(512),
    platform: SocialPlatformSchema,
    meta_identity: MetaPlatformIdentitySchema.optional(),
    payload: SocialEvidencePayloadV1_1Schema,
  })
  .strict()
  .superRefine(refineSocialEvidenceArtifact);

export const SocialEvidenceArtifactSchema = z.union([
  SocialEvidenceArtifactV1Schema,
  SocialEvidenceArtifactV1_1Schema,
]);

export const PermissionBasisSchema = z.enum([
  "public_org_channel",
  "public_group_admin_channel",
  "direct_parent_opt_in",
  "introduced_referral_with_permission",
  "unsupported",
]);

export const ContactEvidenceArtifactSchema = z
  .object({
    ...EvidenceArtifactBaseShape,
    lane: z.literal("contact_discovery"),
    source: z.enum(["public_web", "contact_history"]),
    account_or_collection_id: z.string().trim().min(1).max(512),
    payload: z
      .object({
        history_complete: z.boolean(),
        records: z
          .array(
            z
              .object({
                record_id: StableIdSchema,
                organization_name: z.string().trim().min(1).max(1_000),
                contact_label: z.string().trim().min(1).max(1_000).optional(),
                public_contact_channel: z
                  .string()
                  .trim()
                  .min(1)
                  .max(2_048)
                  .optional(),
                source_url: z.string().url().max(4_096),
                source_type: z.enum([
                  "library",
                  "pta_pto",
                  "school",
                  "homeschool",
                  "stem_org",
                  "camp",
                  "youth_nonprofit",
                  "neighborhood_org",
                  "public_group_admin",
                  "referral",
                  "other",
                ]),
                group_rules_captured: z.boolean(),
                group_rules_url: z.string().url().max(4_096).optional(),
                group_rules_artifact_path: z.string().trim().min(1).max(4_096).optional(),
                group_rules_content_sha256: Sha256Schema.optional(),
                group_rules_byte_length: z.number().int().nonnegative().optional(),
                group_rules_captured_at: IsoInstantSchema.optional(),
                geography: z.string().trim().min(1).max(1_000),
                verified_at: IsoInstantSchema,
                permission_basis: PermissionBasisSchema,
                subject_type: z.enum([
                  "organization",
                  "public_group_admin",
                  "parent_opt_in",
                  "parent_referral",
                  "minor",
                  "private_group_member",
                  "personal_parent_profile",
                ]),
                source_visibility: z.enum(["public", "private", "unknown"]),
                contains_minor_data: z.boolean(),
                do_not_contact: z.boolean(),
                mission_fit: z.number().int().min(0).max(5),
                louisville_relevance: z.number().int().min(0).max(5),
                parent_community_access: z.number().int().min(0).max(5),
                actionability: z.number().int().min(0).max(5),
                identity_hint: z.string().trim().min(1).max(512).optional(),
              })
              .strict()
              .superRefine((record, context) => {
                const groupRuleFields = [
                  record.group_rules_url,
                  record.group_rules_artifact_path,
                  record.group_rules_content_sha256,
                  record.group_rules_byte_length,
                  record.group_rules_captured_at,
                ];
                if (
                  record.group_rules_captured &&
                  groupRuleFields.some((value) => value === undefined)
                ) {
                  context.addIssue({
                    code: "custom",
                    path: ["group_rules_url"],
                    message:
                      "Captured group rules require URL, immutable byte attestation, and capture time",
                  });
                }
                if (
                  !record.group_rules_captured &&
                  groupRuleFields.some((value) => value !== undefined)
                ) {
                  context.addIssue({
                    code: "custom",
                    path: ["group_rules_captured"],
                    message: "Uncaptured group rules cannot carry artifact metadata",
                  });
                }
              }),
          )
          .max(25_000),
        prior_identity_fingerprints: z.array(Sha256Schema).max(50_000),
        do_not_contact_identity_fingerprints: z.array(Sha256Schema).max(50_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((artifact, context) => {
    const capturedAtMs = Date.parse(artifact.captured_at);
    const recordIds = new Set<string>();
    for (const [recordIndex, record] of artifact.payload.records.entries()) {
      if (recordIds.has(record.record_id)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "records", recordIndex, "record_id"],
          message: `Duplicate contact record_id: ${record.record_id}`,
        });
      }
      recordIds.add(record.record_id);
      if (Date.parse(record.verified_at) > capturedAtMs) {
        context.addIssue({
          code: "custom",
          path: ["payload", "records", recordIndex, "verified_at"],
          message: "A contact cannot be verified after its evidence capture",
        });
      }
      if (
        record.group_rules_captured_at &&
        Date.parse(record.group_rules_captured_at) > capturedAtMs
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "records", recordIndex, "group_rules_captured_at"],
          message: "Group rules cannot be captured after their parent evidence artifact",
        });
      }
    }
  });

export const SearchConsoleEvidenceArtifactV1Schema = z
  .object({
    ...EvidenceArtifactBaseShape,
    lane: z.literal("search_console"),
    source: z.enum(["search_console", "site_inventory", "ga4"]),
    fresh_through: IsoDateSchema,
    property_id: z.string().trim().min(1).max(1_024),
    property_url: z.string().url().max(4_096),
    payload: z
      .object({
        dimensions: z.tuple([
          z.literal("date"),
          z.literal("query"),
          z.literal("page"),
          z.literal("country"),
          z.literal("device"),
        ]),
        date_window: z.object({ start: IsoDateSchema, end: IsoDateSchema }).strict(),
        rows: z
          .array(
            z
              .object({
                date: IsoDateSchema,
                query: z.string().trim().min(1).max(2_048),
                page: z.string().url().max(4_096),
                country: z.string().trim().min(1).max(64),
                device: z.enum(["DESKTOP", "MOBILE", "TABLET", "UNKNOWN"]),
                clicks: z.number().int().nonnegative(),
                impressions: z.number().int().nonnegative(),
                position: z.number().nonnegative(),
              })
              .strict(),
          )
          .max(250_000),
        page_inventory: z
          .array(
            z
              .object({
                url: z.string().url().max(4_096),
                public_enrollment_page: z.boolean(),
                indexable: z.boolean(),
                canonical_url: z.string().url().max(4_096).optional(),
                robots_allowed: z.boolean(),
              })
              .strict(),
          )
          .max(25_000),
        generate_lead_events: z.number().int().nonnegative().optional(),
        successful_form_responses: z.number().int().nonnegative().optional(),
        verified_purchases: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((artifact, context) => {
    const { start, end } = artifact.payload.date_window;
    const captureDate = projectCalendarDate(artifact.captured_at);
    if (start > end) {
      context.addIssue({
        code: "custom",
        path: ["payload", "date_window"],
        message: "Search Console date window start must not be after end",
      });
    }
    if (end > artifact.fresh_through) {
      context.addIssue({
        code: "custom",
        path: ["fresh_through"],
        message: "Search Console fresh-through must cover the captured date window",
      });
    }
    if (end > captureDate) {
      context.addIssue({
        code: "custom",
        path: ["payload", "date_window", "end"],
        message: "Search Console date window cannot end after evidence capture",
      });
    }
    for (const [rowIndex, row] of artifact.payload.rows.entries()) {
      if (
        row.date < start ||
        row.date > end ||
        row.date > artifact.fresh_through ||
        row.date > captureDate
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "rows", rowIndex, "date"],
          message:
            "Search Console row date must fall within the declared, fresh, captured window",
        });
      }
    }
  });

const SearchDimensionCoverageSchema = z.enum([
  "complete",
  "top_rows",
  "partial",
  "unknown",
]);

const SearchSummaryRowMetricsShape = {
  clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
} as const;

const SearchConsoleSummaryPayloadSchema = z
  .object({
    grain: z.literal("separate_dimension_tables"),
    date_window: z.object({ start: IsoDateSchema, end: IsoDateSchema }).strict(),
    totals: z
      .object({
        clicks: z.number().int().nonnegative(),
        impressions: z.number().int().nonnegative(),
        ctr_rate: z.number().min(0).max(1),
        average_position: z.number().nonnegative(),
      })
      .strict(),
    tables: z
      .object({
        dates: z
          .object({
            coverage: SearchDimensionCoverageSchema,
            rows: z
              .array(
                z
                  .object({
                    date: IsoDateSchema,
                    ...SearchSummaryRowMetricsShape,
                  })
                  .strict(),
              )
              .max(25_000),
          })
          .strict(),
        queries: z
          .object({
            coverage: SearchDimensionCoverageSchema,
            rows: z
              .array(
                z
                  .object({
                    query: z.string().trim().min(1).max(2_048),
                    ...SearchSummaryRowMetricsShape,
                  })
                  .strict(),
              )
              .max(25_000),
          })
          .strict(),
        pages: z
          .object({
            coverage: SearchDimensionCoverageSchema,
            rows: z
              .array(
                z
                  .object({
                    page: z.string().url().max(4_096),
                    ...SearchSummaryRowMetricsShape,
                  })
                  .strict(),
              )
              .max(25_000),
          })
          .strict(),
        countries: z
          .object({
            coverage: SearchDimensionCoverageSchema,
            rows: z
              .array(
                z
                  .object({
                    country: z.string().trim().min(1).max(160),
                    ...SearchSummaryRowMetricsShape,
                  })
                  .strict(),
              )
              .max(25_000),
          })
          .strict(),
        devices: z
          .object({
            coverage: SearchDimensionCoverageSchema,
            rows: z
              .array(
                z
                  .object({
                    device: z.enum(["DESKTOP", "MOBILE", "TABLET", "UNKNOWN"]),
                    ...SearchSummaryRowMetricsShape,
                  })
                  .strict(),
              )
              .max(4),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const SearchConsoleSummaryEvidenceArtifactSchema = z
  .object({
    ...EvidenceArtifactV1_1BaseShape,
    lane: z.literal("search_console"),
    source: z.literal("search_console"),
    fresh_through: IsoDateSchema,
    data_state: z.enum(["partial", "top_rows"]),
    property_id: z.string().trim().min(1).max(1_024),
    property_url: z.string().url().max(4_096),
    payload: SearchConsoleSummaryPayloadSchema,
  })
  .strict()
  .superRefine((artifact, context) => {
    const { start, end } = artifact.payload.date_window;
    const captureDate = projectCalendarDate(artifact.captured_at);
    if (start > end) {
      context.addIssue({
        code: "custom",
        path: ["payload", "date_window"],
        message: "Search Console date window start must not be after end",
      });
    }
    if (end > artifact.fresh_through) {
      context.addIssue({
        code: "custom",
        path: ["fresh_through"],
        message: "Search Console fresh-through must cover the captured date window",
      });
    }
    if (end > captureDate) {
      context.addIssue({
        code: "custom",
        path: ["payload", "date_window", "end"],
        message: "Search Console date window cannot end after evidence capture",
      });
    }
    const dateKeys = new Set<string>();
    for (const [index, row] of artifact.payload.tables.dates.rows.entries()) {
      if (
        row.date < start ||
        row.date > end ||
        row.date > artifact.fresh_through ||
        row.date > captureDate
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "tables", "dates", "rows", index, "date"],
          message: "Search Console date row falls outside the declared window",
        });
      }
      if (dateKeys.has(row.date)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "tables", "dates", "rows", index, "date"],
          message: `Duplicate Search Console date row: ${row.date}`,
        });
      }
      dateKeys.add(row.date);
    }
    if (artifact.payload.tables.dates.coverage === "complete") {
      const expectedDates = new Set<string>();
      for (
        let current = start;
        current <= end;
        current = addProjectCalendarDays(current, 1)
      ) {
        expectedDates.add(current);
      }
      if (
        dateKeys.size !== expectedDates.size ||
        [...expectedDates].some((date) => !dateKeys.has(date))
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "tables", "dates", "coverage"],
          message:
            "Complete Search Console date coverage requires every date in the declared window",
        });
      }
    }
    const tableKeys: Array<
      [
        "queries" | "pages" | "countries" | "devices",
        readonly { key: string; index: number }[],
      ]
    > = [
      [
        "queries",
        artifact.payload.tables.queries.rows.map((row, index) => ({
          key: row.query,
          index,
        })),
      ],
      [
        "pages",
        artifact.payload.tables.pages.rows.map((row, index) => ({
          key: row.page,
          index,
        })),
      ],
      [
        "countries",
        artifact.payload.tables.countries.rows.map((row, index) => ({
          key: row.country,
          index,
        })),
      ],
      [
        "devices",
        artifact.payload.tables.devices.rows.map((row, index) => ({
          key: row.device,
          index,
        })),
      ],
    ];
    for (const [table, rows] of tableKeys) {
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.key)) {
          context.addIssue({
            code: "custom",
            path: ["payload", "tables", table, "rows", row.index],
            message: `Duplicate Search Console ${table} row: ${row.key}`,
          });
        }
        seen.add(row.key);
      }
    }
  });

const Ga4CountUnavailableSchema = z
  .object({
    state: z.literal("unavailable"),
    reason: z.enum([
      "not_exposed",
      "data_unavailable",
      "permission_limited",
      "incomplete_event_list",
    ]),
  })
  .strict();

function ga4CountAvailabilitySchema<const NativeField extends string>(
  nativeField: NativeField,
) {
  return z.discriminatedUnion("state", [
    z
      .object({
        state: z.literal("observed"),
        value: z.number().int().nonnegative(),
        native_field: z.literal(nativeField),
        derivation: z.enum(["direct_event_row", "complete_event_list_absence"]),
      })
      .strict(),
    Ga4CountUnavailableSchema,
  ]);
}

const Ga4EventRowSchema = z
  .object({
    event_name: StableIdSchema,
    event_count: z.number().int().nonnegative(),
    total_users: z.number().int().nonnegative(),
  })
  .strict();

export const Ga4EvidenceArtifactSchema = z
  .object({
    ...EvidenceArtifactV1_1BaseShape,
    lane: z.literal("search_console"),
    source: z.literal("ga4"),
    fresh_through: IsoDateSchema,
    property_id: z.string().trim().min(1).max(1_024),
    stream: z.discriminatedUnion("state", [
      z
        .object({
          state: z.literal("verified"),
          stream_url: z.string().url().max(4_096),
        })
        .strict(),
      z
        .object({
          state: z.literal("unavailable"),
          reason: z.enum([
            "not_exposed_in_report",
            "permission_limited",
            "not_configured",
          ]),
        })
        .strict(),
    ]),
    measurement_id: z.string().trim().min(1).max(160).optional(),
    payload: z
      .object({
        date_window: z.object({ start: IsoDateSchema, end: IsoDateSchema }).strict(),
        traffic_scope: z.enum(["all_traffic", "organic_search", "unknown"]),
        event_rows_coverage: z.enum(["complete", "partial", "top_rows", "unknown"]),
        totals: z
          .object({
            event_count: z.number().int().nonnegative(),
            total_users: z.number().int().nonnegative(),
            total_revenue: z.number().nonnegative(),
          })
          .strict(),
        events: z.array(Ga4EventRowSchema).max(25_000),
        counts: z
          .object({
            generate_lead: ga4CountAvailabilitySchema("generate_lead"),
            successful_form_responses: ga4CountAvailabilitySchema(
              "successful_form_responses",
            ),
            verified_purchases: ga4CountAvailabilitySchema("purchase"),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((artifact, context) => {
    const { start, end } = artifact.payload.date_window;
    const captureDate = projectCalendarDate(artifact.captured_at);
    if (start > end) {
      context.addIssue({
        code: "custom",
        path: ["payload", "date_window"],
        message: "GA4 date window start must not be after end",
      });
    }
    if (end > artifact.fresh_through) {
      context.addIssue({
        code: "custom",
        path: ["fresh_through"],
        message: "GA4 fresh-through must cover the captured date window",
      });
    }
    if (end > captureDate) {
      context.addIssue({
        code: "custom",
        path: ["payload", "date_window", "end"],
        message: "GA4 date window cannot end after evidence capture",
      });
    }
    const eventCounts = new Map<string, number>();
    for (const [eventIndex, event] of artifact.payload.events.entries()) {
      if (eventCounts.has(event.event_name)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "events", eventIndex, "event_name"],
          message: `Duplicate GA4 event row: ${event.event_name}`,
        });
      }
      eventCounts.set(event.event_name, event.event_count);
    }
    const eventTotal = artifact.payload.events.reduce(
      (sum, event) => sum + event.event_count,
      0,
    );
    if (
      artifact.payload.event_rows_coverage === "complete" &&
      eventTotal !== artifact.payload.totals.event_count
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "totals", "event_count"],
        message: "Complete GA4 event rows must reconcile to the total event count",
      });
    }
    const counts = Object.entries(artifact.payload.counts) as Array<
      [
        keyof typeof artifact.payload.counts,
        (typeof artifact.payload.counts)[keyof typeof artifact.payload.counts],
      ]
    >;
    for (const [metricName, count] of counts) {
      if (count.state !== "observed") continue;
      const eventCount = eventCounts.get(count.native_field);
      if (
        count.derivation === "direct_event_row" &&
        eventCount !== count.value
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "counts", metricName],
          message: "Direct GA4 count must match its exact event row",
        });
      }
      if (
        count.derivation === "complete_event_list_absence" &&
        (artifact.payload.event_rows_coverage !== "complete" ||
          count.value !== 0 ||
          eventCount !== undefined)
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "counts", metricName],
          message:
            "An absent GA4 event can be zero only when the complete event list was captured",
        });
      }
    }
    if (
      artifact.data_state === "complete" &&
      (artifact.payload.event_rows_coverage !== "complete" ||
        counts.some(([, count]) => count.state !== "observed") ||
        artifact.payload.traffic_scope === "unknown")
    ) {
      context.addIssue({
        code: "custom",
        path: ["data_state"],
        message:
          "Complete GA4 evidence requires complete event rows, observed counts, and a known traffic scope",
      });
    }
    if (artifact.data_state === "complete" && artifact.stream.state !== "verified") {
      context.addIssue({
        code: "custom",
        path: ["stream"],
        message: "Complete GA4 evidence requires a verified web-stream URL",
      });
    }
  });

export const SearchConsoleEvidenceArtifactSchema = z.union([
  SearchConsoleEvidenceArtifactV1Schema,
  SearchConsoleSummaryEvidenceArtifactSchema,
  Ga4EvidenceArtifactSchema,
]);

export const EvidenceArtifactSchema = z
  .union([
    SocialEvidenceArtifactSchema,
    ContactEvidenceArtifactSchema,
    SearchConsoleEvidenceArtifactSchema,
  ])
  .superRefine((artifact, context) => {
    const syntheticProducer = artifact.producer.mode === "synthetic_fixture";
    const syntheticRedaction = artifact.redaction_status === "synthetic";
    if (syntheticProducer !== syntheticRedaction) {
      context.addIssue({
        code: "custom",
        path: syntheticProducer ? ["redaction_status"] : ["producer", "mode"],
        message:
          "Synthetic producer mode and synthetic redaction status must be declared together",
      });
    }
    if (!isAllowedEvidenceProducerMode(artifact.source, artifact.producer.mode)) {
      context.addIssue({
        code: "custom",
        path: ["producer", "mode"],
        message: `Producer mode ${artifact.producer.mode} is not allowed for source ${artifact.source}`,
      });
    }
    if (
      artifact.fresh_through !== undefined &&
      artifact.fresh_through > projectCalendarDate(artifact.captured_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["fresh_through"],
        message: "Evidence freshness cannot extend after its project capture date",
      });
    }
  });
export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>;

export const MetricSnapshotSchema = z
  .object({
    metric_id: StableIdSchema,
    lane: GrowthLaneSchema,
    metric_name: StableIdSchema,
    platform: SocialPlatformSchema.optional(),
    value: z.number().nullable(),
    unit: z.enum(["count", "rate", "score"]),
    window_start: IsoDateSchema.optional(),
    window_end: IsoDateSchema.optional(),
    complete: z.boolean(),
    evidence_refs: z.array(StableIdSchema).min(1).max(250),
  })
  .strict()
  .superRefine((metric, context) => {
    if (
      metric.window_start !== undefined &&
      metric.window_end !== undefined &&
      metric.window_start > metric.window_end
    ) {
      context.addIssue({
        code: "custom",
        path: ["window_end"],
        message: "Metric window end cannot precede its start",
      });
    }
  });
export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;

const OpportunityCandidateBaseShape = {
    candidate_id: StableIdSchema,
    summary: z.string().trim().min(1).max(4_000),
    score: z.number().min(0).max(100),
    controlled_variable: z.string().trim().min(1).max(160).optional(),
    evidence_refs: z.array(StableIdSchema).min(1).max(250),
} as const;

export const OpportunityCandidateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...OpportunityCandidateBaseShape,
      lane: z.literal("organic_social"),
      kind: z.literal("social_experiment"),
      platform: SocialPlatformSchema,
      account_id: z.string().trim().min(1).max(512),
      anchor_post_id: StableIdSchema,
    })
    .strict(),
  z
    .object({
      ...OpportunityCandidateBaseShape,
      lane: z.literal("contact_discovery"),
      kind: z.literal("contact_discovery"),
      record_id: StableIdSchema,
      selected_evidence_id: StableIdSchema.optional(),
      identity_fingerprint: Sha256Schema,
      organization_name: z.string().trim().min(1).max(1_000),
      destination: z.string().trim().min(1).max(2_048).optional(),
      source_url: z.string().url().max(4_096),
      group_rules_captured: z.boolean(),
      group_rules_url: z.string().url().max(4_096).optional(),
    })
    .strict(),
  z
    .object({
      ...OpportunityCandidateBaseShape,
      lane: z.literal("search_console"),
      kind: z.literal("seo_experiment"),
      property_id: z.string().trim().min(1).max(1_024),
      page_url: z.string().url().max(4_096),
      query_cluster: z.string().trim().min(1).max(2_048),
    })
    .strict(),
]);
export type OpportunityCandidate = z.infer<typeof OpportunityCandidateSchema>;

export const LaneAnalysisSchema = z
  .object({
    lane: GrowthLaneSchema,
    status: z.enum(["eligible", "baseline_gap", "observe_more", "quarantined"]),
    decision: z.enum(["observe_more", "repeat", "repair", "stop", "propose_scale"]),
    source_coverage: z.enum(["complete", "partial", "missing"]),
    issues: z.array(z.string().trim().min(1).max(1_000)).max(250),
    evidence_refs: z.array(StableIdSchema).max(250),
    metrics: z.array(MetricSnapshotSchema).max(250),
    opportunities: z.array(OpportunityCandidateSchema).max(1),
  })
  .strict();
export type LaneAnalysis = z.infer<typeof LaneAnalysisSchema>;

export const PortfolioAnalysisSchema = z
  .object({
    schema_version: z.literal(PORTFOLIO_ANALYSIS_SCHEMA_VERSION),
    run_at: IsoInstantSchema,
    bundle_id: StableIdSchema,
    lanes: z.tuple([LaneAnalysisSchema, LaneAnalysisSchema, LaneAnalysisSchema]),
    overall_status: z.enum(["eligible", "partial", "quarantined"]),
  })
  .strict()
  .superRefine((analysis, context) => {
    const lanes = new Set(analysis.lanes.map((lane) => lane.lane));
    for (const required of GrowthLaneSchema.options) {
      if (!lanes.has(required)) {
        context.addIssue({
          code: "custom",
          path: ["lanes"],
          message: `Missing lane analysis: ${required}`,
        });
      }
    }
  });
export type PortfolioAnalysis = z.infer<typeof PortfolioAnalysisSchema>;

const SocialApprovalAuthorizationSchema = z.discriminatedUnion("subject_basis", [
  z
    .object({
      authorization_basis: z.literal("none_needed"),
      subject_basis: z.literal("none_needed"),
    })
    .strict(),
  z
    .object({
      authorization_basis: z.literal("consent_registry"),
      subject_basis: z.literal("adult"),
      consent_id: StableIdSchema,
      allowed_channels: z
        .array(z.enum(["instagram", "facebook", "website", "paid_social"]))
        .min(1)
        .max(4),
      allowed_media: z
        .array(z.enum(["image", "video", "voice", "name", "artifact"]))
        .min(1)
        .max(5),
      consent_reference_hash: Sha256Schema,
      granted_at: IsoInstantSchema,
      expires_at: IsoInstantSchema.optional(),
      revoked_at: IsoInstantSchema.optional(),
      non_revoked_checked_at: IsoInstantSchema,
      authorization_evaluated_at: IsoInstantSchema,
    })
    .strict(),
  z
    .object({
      authorization_basis: z.literal("consent_registry"),
      subject_basis: z.literal("guardian"),
      consent_id: StableIdSchema,
      allowed_channels: z
        .array(z.enum(["instagram", "facebook", "website", "paid_social"]))
        .min(1)
        .max(4),
      allowed_media: z
        .array(z.enum(["image", "video", "voice", "name", "artifact"]))
        .min(1)
        .max(5),
      consent_reference_hash: Sha256Schema,
      granted_at: IsoInstantSchema,
      expires_at: IsoInstantSchema.optional(),
      revoked_at: IsoInstantSchema.optional(),
      non_revoked_checked_at: IsoInstantSchema,
      authorization_evaluated_at: IsoInstantSchema,
    })
    .strict(),
]);

// Frozen PR8/v1 read schema. Historical packages remain byte-preserving and
// auditable, but runtime authority is granted only to current v1.1 packages.
const LegacyApprovalAssetSchema = z
  .object({
    asset_id: StableIdSchema,
    evidence_id: StableIdSchema,
    evidence_sha256: Sha256Schema,
    content_sha256: Sha256Schema,
    byte_length: z.number().int().nonnegative(),
    subject_classification: z.enum([
      "no_person",
      "adult_only",
      "child_or_unknown",
    ]),
    media_kinds: z
      .array(z.enum(["image", "video", "voice", "name", "artifact"]))
      .min(1)
      .max(5),
    authorization: SocialApprovalAuthorizationSchema,
  })
  .strict();

const LegacyApprovalScopeSchema = z.discriminatedUnion("lane", [
  z
    .object({
      lane: z.literal("organic_social"),
      platform: SocialPlatformSchema,
      account_id: z.string().trim().min(1).max(512),
      action: z.enum(["publish", "schedule"]),
      content_hash: Sha256Schema,
      copy_hash: Sha256Schema,
      asset_ids: z.array(StableIdSchema).max(50),
      asset_artifacts: z.array(LegacyApprovalAssetSchema).max(50),
      call_to_action: z.string().trim().min(1).max(1_000),
      utm: z.string().trim().min(1).max(2_048),
      audience: z.string().trim().min(1).max(1_000),
      publishing_at: IsoInstantSchema,
      budget_usd: z.literal(0),
    })
    .strict(),
  z
    .object({
      lane: z.literal("contact_discovery"),
      action: z.enum(["email", "contact_form", "direct_message", "group_post"]),
      destination: z.string().trim().min(1).max(2_048),
      source_url: z.string().url().max(4_096),
      identity_fingerprint: Sha256Schema,
      draft_hash: Sha256Schema,
      audience: z.string().trim().min(1).max(1_000),
      send_at: IsoInstantSchema,
      group_rules_url: z.string().url().max(4_096).optional(),
      group_rules_artifact: z
        .object({
          parent_evidence_id: StableIdSchema,
          record_id: StableIdSchema,
          source_url: z.string().url().max(4_096),
          immutable_sha256: Sha256Schema,
          byte_length: z.number().int().nonnegative(),
          captured_at: IsoInstantSchema,
        })
        .strict()
        .optional(),
    })
    .strict()
    .superRefine((scope, context) => {
      if (scope.action === "group_post") {
        if (!scope.group_rules_url || !scope.group_rules_artifact) {
          context.addIssue({
            code: "custom",
            path: ["group_rules_artifact"],
            message: "Legacy group-post approval requires captured group rules",
          });
          return;
        }
        if (
          scope.group_rules_artifact.source_url !== scope.group_rules_url ||
          Date.parse(scope.group_rules_artifact.captured_at) >
            Date.parse(scope.send_at)
        ) {
          context.addIssue({
            code: "custom",
            path: ["group_rules_artifact"],
            message: "Legacy group rules must match and precede the proposed post",
          });
        }
      } else if (scope.group_rules_url || scope.group_rules_artifact) {
        context.addIssue({
          code: "custom",
          path: ["group_rules_artifact"],
          message: "Only a legacy group-post approval may carry group rules",
        });
      }
    }),
  z
    .object({
      lane: z.literal("search_console"),
      action: z.literal("merge_and_deploy"),
      property_id: z.string().trim().min(1).max(1_024),
      page_url: z.string().url().max(4_096),
      query_cluster: z.string().trim().min(1).max(2_048),
      change_hash: Sha256Schema,
      deploy_target: z.string().trim().min(1).max(2_048),
      deploy_at: IsoInstantSchema,
    })
    .strict(),
]);

const LegacyStrategyProposalSchema = z
  .object({
    proposal_id: StableIdSchema,
    lane: GrowthLaneSchema,
    hypothesis: z.string().trim().min(1).max(8_000),
    controlled_variable: z.string().trim().min(1).max(160),
    arm: z.string().trim().min(1).max(1_000),
    primary_kpi: StableIdSchema,
    measurement_window_days: z.number().int().positive().max(60),
    evidence_refs: z.array(StableIdSchema).min(1).max(250),
    readiness: z.enum(["approval_ready", "not_approval_ready"]),
    approval_scope: LegacyApprovalScopeSchema.optional(),
    external_action_status: z.literal("not_executed"),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (proposal.readiness === "approval_ready" && !proposal.approval_scope) {
      context.addIssue({
        code: "custom",
        path: ["approval_scope"],
        message: "Legacy approval-ready proposals require an exact scope",
      });
    }
    if (proposal.approval_scope && proposal.approval_scope.lane !== proposal.lane) {
      context.addIssue({
        code: "custom",
        path: ["approval_scope", "lane"],
        message: "Legacy approval scope lane must match proposal lane",
      });
    }
  });

export const ApprovalScopeSchema = z.discriminatedUnion("lane", [
  z
    .object({
      lane: z.literal("organic_social"),
      platform: SocialPlatformSchema,
      account_id: z.string().trim().min(1).max(512),
      meta_identity: MetaApprovalIdentitySchema.optional(),
      action: z.enum(["publish", "schedule"]),
      content_hash: Sha256Schema,
      copy_hash: Sha256Schema,
      asset_ids: z.array(StableIdSchema).max(50),
      asset_artifacts: z
        .array(
          z
            .object({
              asset_id: StableIdSchema,
              evidence_id: StableIdSchema,
              evidence_sha256: Sha256Schema,
              content_sha256: Sha256Schema,
              byte_length: z.number().int().nonnegative(),
              subject_classification: z.enum([
                "no_person",
                "adult_only",
                "child_or_unknown",
              ]),
              media_kinds: z
                .array(z.enum(["image", "video", "voice", "name", "artifact"]))
                .min(1)
                .max(5),
              authorization: SocialApprovalAuthorizationSchema,
            })
            .strict(),
        )
        .max(50),
      call_to_action: z.string().trim().min(1).max(1_000),
      utm: z.string().trim().min(1).max(2_048),
      audience: z.string().trim().min(1).max(1_000),
      publishing_at: IsoInstantSchema,
      budget_usd: z.literal(0),
    })
    .strict()
    .superRefine((scope, context) => {
      if (
        scope.meta_identity !== undefined &&
        (scope.platform !== "facebook" ||
          scope.account_id !== scope.meta_identity.page_id)
      ) {
        context.addIssue({
          code: "custom",
          path: ["meta_identity"],
          message:
            "A typed Meta approval identity requires Facebook and an account target equal to its Page ID",
        });
      }
      const declared = [...scope.asset_ids].sort();
      const attested = scope.asset_artifacts.map((asset) => asset.asset_id).sort();
      if (
        new Set(declared).size !== declared.length ||
        new Set(attested).size !== attested.length ||
        JSON.stringify(declared) !== JSON.stringify(attested)
      ) {
        context.addIssue({
          code: "custom",
          path: ["asset_artifacts"],
          message: "Approval scope asset IDs and byte attestations must match exactly",
        });
      }
      const publishingAtMs = Date.parse(scope.publishing_at);
      for (const [assetIndex, asset] of scope.asset_artifacts.entries()) {
        if (new Set(asset.media_kinds).size !== asset.media_kinds.length) {
          context.addIssue({
            code: "custom",
            path: ["asset_artifacts", assetIndex, "media_kinds"],
            message: "Approval scope media kinds must be unique",
          });
        }
        if (asset.subject_classification === "no_person") {
          if (asset.authorization.subject_basis !== "none_needed") {
            context.addIssue({
              code: "custom",
              path: ["asset_artifacts", assetIndex, "authorization"],
              message: "A no-person asset requires the explicit none_needed authorization basis",
            });
          }
          if (
            asset.media_kinds.some((kind) =>
              ["voice", "name", "artifact"].includes(kind),
            )
          ) {
            context.addIssue({
              code: "custom",
              path: ["asset_artifacts", assetIndex, "subject_classification"],
              message: "A no-person approval cannot contain voice, name, or artifact media",
            });
          }
          continue;
        }

        const requiredBasis =
          asset.subject_classification === "adult_only" ? "adult" : "guardian";
        const authorization = asset.authorization;
        if (authorization.subject_basis !== requiredBasis) {
          context.addIssue({
            code: "custom",
            path: ["asset_artifacts", assetIndex, "authorization", "subject_basis"],
            message: `${asset.subject_classification} requires ${requiredBasis} authorization`,
          });
          continue;
        }
        if (!authorization.allowed_channels.includes(scope.platform)) {
          context.addIssue({
            code: "custom",
            path: ["asset_artifacts", assetIndex, "authorization", "allowed_channels"],
            message: `Consent does not authorize ${scope.platform}`,
          });
        }
        if (
          asset.media_kinds.some(
            (mediaKind) => !authorization.allowed_media.includes(mediaKind),
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["asset_artifacts", assetIndex, "authorization", "allowed_media"],
            message: "Consent does not authorize every media kind in the exact asset scope",
          });
        }
        const checkedAtMs = Date.parse(authorization.non_revoked_checked_at);
        const evaluatedAtMs = Date.parse(authorization.authorization_evaluated_at);
        const grantedAtMs = Date.parse(authorization.granted_at);
        const expiresAtMs = authorization.expires_at
          ? Date.parse(authorization.expires_at)
          : undefined;
        const revokedAtMs = authorization.revoked_at
          ? Date.parse(authorization.revoked_at)
          : undefined;
        if (
          grantedAtMs > checkedAtMs ||
          checkedAtMs > evaluatedAtMs ||
          evaluatedAtMs > publishingAtMs ||
          evaluatedAtMs - checkedAtMs > CONSENT_REVOCATION_CHECK_MAX_AGE_MS ||
          publishingAtMs - checkedAtMs > CONSENT_REVOCATION_CHECK_MAX_AGE_MS
        ) {
          context.addIssue({
            code: "custom",
            path: ["asset_artifacts", assetIndex, "authorization", "non_revoked_checked_at"],
            message:
              "Captured consent revocation status must be no more than 24 hours old at evaluation and publishing time",
          });
        }
        if (expiresAtMs !== undefined && expiresAtMs <= publishingAtMs) {
          context.addIssue({
            code: "custom",
            path: ["asset_artifacts", assetIndex, "authorization", "expires_at"],
            message: "Consent must remain unexpired through the exact publishing time",
          });
        }
        if (revokedAtMs !== undefined && revokedAtMs <= publishingAtMs) {
          context.addIssue({
            code: "custom",
            path: ["asset_artifacts", assetIndex, "authorization", "revoked_at"],
            message: "Consent must remain non-revoked through the exact publishing time",
          });
        }
      }
    }),
  z
    .object({
      lane: z.literal("contact_discovery"),
      action: z.enum(["email", "contact_form", "direct_message", "group_post"]),
      destination: z.string().trim().min(1).max(2_048),
      source_url: z.string().url().max(4_096),
      identity_fingerprint: Sha256Schema,
      record_verified_at: IsoInstantSchema.optional(),
      draft_hash: Sha256Schema,
      audience: z.string().trim().min(1).max(1_000),
      send_at: IsoInstantSchema,
      group_rules_url: z.string().url().max(4_096).optional(),
      group_rules_artifact: z
        .object({
          parent_evidence_id: StableIdSchema,
          record_id: StableIdSchema,
          source_url: z.string().url().max(4_096),
          immutable_sha256: Sha256Schema,
          byte_length: z.number().int().nonnegative(),
          captured_at: IsoInstantSchema,
        })
        .strict()
        .optional(),
    })
    .strict()
    .superRefine((scope, context) => {
      const sendAtMs = Date.parse(scope.send_at);
      const recordVerifiedAtMs = Date.parse(scope.record_verified_at ?? "");
      if (
        scope.record_verified_at !== undefined &&
        (recordVerifiedAtMs > sendAtMs ||
          sendAtMs - recordVerifiedAtMs > CONTACT_APPROVAL_EVIDENCE_MAX_AGE_MS)
      ) {
        context.addIssue({
          code: "custom",
          path: ["record_verified_at"],
          message:
            "The selected contact record must be verified no more than seven days before the exact send time",
        });
      }
      if (scope.action === "group_post") {
        if (!scope.group_rules_url || !scope.group_rules_artifact) {
          context.addIssue({
            code: "custom",
            path: ["group_rules_artifact"],
            message:
              "A group-post approval requires immutable captured group-rules bytes and timestamp",
          });
          return;
        }
        if (scope.group_rules_artifact.source_url !== scope.group_rules_url) {
          context.addIssue({
            code: "custom",
            path: ["group_rules_artifact", "source_url"],
            message: "Group-rules artifact URL must match the exact approved rules URL",
          });
        }
        const rulesCapturedAtMs = Date.parse(
          scope.group_rules_artifact.captured_at,
        );
        if (
          rulesCapturedAtMs > sendAtMs ||
          sendAtMs - rulesCapturedAtMs > CONTACT_APPROVAL_EVIDENCE_MAX_AGE_MS
        ) {
          context.addIssue({
            code: "custom",
            path: ["group_rules_artifact", "captured_at"],
            message:
              "Group rules must be captured no more than seven days before the exact group-post send time",
          });
        }
      } else if (scope.group_rules_url || scope.group_rules_artifact) {
        context.addIssue({
          code: "custom",
          path: ["group_rules_artifact"],
          message: "Only a group-post approval may carry group-rules evidence",
        });
      }
    }),
  z
    .object({
      lane: z.literal("search_console"),
      action: z.literal("merge_and_deploy"),
      property_id: z.string().trim().min(1).max(1_024),
      page_url: z.string().url().max(4_096),
      query_cluster: z.string().trim().min(1).max(2_048),
      change_hash: Sha256Schema,
      deploy_target: z.string().trim().min(1).max(2_048),
      deploy_at: IsoInstantSchema,
    })
    .strict(),
]);
export type ApprovalScope = z.infer<typeof ApprovalScopeSchema>;

export const StrategyProposalSchema = z
  .object({
    proposal_id: StableIdSchema,
    lane: GrowthLaneSchema,
    hypothesis: z.string().trim().min(1).max(8_000),
    controlled_variable: z.string().trim().min(1).max(160),
    arm: z.string().trim().min(1).max(1_000),
    primary_kpi: StableIdSchema,
    measurement_window_days: z.number().int().positive().max(60),
    evidence_refs: z.array(StableIdSchema).min(1).max(250),
    readiness: z.enum(["approval_ready", "not_approval_ready"]),
    approval_scope: ApprovalScopeSchema.optional(),
    external_action_status: z.literal("not_executed"),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (proposal.readiness === "approval_ready" && !proposal.approval_scope) {
      context.addIssue({
        code: "custom",
        path: ["approval_scope"],
        message: "Approval-ready proposals require an exact approval scope",
      });
    }
    if (proposal.approval_scope && proposal.approval_scope.lane !== proposal.lane) {
      context.addIssue({
        code: "custom",
        path: ["approval_scope", "lane"],
        message: "Approval scope lane must match proposal lane",
      });
    }
  });
export type StrategyProposal = z.infer<typeof StrategyProposalSchema>;

const LegacyApprovalPackageSchema = z
  .object({
    schema_version: z.literal(LEGACY_APPROVAL_PACKAGE_SCHEMA_VERSION),
    evidence_mode: z.enum(["real", "synthetic"]).optional(),
    review_kind: z.enum(["proposal_review", "external_action_approval"]),
    proposal: LegacyStrategyProposalSchema,
    draft_content: z
      .object({
        kind: z.enum(["social_copy", "contact_outreach", "seo_change_spec"]),
        content: z.string().min(1).max(100_000),
        content_sha256: Sha256Schema,
        redaction_status: RedactionStatusSchema,
      })
      .strict(),
    maturity_rule: z
      .object({
        minimum_age_hours: z.number().int().nonnegative().max(2_160),
        minimum_comparable_executions_per_arm: z.number().int().nonnegative().max(100),
        measurement_window_days: z.number().int().positive().max(60),
      })
      .strict(),
    comparison_rule: z
      .object({
        primary_kpi: StableIdSchema,
        baseline_reference: z.string().trim().min(1).max(2_048),
        evidence_refs: z.array(StableIdSchema).min(1).max(250),
      })
      .strict(),
    stop_rules: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50),
    scale_rules: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50),
    required_approvals: z
      .array(z.enum(["proposal_review", "publish", "send", "merge_deploy"]))
      .min(1)
      .max(3),
    external_action_status: z.literal("not_executed"),
  })
  .strict()
  .superRefine((approvalPackage, context) => {
    const draftHash = createHash("sha256")
      .update(approvalPackage.draft_content.content)
      .digest("hex");
    if (draftHash !== approvalPackage.draft_content.content_sha256) {
      context.addIssue({
        code: "custom",
        path: ["draft_content", "content_sha256"],
        message: "Legacy draft content hash must match its exact bytes",
      });
    }
    const expectedDraftKind =
      approvalPackage.proposal.lane === "organic_social"
        ? "social_copy"
        : approvalPackage.proposal.lane === "contact_discovery"
          ? "contact_outreach"
          : "seo_change_spec";
    if (approvalPackage.draft_content.kind !== expectedDraftKind) {
      context.addIssue({
        code: "custom",
        path: ["draft_content", "kind"],
        message: "Legacy draft kind must match its proposal lane",
      });
    }
  });

const CurrentApprovalPackageSchema = z
  .object({
    schema_version: z.literal(APPROVAL_PACKAGE_SCHEMA_VERSION),
    evidence_mode: z.enum(["real", "synthetic"]),
    review_kind: z.enum(["proposal_review", "external_action_approval"]),
    proposal: StrategyProposalSchema,
    draft_content: z
      .object({
        kind: z.enum(["social_copy", "contact_outreach", "seo_change_spec"]),
        content: z.string().min(1).max(100_000),
        content_sha256: Sha256Schema,
        redaction_status: RedactionStatusSchema,
      })
      .strict(),
    maturity_rule: z
      .object({
        minimum_age_hours: z.number().int().nonnegative().max(2_160),
        minimum_comparable_executions_per_arm: z.number().int().nonnegative().max(100),
        measurement_window_days: z.number().int().positive().max(60),
      })
      .strict(),
    comparison_rule: z
      .object({
        primary_kpi: StableIdSchema,
        baseline_reference: z.string().trim().min(1).max(2_048),
        evidence_refs: z.array(StableIdSchema).min(1).max(250),
      })
      .strict(),
    stop_rules: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50),
    scale_rules: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50),
    required_approvals: z
      .array(z.enum(["proposal_review", "publish", "send", "merge_deploy"]))
      .min(1)
      .max(3),
    approval_expires_at: IsoInstantSchema.optional(),
    external_action_status: z.literal("not_executed"),
  })
  .strict()
  .superRefine((approvalPackage, context) => {
    const draftHash = createHash("sha256")
      .update(approvalPackage.draft_content.content)
      .digest("hex");
    if (draftHash !== approvalPackage.draft_content.content_sha256) {
      context.addIssue({
        code: "custom",
        path: ["draft_content", "content_sha256"],
        message: "Draft content hash must match the exact local draft bytes",
      });
    }
    const expectedDraftKind =
      approvalPackage.proposal.lane === "organic_social"
        ? "social_copy"
        : approvalPackage.proposal.lane === "contact_discovery"
          ? "contact_outreach"
          : "seo_change_spec";
    if (approvalPackage.draft_content.kind !== expectedDraftKind) {
      context.addIssue({
        code: "custom",
        path: ["draft_content", "kind"],
        message: "Draft content kind must match the proposal lane",
      });
    }
    if (approvalPackage.review_kind === "proposal_review") {
      if (
        approvalPackage.required_approvals.length !== 1 ||
        approvalPackage.required_approvals[0] !== "proposal_review"
      ) {
        context.addIssue({
          code: "custom",
          path: ["required_approvals"],
          message: "Proposal-review package requires proposal_review",
        });
      }
      if (approvalPackage.approval_expires_at !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["approval_expires_at"],
          message: "Proposal-review packages cannot carry an action approval expiry",
        });
      }
      return;
    }
    if (approvalPackage.required_approvals.includes("proposal_review")) {
      context.addIssue({
        code: "custom",
        path: ["required_approvals"],
        message: "External-action package cannot substitute proposal review for action approval",
      });
    }
    if (
      approvalPackage.proposal.readiness !== "approval_ready" ||
      !approvalPackage.proposal.approval_scope
    ) {
      context.addIssue({
        code: "custom",
        path: ["proposal", "readiness"],
        message: "External-action approval requires an approval-ready exact scope",
      });
      return;
    }
    const required =
      approvalPackage.proposal.lane === "organic_social"
        ? "publish"
        : approvalPackage.proposal.lane === "contact_discovery"
          ? "send"
          : "merge_deploy";
    if (!approvalPackage.required_approvals.includes(required)) {
      context.addIssue({
        code: "custom",
        path: ["required_approvals"],
        message: `Approval package is missing required ${required} approval`,
      });
    }
    const scope = approvalPackage.proposal.approval_scope;
    const expectedApprovalExpiry =
      scope.lane === "organic_social"
        ? scope.publishing_at
        : scope.lane === "contact_discovery"
          ? scope.send_at
          : scope.deploy_at;
    if (
      approvalPackage.schema_version === APPROVAL_PACKAGE_SCHEMA_VERSION &&
      expectedApprovalExpiry !== undefined &&
      approvalPackage.approval_expires_at !== expectedApprovalExpiry
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval_expires_at"],
        message:
          "Current external-action packages must expire at the exact scheduled action time",
      });
    } else if (
      approvalPackage.approval_expires_at !== undefined &&
      expectedApprovalExpiry !== undefined &&
      approvalPackage.approval_expires_at !== expectedApprovalExpiry
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval_expires_at"],
        message: "Approval expiry must match the exact scheduled action time",
      });
    }
    if (
      approvalPackage.schema_version === APPROVAL_PACKAGE_SCHEMA_VERSION &&
      scope.lane === "contact_discovery" &&
      scope.record_verified_at === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["proposal", "approval_scope", "record_verified_at"],
        message:
          "Current contact approval packages require the selected record verification time",
      });
    }
    const expectedDraftHash =
      scope.lane === "organic_social"
        ? scope.copy_hash
        : scope.lane === "contact_discovery"
          ? scope.draft_hash
          : scope.change_hash;
    if (expectedDraftHash !== approvalPackage.draft_content.content_sha256) {
      context.addIssue({
        code: "custom",
        path: ["draft_content", "content_sha256"],
        message: "Exact approval scope must bind the included draft content hash",
      });
    }
  });

export const ApprovalPackageSchema = z.union([
  CurrentApprovalPackageSchema,
  LegacyApprovalPackageSchema,
]);
export type ApprovalPackage = z.infer<typeof ApprovalPackageSchema>;

function sortCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortCanonicalJson(nested)]),
    );
  }
  return value;
}

export function approvalPackageHash(value: ApprovalPackage): string {
  return createHash("sha256")
    .update(JSON.stringify(sortCanonicalJson(value)))
    .digest("hex");
}

export const EvalFindingSchema = z
  .object({
    eval_id: StableIdSchema,
    proposal_id: StableIdSchema,
    lane: GrowthLaneSchema,
    verdict: z.enum(["pass", "repair", "quarantine"]),
    defects: z.array(z.string().trim().min(1).max(1_000)).max(100),
    repair_count: z.number().int().min(0).max(2),
    evidence_refs: z.array(StableIdSchema).max(250),
  })
  .strict();
export type EvalFinding = z.infer<typeof EvalFindingSchema>;

export const HumanReviewSchema = z
  .object({
    review_id: StableIdSchema,
    proposal_id: StableIdSchema,
    lane: GrowthLaneSchema,
    review_kind: z.enum(["proposal_review", "external_action_approval"]),
    status: z.literal("awaiting_review"),
    approval_hash: Sha256Schema,
    approval_package: ApprovalPackageSchema,
    requested_at: IsoInstantSchema,
  })
  .strict()
  .superRefine((review, context) => {
    if (review.approval_package.proposal.proposal_id !== review.proposal_id) {
      context.addIssue({
        code: "custom",
        path: ["approval_package", "proposal", "proposal_id"],
        message: "Approval package proposal_id must match the review",
      });
    }
    if (review.approval_package.proposal.lane !== review.lane) {
      context.addIssue({
        code: "custom",
        path: ["approval_package", "proposal", "lane"],
        message: "Approval package lane must match the review",
      });
    }
    if (review.approval_package.review_kind !== review.review_kind) {
      context.addIssue({
        code: "custom",
        path: ["review_kind"],
        message: "Review kind must match the canonical approval package",
      });
    }
    if (approvalPackageHash(review.approval_package) !== review.approval_hash) {
      context.addIssue({
        code: "custom",
        path: ["approval_hash"],
        message: "approval_hash must equal the canonical approval package SHA-256",
      });
    }
  });
export type HumanReview = z.infer<typeof HumanReviewSchema>;

export const GraphErrorSchema = z
  .object({
    error_id: StableIdSchema,
    fingerprint: Sha256Schema,
    node: StableIdSchema,
    category: z.string().trim().min(1).max(160),
    attempt: z.number().int().positive(),
    retryable: z.boolean(),
    message: z.string().trim().min(1).max(2_000),
    evidence_refs: z.array(StableIdSchema).max(250),
    resolution: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
export type GraphError = z.infer<typeof GraphErrorSchema>;

export const GrowthGraphStateSchema = z
  .object({
    schema_version: z.literal(GRAPH_STATE_SCHEMA_VERSION),
    graph_version: StableIdSchema,
    policy_version: StableIdSchema,
    prompt_version: StableIdSchema,
    model_id: z.string().trim().min(1).max(256),
    tool_version: StableIdSchema,
    node_version: z.string().trim().min(1).max(64),
    run_id: StableIdSchema,
    thread_id: StableIdSchema,
    idempotency_key: z.string().trim().min(1).max(512),
    trigger_kind: z.enum(["manual", "scheduled", "resume", "test"]),
    objective_window: z.object({ start: IsoDateSchema, end: IsoDateSchema }).strict(),
    metric_definition_version: MetricDefinitionVersionSchema,
    runtime_manifest_hash: Sha256Schema,
    capture_bundle_hash: Sha256Schema.optional(),
    immutable_evidence: z.array(ImmutableArtifactReferenceSchema).max(250),
    lane_analyses: z.array(LaneAnalysisSchema).max(3),
    proposals: z.array(StrategyProposalSchema).max(3),
    evals: z.array(EvalFindingSchema).max(30),
    reviews: z.array(HumanReviewSchema).max(3),
    errors: z.array(GraphErrorSchema).max(250),
    repair_count: z.number().int().min(0).max(6),
    model_calls: z.number().int().nonnegative(),
    tool_calls: z.number().int().nonnegative(),
    transaction_id: StableIdSchema.optional(),
    readback_verified: z.boolean(),
    terminal_status: z.enum([
      "running",
      "awaiting_review",
      "complete",
      "partial",
      "blocked",
      "failed",
    ]),
    next_safe_action: z.string().trim().min(1).max(2_000),
  })
  .strict();
export type GrowthGraphState = z.infer<typeof GrowthGraphStateSchema>;
