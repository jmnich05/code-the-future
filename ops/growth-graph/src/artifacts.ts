import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  CaptureBundleSchema,
  CONSENT_REVOCATION_CHECK_MAX_AGE_MS,
  type EvidenceArtifact,
  EvidenceArtifactSchema,
  type EvidenceReference,
  type GrowthCaptureBundle,
  type ImmutableArtifactReference,
} from "./schema.js";

const DEFAULT_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

export interface ArtifactWriteResult extends ImmutableArtifactReference {}

export interface CaptureIntakeOptions {
  captureBundlePath: string;
  allowedEvidenceRoot: string;
  runArtifactRoot: string;
  runAt: string;
  allowSyntheticEvidence?: boolean;
  maxArtifactBytes?: number;
}

export interface IntakenEvidence {
  declaration: EvidenceReference;
  artifact: EvidenceArtifact;
  immutableArtifact: ImmutableArtifactReference;
}

export interface CaptureIntakeResult {
  bundle: GrowthCaptureBundle;
  bundleArtifact: ImmutableArtifactReference;
  evidence: IntakenEvidence[];
  assetArtifacts: IntakenAssetArtifact[];
  groupRulesArtifacts: IntakenGroupRulesArtifact[];
  intakeHash: string;
}

export interface IntakenAssetArtifact {
  evidenceId: string;
  assetId: string;
  contentSha256: string;
  byteLength: number;
  immutableArtifact: ImmutableArtifactReference;
}

export interface IntakenGroupRulesArtifact {
  evidenceId: string;
  recordId: string;
  sourceUrl: string;
  capturedAt: string;
  contentSha256: string;
  byteLength: number;
  immutableArtifact: ImmutableArtifactReference;
}

export class ArtifactConflictError extends Error {
  override name = "ArtifactConflictError";
}

export class ArtifactPolicyError extends Error {
  override name = "ArtifactPolicyError";
}

export class SecretMaterialError extends ArtifactPolicyError {
  override name = "SecretMaterialError";
}

const SECRET_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { label: "OpenAI key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { label: "GitHub token", pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  {
    label: "Slack webhook",
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/i,
  },
  {
    label: "named secret",
    pattern:
      /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY|AWS_SECRET_ACCESS_KEY|SLACK_WEBHOOK_URL)\s*[=:]\s*["']?[A-Za-z0-9/+_.:-]{12,}/i,
  },
  {
    label: "named secret or password",
    pattern:
      /["']?[A-Za-z][A-Za-z0-9_]*(?:_SECRET(?:_KEY)?|_PASSWORD)["']?\s*[=:]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s"',;}]{8,})/i,
  },
];

function contentBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? Buffer.from(content, "utf8") : content;
}

export function sha256Bytes(content: string | Uint8Array): string {
  return createHash("sha256").update(contentBytes(content)).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

export function serializeArtifactJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export function assertNoSecrets(value: unknown): void {
  const text =
    typeof value === "string"
      ? value
      : value instanceof Uint8Array
        ? Buffer.from(value).toString("utf8")
        : serializeArtifactJson(value);
  const match = SECRET_PATTERNS.find(({ pattern }) => pattern.test(text));
  if (match) {
    throw new SecretMaterialError(
      `Secret-like material rejected by policy (${match.label}); content was not retained`,
    );
  }
}

/**
 * Writes an artifact once. Replays may observe byte-identical content but may
 * never replace the same path with different bytes.
 */
export async function writeImmutableArtifact(
  path: string,
  content: string | Uint8Array,
): Promise<ArtifactWriteResult> {
  assertNoSecrets(content);
  const absolutePath = resolve(path);
  const bytes = contentBytes(content);
  const expectedHash = sha256Bytes(bytes);
  await mkdir(dirname(absolutePath), { recursive: true, mode: 0o700 });

  try {
    await writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
    return {
      path: absolutePath,
      sha256: expectedHash,
      byte_length: bytes.byteLength,
      outcome: "created",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new ArtifactPolicyError("Immutable artifact target is not a regular file");
    }
    const current = await readFile(absolutePath);
    const currentHash = sha256Bytes(current);
    if (currentHash !== expectedHash) {
      throw new ArtifactConflictError(
        `Immutable artifact conflict at ${absolutePath}; existing bytes differ`,
      );
    }
    await chmod(absolutePath, 0o600);
    return {
      path: absolutePath,
      sha256: currentHash,
      byte_length: current.byteLength,
      outcome: "replayed",
    };
  }
}

export async function writeImmutableJsonArtifact(
  path: string,
  value: unknown,
): Promise<ArtifactWriteResult> {
  return writeImmutableArtifact(path, serializeArtifactJson(value));
}

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

async function resolveConfinedRegularFile(root: string, candidate: string): Promise<string> {
  const resolved = await realpath(candidate);
  if (!isInside(root, resolved)) {
    throw new ArtifactPolicyError("Evidence path escapes the allowed evidence root");
  }
  const stats = await lstat(resolved);
  if (!stats.isFile()) {
    throw new ArtifactPolicyError("Evidence path must resolve to a regular file");
  }
  return resolved;
}

async function readBoundedFile(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new ArtifactPolicyError("Evidence is not a regular file");
    if (stats.size > maxBytes) {
      throw new ArtifactPolicyError(`Evidence exceeds the ${maxBytes}-byte intake limit`);
    }
    const bytes = await handle.readFile();
    if (bytes.byteLength > maxBytes) {
      throw new ArtifactPolicyError(`Evidence exceeds the ${maxBytes}-byte intake limit`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new ArtifactPolicyError(`${label} must be valid JSON`);
  }
}

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

function assertAttestationMatches(
  declaration: EvidenceReference,
  artifact: EvidenceArtifact,
): void {
  const matches =
    declaration.evidence_id === artifact.evidence_id &&
    declaration.lane === artifact.lane &&
    declaration.source === artifact.source &&
    declaration.captured_at === artifact.captured_at &&
    sameOptional(declaration.fresh_through, artifact.fresh_through) &&
    declaration.data_state === artifact.data_state &&
    declaration.redaction_status === artifact.redaction_status &&
    declaration.producer_mode === artifact.producer.mode;
  if (!matches) {
    throw new ArtifactPolicyError(
      `Evidence attestation does not match declaration for ${declaration.evidence_id}`,
    );
  }
}

function parseRunAt(runAt: string): number {
  const runAtMs = Date.parse(runAt);
  if (!Number.isFinite(runAtMs)) {
    throw new ArtifactPolicyError("runAt must be a valid ISO-8601 instant");
  }
  return runAtMs;
}

function assertSocialEvidencePrivacySafe(
  artifact: Extract<EvidenceArtifact, { lane: "organic_social" }>,
  runAtMs: number,
): void {
  const consents = new Map(
    artifact.payload.consents.map((consent) => [consent.consent_id, consent]),
  );

  for (const asset of artifact.payload.assets) {
    const hasEffectiveRevocation = asset.consent_refs.some((consentId) => {
      const consent = consents.get(consentId);
      return (
        consent?.asset_id === asset.asset_id &&
        consent.revoked_at !== undefined &&
        Date.parse(consent.revoked_at) <= runAtMs
      );
    });
    if (hasEffectiveRevocation) {
      throw new ArtifactPolicyError(
        "Revoked social consent rejected before persistence; human review is required for any already-published use; content was not retained",
      );
    }
    if (asset.subject_classification === "no_person") continue;
    const requiredBasis = asset.subject_classification === "adult_only" ? "adult" : "guardian";
    const hasActiveScopedConsent = asset.consent_refs.some((consentId) => {
      const consent = consents.get(consentId);
      return (
        consent !== undefined &&
        consent.asset_id === asset.asset_id &&
        consent.subject_basis === requiredBasis &&
        consent.allowed_channels.includes(artifact.platform) &&
        asset.media_kinds.every((kind) => consent.allowed_media.includes(kind)) &&
        Date.parse(consent.granted_at) <= runAtMs &&
        Date.parse(consent.revocation_checked_at) <= runAtMs &&
        runAtMs - Date.parse(consent.revocation_checked_at) <=
          CONSENT_REVOCATION_CHECK_MAX_AGE_MS &&
        (!consent.expires_at || Date.parse(consent.expires_at) > runAtMs) &&
        (!consent.revoked_at || Date.parse(consent.revoked_at) > runAtMs)
      );
    });
    if (!hasActiveScopedConsent) {
      throw new ArtifactPolicyError(
        `A social asset lacks active ${artifact.platform}-scoped ${requiredBasis} consent; content was not retained`,
      );
    }
  }
}

function assertContactEvidencePrivacySafe(
  artifact: Extract<EvidenceArtifact, { lane: "contact_discovery" }>,
): void {
  for (const record of artifact.payload.records) {
    const unsafeSubject = [
      "minor",
      "private_group_member",
      "personal_parent_profile",
    ].includes(record.subject_type);
    const parentPermissionMismatch =
      (record.subject_type === "parent_opt_in" &&
        record.permission_basis !== "direct_parent_opt_in") ||
      (record.subject_type === "parent_referral" &&
        record.permission_basis !== "introduced_referral_with_permission");
    if (
      record.contains_minor_data ||
      unsafeSubject ||
      record.source_visibility !== "public" ||
      parentPermissionMismatch ||
      record.do_not_contact
    ) {
      throw new ArtifactPolicyError(
        "Privacy-unsafe contact evidence rejected before persistence; content was not retained",
      );
    }
  }
}

interface PendingEvidence {
  declaration: EvidenceReference;
  artifact: EvidenceArtifact;
  artifactBytes: Buffer;
  artifactHash: string;
}

interface PendingAsset {
  evidenceId: string;
  assetId: string;
  contentSha256: string;
  assetBytes: Buffer;
}

interface PendingGroupRulesArtifact {
  evidenceId: string;
  recordId: string;
  sourceUrl: string;
  capturedAt: string;
  contentSha256: string;
  rulesBytes: Buffer;
}

export async function intakeCaptureBundle(
  options: CaptureIntakeOptions,
): Promise<CaptureIntakeResult> {
  const maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes <= 0) {
    throw new ArtifactPolicyError("maxArtifactBytes must be a positive safe integer");
  }

  const allowedRoot = await realpath(resolve(options.allowedEvidenceRoot));
  const bundlePath = await resolveConfinedRegularFile(
    allowedRoot,
    resolve(options.captureBundlePath),
  );
  const bundleBytes = await readBoundedFile(bundlePath, maxArtifactBytes);
  assertNoSecrets(bundleBytes);
  const bundle = CaptureBundleSchema.parse(parseJson(bundleBytes, "Capture bundle"));
  const bundleHash = sha256Bytes(bundleBytes);
  const runAtMs = parseRunAt(options.runAt);

  if (
    !options.allowSyntheticEvidence &&
    bundle.evidence.some(
      (item) =>
        item.producer_mode === "synthetic_fixture" || item.redaction_status === "synthetic",
    )
  ) {
    throw new ArtifactPolicyError(
      "Synthetic evidence is disabled; pass allowSyntheticEvidence only in tests",
    );
  }

  // Validate every artifact and all referenced asset bytes before creating the
  // run directory. A privacy or consent failure must leave no durable copy of
  // evidence or media, including artifacts that appeared earlier in the bundle.
  const pendingEvidence: PendingEvidence[] = [];
  const pendingAssets = new Map<string, PendingAsset>();
  const pendingGroupRules = new Map<string, PendingGroupRulesArtifact>();
  for (const declaration of bundle.evidence) {
    if (isAbsolute(declaration.artifact_path)) {
      throw new ArtifactPolicyError("Evidence artifact_path must be relative to the allowed root");
    }
    const artifactPath = await resolveConfinedRegularFile(
      allowedRoot,
      resolve(allowedRoot, declaration.artifact_path),
    );
    const artifactBytes = await readBoundedFile(artifactPath, maxArtifactBytes);
    assertNoSecrets(artifactBytes);
    const artifactHash = sha256Bytes(artifactBytes);
    if (artifactHash !== declaration.artifact_sha256) {
      throw new ArtifactConflictError(
        `Evidence SHA-256 mismatch for ${declaration.evidence_id}`,
      );
    }
    const artifact = EvidenceArtifactSchema.parse(
      parseJson(artifactBytes, `Evidence ${declaration.evidence_id}`),
    );
    assertAttestationMatches(declaration, artifact);
    if (
      !options.allowSyntheticEvidence &&
      (artifact.producer.mode === "synthetic_fixture" ||
        artifact.redaction_status === "synthetic")
    ) {
      throw new ArtifactPolicyError(
        "Synthetic evidence is disabled; pass allowSyntheticEvidence only in tests",
      );
    }

    if (artifact.lane === "contact_discovery") {
      assertContactEvidencePrivacySafe(artifact);
    }
    if (artifact.lane === "organic_social") {
      assertSocialEvidencePrivacySafe(artifact, runAtMs);
    }
    pendingEvidence.push({ declaration, artifact, artifactBytes, artifactHash });

    if (artifact.lane === "organic_social") {
      for (const asset of artifact.payload.assets) {
        if (isAbsolute(asset.artifact_path)) {
          throw new ArtifactPolicyError("Social asset artifact_path must be relative");
        }
        const assetPath = await resolveConfinedRegularFile(
          allowedRoot,
          resolve(allowedRoot, asset.artifact_path),
        );
        const assetBytes = await readBoundedFile(assetPath, maxArtifactBytes);
        assertNoSecrets(assetBytes);
        const contentSha256 = sha256Bytes(assetBytes);
        if (contentSha256 !== asset.content_sha256 || assetBytes.byteLength !== asset.byte_length) {
          throw new ArtifactConflictError(
            `Social asset bytes do not match attestation for ${asset.asset_id}`,
          );
        }
        const previousAsset = pendingAssets.get(asset.asset_id);
        if (previousAsset && previousAsset.contentSha256 !== contentSha256) {
          throw new ArtifactConflictError(
            `Social asset ID ${asset.asset_id} resolves to conflicting bytes`,
          );
        }
        if (!previousAsset) {
          pendingAssets.set(asset.asset_id, {
            evidenceId: artifact.evidence_id,
            assetId: asset.asset_id,
            contentSha256,
            assetBytes,
          });
        }
      }
    }
    if (artifact.lane === "contact_discovery") {
      for (const record of artifact.payload.records) {
        if (!record.group_rules_captured) continue;
        const artifactPath = record.group_rules_artifact_path;
        const expectedSha256 = record.group_rules_content_sha256;
        const expectedByteLength = record.group_rules_byte_length;
        const capturedAt = record.group_rules_captured_at;
        const sourceUrl = record.group_rules_url;
        if (
          !artifactPath ||
          !expectedSha256 ||
          expectedByteLength === undefined ||
          !capturedAt ||
          !sourceUrl
        ) {
          throw new ArtifactPolicyError(
            "Captured group rules are missing immutable artifact metadata",
          );
        }
        if (isAbsolute(artifactPath)) {
          throw new ArtifactPolicyError("Group-rules artifact path must be relative");
        }
        const rulesPath = await resolveConfinedRegularFile(
          allowedRoot,
          resolve(allowedRoot, artifactPath),
        );
        const rulesBytes = await readBoundedFile(rulesPath, maxArtifactBytes);
        assertNoSecrets(rulesBytes);
        const contentSha256 = sha256Bytes(rulesBytes);
        if (
          contentSha256 !== expectedSha256 ||
          rulesBytes.byteLength !== expectedByteLength
        ) {
          throw new ArtifactConflictError(
            "Captured group-rules bytes do not match their attestation",
          );
        }
        const groupRulesKey = `${artifact.evidence_id}:${record.record_id}`;
        const previous = pendingGroupRules.get(groupRulesKey);
        if (previous && previous.contentSha256 !== contentSha256) {
          throw new ArtifactConflictError(
            "A group-rules record resolves to conflicting immutable bytes",
          );
        }
        if (!previous) {
          pendingGroupRules.set(groupRulesKey, {
            evidenceId: artifact.evidence_id,
            recordId: record.record_id,
            sourceUrl,
            capturedAt,
            contentSha256,
            rulesBytes,
          });
        }
      }
    }
  }

  const runArtifactRoot = resolve(options.runArtifactRoot);
  await mkdir(runArtifactRoot, { recursive: true, mode: 0o700 });
  const realRunArtifactRoot = await realpath(runArtifactRoot);
  await chmod(realRunArtifactRoot, 0o700);
  const captureOutputDirectory = resolve(realRunArtifactRoot, "capture");
  const evidenceOutputDirectory = resolve(realRunArtifactRoot, "evidence");
  const assetOutputDirectory = resolve(realRunArtifactRoot, "assets");
  const groupRulesOutputDirectory = resolve(realRunArtifactRoot, "group-rules");
  for (const directory of [
    captureOutputDirectory,
    evidenceOutputDirectory,
    assetOutputDirectory,
    groupRulesOutputDirectory,
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const confinedDirectory = await realpath(directory);
    if (!isInside(realRunArtifactRoot, confinedDirectory)) {
      throw new ArtifactPolicyError("Run artifact directory escapes the configured run root");
    }
    await chmod(confinedDirectory, 0o700);
  }

  const bundleArtifact = await writeImmutableArtifact(
    resolve(captureOutputDirectory, `${bundleHash}.json`),
    bundleBytes,
  );
  const evidence: IntakenEvidence[] = [];
  for (const item of pendingEvidence) {
    const immutableArtifact = await writeImmutableArtifact(
      resolve(evidenceOutputDirectory, `${item.artifactHash}.json`),
      item.artifactBytes,
    );
    evidence.push({
      declaration: item.declaration,
      artifact: item.artifact,
      immutableArtifact,
    });
  }
  const assetArtifacts: IntakenAssetArtifact[] = [];
  for (const asset of pendingAssets.values()) {
    const copiedAsset = await writeImmutableArtifact(
      resolve(assetOutputDirectory, asset.contentSha256),
      asset.assetBytes,
    );
    assetArtifacts.push({
      evidenceId: asset.evidenceId,
      assetId: asset.assetId,
      contentSha256: asset.contentSha256,
      byteLength: asset.assetBytes.byteLength,
      immutableArtifact: copiedAsset,
    });
  }
  const groupRulesArtifacts: IntakenGroupRulesArtifact[] = [];
  for (const rules of pendingGroupRules.values()) {
    const immutableArtifact = await writeImmutableArtifact(
      resolve(groupRulesOutputDirectory, rules.contentSha256),
      rules.rulesBytes,
    );
    groupRulesArtifacts.push({
      evidenceId: rules.evidenceId,
      recordId: rules.recordId,
      sourceUrl: rules.sourceUrl,
      capturedAt: rules.capturedAt,
      contentSha256: rules.contentSha256,
      byteLength: rules.rulesBytes.byteLength,
      immutableArtifact,
    });
  }

  const intakeHash = sha256Bytes(
    serializeArtifactJson({
      bundle_sha256: bundleArtifact.sha256,
      evidence_sha256: evidence
        .map((item) => item.immutableArtifact.sha256)
        .sort((left, right) => left.localeCompare(right)),
      asset_sha256: assetArtifacts
        .map((item) => item.contentSha256)
        .sort((left, right) => left.localeCompare(right)),
      group_rules_sha256: groupRulesArtifacts
        .map((item) => item.contentSha256)
        .sort((left, right) => left.localeCompare(right)),
    }),
  );

  return {
    bundle,
    bundleArtifact,
    evidence,
    assetArtifacts,
    groupRulesArtifacts,
    intakeHash,
  };
}
