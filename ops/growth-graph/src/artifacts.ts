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
  evaluateCodeTheFutureProjectIdentity,
  isProtectedIndexPath,
  isSanitizedProtectedPathCategory,
  projectCalendarDate,
  projectDateIsWithinWindow,
} from "./project-policy.js";
import {
  CaptureBundleSchema,
  CONSENT_REVOCATION_CHECK_MAX_AGE_MS,
  CURRENT_METRIC_DEFINITION_VERSION,
  type EvidenceArtifact,
  EvidenceArtifactSchema,
  type EvidenceReference,
  type GrowthCaptureBundle,
  type GrowthLane,
  type ImmutableArtifactReference,
  IsoInstantSchema,
} from "./schema.js";

const DEFAULT_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_CAPTURE_FILE_COUNT = 10_000;
const DEFAULT_MAX_CAPTURE_TOTAL_BYTES = 256 * 1024 * 1024;
const BOUNDED_READ_CHUNK_BYTES = 64 * 1024;

export interface ArtifactWriteResult extends ImmutableArtifactReference {}

export interface CaptureIntakeOptions {
  captureBundlePath: string;
  allowedEvidenceRoot: string;
  runArtifactRoot: string;
  runAt: string;
  allowSyntheticEvidence?: boolean;
  maxArtifactBytes?: number;
  maxCaptureFileCount?: number;
  maxCaptureTotalBytes?: number;
}

export interface CaptureValidationOptions {
  captureBundlePath: string;
  allowedEvidenceRoot: string;
  runAt: string;
  expectedCaptureSha256?: string;
  maxArtifactBytes?: number;
  maxCaptureFileCount?: number;
  maxCaptureTotalBytes?: number;
}

export interface CaptureValidationResult {
  status: "valid";
  evidenceMode: "real";
  validationScope: "capture_preflight_only";
  countsTowardThreeRunGate: false;
  runtimeCompatible: boolean;
  metricDefinitionCompatibility: "current" | "legacy_read_only";
  bundleId: string;
  bundleSha256: string;
  validationHash: string;
  sourceRunCount: number;
  evidenceCount: number;
  assetCount: number;
  groupRulesArtifactCount: number;
  lanes: Record<
    GrowthLane,
    {
      sourceRunCount: number;
      evidenceCount: number;
    }
  >;
  privacyPrerequisites: "passed";
  schemaValidation: "passed";
  pathConfinement: "passed";
  declaredHashes: "passed";
  modelCalled: false;
  graphStateModified: false;
  externalActionStatus: "not_executed";
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
  {
    label: "credential-bearing JSON key",
    pattern:
      /["'](?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|password|passwd|client[_-]?secret)["']\s*:\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,}\]]+)/i,
  },
  {
    label: "authorization credential",
    pattern:
      /["']authorization["']\s*:\s*["'](?:bearer|basic)\s+[^"'\r\n]{4,}["']/i,
  },
  {
    label: "bearer credential",
    pattern: /["']bearer["']\s*:\s*["'][A-Za-z0-9._~+/=-]{8,}["']/i,
  },
  {
    label: "request signature credential",
    pattern: /["']signature["']\s*:\s*["'][A-Za-z0-9._~+/=-]{16,}["']/i,
  },
  {
    label: "credential-bearing query parameter",
    pattern:
      /[?&#](?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|password|passwd|client[_-]?secret|authorization|bearer|signature)=[^&#\s]+/i,
  },
  {
    label: "credential-bearing URL userinfo",
    pattern: /\bhttps?:\/\/[^\s/@?#:]+(?::[^\s/@?#]*)?@/i,
  },
  {
    label: "credential assignment",
    pattern:
      /(?:^|[\s;,])(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|password|passwd|client[_-]?secret|bearer|signature)\s*=\s*(?:"[^"\r\n]{6,}"|'[^'\r\n]{6,}'|[^\s"',;}]{6,})/im,
  },
  {
    label: "bearer authorization",
    pattern: /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._~+/-]{8,}/i,
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

interface ConfinedRegularFile {
  realPath: string;
  device: bigint;
  inode: bigint;
}

async function resolveConfinedRegularFile(
  root: string,
  candidate: string,
): Promise<ConfinedRegularFile> {
  const resolved = await realpath(candidate);
  if (!isInside(root, resolved)) {
    throw new ArtifactPolicyError("Evidence path escapes the allowed evidence root");
  }
  const stats = await lstat(resolved, { bigint: true });
  if (!stats.isFile()) {
    throw new ArtifactPolicyError("Evidence path must resolve to a regular file");
  }
  return { realPath: resolved, device: stats.dev, inode: stats.ino };
}

async function readBoundedFile(
  file: ConfinedRegularFile,
  allowedRoot: string,
  maxBytes: number,
  remainingCaptureBytes: number,
  afterInitialStat?: () => Promise<void>,
): Promise<Buffer> {
  const handle = await open(
    file.realPath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const stats = await handle.stat({ bigint: true });
    if (!stats.isFile()) throw new ArtifactPolicyError("Evidence is not a regular file");
    if (stats.dev !== file.device || stats.ino !== file.inode) {
      throw new ArtifactPolicyError(
        "Evidence identity changed between confinement and open checks",
      );
    }

    let postOpenPath: string;
    try {
      postOpenPath = await realpath(file.realPath);
    } catch {
      throw new ArtifactPolicyError(
        "Evidence path could not be revalidated after opening",
      );
    }
    if (postOpenPath !== file.realPath || !isInside(allowedRoot, postOpenPath)) {
      throw new ArtifactPolicyError(
        "Evidence path changed or escaped after opening",
      );
    }
    const postOpenStats = await lstat(postOpenPath, { bigint: true });
    if (
      !postOpenStats.isFile() ||
      postOpenStats.dev !== stats.dev ||
      postOpenStats.ino !== stats.ino
    ) {
      throw new ArtifactPolicyError(
        "Evidence identity changed during post-open confinement verification",
      );
    }

    if (stats.size > BigInt(maxBytes)) {
      throw new ArtifactPolicyError(`Evidence exceeds the ${maxBytes}-byte intake limit`);
    }
    if (stats.size > BigInt(remainingCaptureBytes)) {
      throw new ArtifactPolicyError("Capture exceeds the aggregate byte intake limit");
    }

    const initialSize = Number(stats.size);
    const bytes = Buffer.allocUnsafe(initialSize + 1);
    await afterInitialStat?.();
    let offset = 0;
    while (offset < bytes.byteLength) {
      const length = Math.min(
        BOUNDED_READ_CHUNK_BYTES,
        bytes.byteLength - offset,
      );
      const result = await handle.read(bytes, offset, length, null);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (offset > initialSize) {
      throw new ArtifactPolicyError("Evidence grew during bounded read");
    }
    const finalStats = await handle.stat({ bigint: true });
    if (
      finalStats.size !== stats.size ||
      finalStats.mtimeNs !== stats.mtimeNs ||
      finalStats.ctimeNs !== stats.ctimeNs
    ) {
      throw new ArtifactPolicyError("Evidence changed during bounded read");
    }
    return bytes.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

/** @internal Deterministic mutation hook for bounded-reader regression tests. */
export async function testOnlyReadBoundedFile(input: {
  path: string;
  allowedRoot: string;
  maxBytes: number;
  remainingCaptureBytes: number;
  afterInitialStat: () => Promise<void>;
}): Promise<Buffer> {
  const allowedRoot = await realpath(resolve(input.allowedRoot));
  const file = await resolveConfinedRegularFile(
    allowedRoot,
    resolve(input.path),
  );
  return readBoundedFile(
    file,
    allowedRoot,
    input.maxBytes,
    input.remainingCaptureBytes,
    input.afterInitialStat,
  );
}

class CaptureReadBudget {
  private fileCount = 0;
  private totalBytes = 0;

  constructor(
    private readonly allowedRoot: string,
    private readonly maxArtifactBytes: number,
    private readonly maxCaptureFileCount: number,
    private readonly maxCaptureTotalBytes: number,
  ) {}

  async read(file: ConfinedRegularFile): Promise<Buffer> {
    if (this.fileCount >= this.maxCaptureFileCount) {
      throw new ArtifactPolicyError("Capture exceeds the aggregate file-count limit");
    }
    const bytes = await readBoundedFile(
      file,
      this.allowedRoot,
      this.maxArtifactBytes,
      this.maxCaptureTotalBytes - this.totalBytes,
    );
    this.fileCount += 1;
    this.totalBytes += bytes.byteLength;
    return bytes;
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

function assertSourceRunMatchesArtifact(
  bundle: GrowthCaptureBundle,
  artifact: EvidenceArtifact,
): void {
  const matchingRuns = bundle.source_runs.filter((run) =>
    run.evidence_refs.includes(artifact.evidence_id),
  );
  if (matchingRuns.length !== 1) {
    throw new ArtifactPolicyError(
      `Evidence ${artifact.evidence_id} must belong to exactly one source run`,
    );
  }
  const sourceRun = matchingRuns[0]!;
  const artifactAccountOrPropertyId =
    artifact.lane === "organic_social"
      ? artifact.account_id
      : artifact.lane === "contact_discovery"
        ? artifact.account_or_collection_id
        : artifact.property_id;
  if (sourceRun.account_or_property_id !== artifactAccountOrPropertyId) {
    throw new ArtifactPolicyError(
      `Source-run identity does not match evidence ${artifact.evidence_id}`,
    );
  }
  const linkedDeclarations = bundle.evidence.filter((declaration) =>
    sourceRun.evidence_refs.includes(declaration.evidence_id),
  );
  if (
    (sourceRun.status === "verified_complete" || sourceRun.data_state === "complete") &&
    linkedDeclarations.some((declaration) => declaration.data_state !== "complete")
  ) {
    throw new ArtifactPolicyError(
      `Complete source run references partial evidence ${artifact.evidence_id}`,
    );
  }
  if (
    sourceRun.evidence_refs.length === 1 &&
    sourceRun.data_state !== artifact.data_state
  ) {
    throw new ArtifactPolicyError(
      `Source-run data state does not match evidence ${artifact.evidence_id}`,
    );
  }
  const linkedFreshness = linkedDeclarations.map(
    (declaration) => declaration.fresh_through,
  );
  if (sourceRun.evidence_refs.length === 1) {
    if (sourceRun.fresh_through !== artifact.fresh_through) {
      throw new ArtifactPolicyError(
        `Single-evidence source-run freshness must exactly match evidence ${artifact.evidence_id}`,
      );
    }
  } else if (linkedFreshness.some((value) => value === undefined)) {
    if (sourceRun.fresh_through !== undefined) {
      throw new ArtifactPolicyError(
        "A multi-evidence source run cannot claim freshness when linked evidence omits it",
      );
    }
  } else {
    const conservativeFreshness = [...(linkedFreshness as string[])].sort()[0];
    if (sourceRun.fresh_through !== conservativeFreshness) {
      throw new ArtifactPolicyError(
        "Multi-evidence source-run freshness must equal the oldest linked evidence",
      );
    }
  }
  const artifactCapturedAtMs = Date.parse(artifact.captured_at);
  if (
    artifactCapturedAtMs < Date.parse(sourceRun.started_at) ||
    (sourceRun.completed_at !== undefined &&
      artifactCapturedAtMs > Date.parse(sourceRun.completed_at))
  ) {
    throw new ArtifactPolicyError(
      `Evidence capture falls outside source-run timing for ${artifact.evidence_id}`,
    );
  }
}

function parseRunAt(runAt: string): number {
  const parsed = IsoInstantSchema.safeParse(runAt);
  if (!parsed.success) {
    throw new ArtifactPolicyError(
      "runAt must be an ISO-8601 instant with an explicit UTC offset",
    );
  }
  return Date.parse(parsed.data);
}

function assertCaptureTimelineBeforeRun(
  bundle: GrowthCaptureBundle,
  runAtMs: number,
): void {
  if (Date.parse(bundle.created_at) > runAtMs) {
    throw new ArtifactPolicyError("Capture bundle cannot be created after runAt");
  }
  const bundleCreatedAtMs = Date.parse(bundle.created_at);
  const projectRunDate = projectCalendarDate(runAtMs);
  const projectBundleDate = projectCalendarDate(bundleCreatedAtMs);
  if (!projectDateIsWithinWindow(projectRunDate, bundle.objective_window)) {
    throw new ArtifactPolicyError(
      "Project run date must fall within the capture objective window",
    );
  }
  for (const sourceRun of bundle.source_runs) {
    if (Date.parse(sourceRun.started_at) > runAtMs) {
      throw new ArtifactPolicyError("A capture source run cannot start after runAt");
    }
    if (Date.parse(sourceRun.started_at) > bundleCreatedAtMs) {
      throw new ArtifactPolicyError("A capture source run cannot start after bundle creation");
    }
    if (
      sourceRun.completed_at !== undefined &&
      Date.parse(sourceRun.completed_at) > runAtMs
    ) {
      throw new ArtifactPolicyError("A capture source run cannot complete after runAt");
    }
    if (
      sourceRun.completed_at !== undefined &&
      Date.parse(sourceRun.completed_at) > bundleCreatedAtMs
    ) {
      throw new ArtifactPolicyError(
        "A capture source run cannot complete after bundle creation",
      );
    }
    if (
      sourceRun.fresh_through !== undefined &&
      (sourceRun.fresh_through > projectRunDate ||
        sourceRun.fresh_through > projectBundleDate)
    ) {
      throw new ArtifactPolicyError("Source-run freshness cannot extend after runAt");
    }
  }
  for (const declaration of bundle.evidence) {
    const declarationCapturedAtMs = Date.parse(declaration.captured_at);
    const declarationCaptureDate = projectCalendarDate(declarationCapturedAtMs);
    if (declarationCapturedAtMs > bundleCreatedAtMs) {
      throw new ArtifactPolicyError("Declared evidence cannot be captured after bundle creation");
    }
    if (
      declaration.fresh_through !== undefined &&
      (declaration.fresh_through > declarationCaptureDate ||
        declaration.fresh_through > projectRunDate)
    ) {
      throw new ArtifactPolicyError(
        "Declared evidence freshness cannot extend after capture or runAt",
      );
    }
  }
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

function assertSearchEvidencePrivacySafe(
  artifact: Extract<EvidenceArtifact, { lane: "search_console" }>,
): void {
  const retainedLocations: string[] = [];
  if (artifact.schema_version === "code-the-future.growth-evidence.v1") {
    retainedLocations.push(
      ...artifact.payload.rows.map((row) => row.page),
      ...artifact.payload.page_inventory.flatMap((page) => [
        page.url,
        ...(page.canonical_url ? [page.canonical_url] : []),
      ]),
    );
  } else if (artifact.source === "search_console") {
    retainedLocations.push(
      ...artifact.payload.tables.pages.rows.map((row) => row.page),
    );
  }
  if (
    retainedLocations.some(
      (location) =>
        isProtectedIndexPath(location) &&
        !isSanitizedProtectedPathCategory(location),
    )
  ) {
    throw new ArtifactPolicyError(
      "Search evidence containing protected learner/admin URL detail is rejected before persistence; the capture adapter must retain category/count summaries only",
    );
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

interface PreparedCapture {
  bundle: GrowthCaptureBundle;
  bundleBytes: Buffer;
  bundleHash: string;
  pendingEvidence: PendingEvidence[];
  pendingAssets: Map<string, PendingAsset>;
  pendingGroupRules: Map<string, PendingGroupRulesArtifact>;
  validationHash: string;
}

interface PrepareCaptureOptions extends CaptureValidationOptions {
  allowSyntheticEvidence: boolean;
  requireCurrentMetricDefinition?: boolean;
}

export interface CaptureReadOnlyPreflightResult {
  bundle: GrowthCaptureBundle;
  bundleSha256: string;
  validationHash: string;
  evidenceMode: "real" | "synthetic";
  evidenceCount: number;
  assetCount: number;
  groupRulesArtifactCount: number;
}

function captureContentHash(input: {
  bundleHash: string;
  evidenceHashes: readonly string[];
  assetHashes: readonly string[];
  groupRulesHashes: readonly string[];
}): string {
  return sha256Bytes(
    serializeArtifactJson({
      bundle_sha256: input.bundleHash,
      evidence_sha256: [...input.evidenceHashes].sort((left, right) =>
        left.localeCompare(right),
      ),
      asset_sha256: [...input.assetHashes].sort((left, right) =>
        left.localeCompare(right),
      ),
      group_rules_sha256: [...input.groupRulesHashes].sort((left, right) =>
        left.localeCompare(right),
      ),
    }),
  );
}

async function prepareCaptureBundle(
  options: PrepareCaptureOptions,
): Promise<PreparedCapture> {
  const maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  const maxCaptureFileCount =
    options.maxCaptureFileCount ?? DEFAULT_MAX_CAPTURE_FILE_COUNT;
  const maxCaptureTotalBytes =
    options.maxCaptureTotalBytes ?? DEFAULT_MAX_CAPTURE_TOTAL_BYTES;
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes <= 0) {
    throw new ArtifactPolicyError("maxArtifactBytes must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxCaptureFileCount) || maxCaptureFileCount <= 0) {
    throw new ArtifactPolicyError(
      "maxCaptureFileCount must be a positive safe integer",
    );
  }
  if (!Number.isSafeInteger(maxCaptureTotalBytes) || maxCaptureTotalBytes <= 0) {
    throw new ArtifactPolicyError(
      "maxCaptureTotalBytes must be a positive safe integer",
    );
  }

  const allowedRoot = await realpath(resolve(options.allowedEvidenceRoot));
  const readBudget = new CaptureReadBudget(
    allowedRoot,
    maxArtifactBytes,
    maxCaptureFileCount,
    maxCaptureTotalBytes,
  );
  const bundleFile = await resolveConfinedRegularFile(
    allowedRoot,
    resolve(options.captureBundlePath),
  );
  const bundleBytes = await readBudget.read(bundleFile);
  assertNoSecrets(bundleBytes);
  const bundle = CaptureBundleSchema.parse(parseJson(bundleBytes, "Capture bundle"));
  if (
    options.requireCurrentMetricDefinition === true &&
    bundle.metric_definition_version !== CURRENT_METRIC_DEFINITION_VERSION
  ) {
    throw new ArtifactPolicyError(
      `Shadow runtime requires metric definition ${CURRENT_METRIC_DEFINITION_VERSION}`,
    );
  }
  const bundleHash = sha256Bytes(bundleBytes);
  if (
    options.expectedCaptureSha256 !== undefined &&
    options.expectedCaptureSha256 !== bundleHash
  ) {
    throw new ArtifactConflictError("Provided capture SHA-256 does not match the confined file");
  }
  const runAtMs = parseRunAt(options.runAt);
  assertCaptureTimelineBeforeRun(bundle, runAtMs);

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

  // Validate every artifact and all referenced asset bytes before creating any
  // run directory. The same read-only pass powers the standalone validator.
  const pendingEvidence: PendingEvidence[] = [];
  const pendingAssets = new Map<string, PendingAsset>();
  const pendingGroupRules = new Map<string, PendingGroupRulesArtifact>();
  for (const declaration of bundle.evidence) {
    if (isAbsolute(declaration.artifact_path)) {
      throw new ArtifactPolicyError("Evidence artifact_path must be relative to the allowed root");
    }
    const artifactFile = await resolveConfinedRegularFile(
      allowedRoot,
      resolve(allowedRoot, declaration.artifact_path),
    );
    const artifactBytes = await readBudget.read(artifactFile);
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
    if (Date.parse(artifact.captured_at) > runAtMs) {
      throw new ArtifactPolicyError("Evidence cannot be captured after runAt");
    }
    if (Date.parse(artifact.captured_at) > Date.parse(bundle.created_at)) {
      throw new ArtifactPolicyError("Evidence cannot be captured after bundle creation");
    }
    const runDate = projectCalendarDate(runAtMs);
    const artifactCaptureDate = projectCalendarDate(artifact.captured_at);
    if (
      artifact.fresh_through !== undefined &&
      (artifact.fresh_through > artifactCaptureDate ||
        artifact.fresh_through > runDate)
    ) {
      throw new ArtifactPolicyError(
        "Evidence freshness cannot extend after capture or runAt",
      );
    }
    assertAttestationMatches(declaration, artifact);
    assertSourceRunMatchesArtifact(bundle, artifact);
    const identityDecision = evaluateCodeTheFutureProjectIdentity(artifact);
    if (!identityDecision.accepted) {
      throw new ArtifactPolicyError(
        `Code the Future project identity rejected for ${artifact.evidence_id}: ${identityDecision.reason ?? "identity policy mismatch"}`,
      );
    }
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
    if (artifact.lane === "search_console") {
      assertSearchEvidencePrivacySafe(artifact);
    }
    pendingEvidence.push({ declaration, artifact, artifactBytes, artifactHash });

    if (artifact.lane === "organic_social") {
      for (const asset of artifact.payload.assets) {
        if (isAbsolute(asset.artifact_path)) {
          throw new ArtifactPolicyError("Social asset artifact_path must be relative");
        }
        const assetFile = await resolveConfinedRegularFile(
          allowedRoot,
          resolve(allowedRoot, asset.artifact_path),
        );
        const assetBytes = await readBudget.read(assetFile);
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
        const rulesFile = await resolveConfinedRegularFile(
          allowedRoot,
          resolve(allowedRoot, artifactPath),
        );
        const rulesBytes = await readBudget.read(rulesFile);
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

  const validationHash = captureContentHash({
    bundleHash,
    evidenceHashes: pendingEvidence.map((item) => item.artifactHash),
    assetHashes: [...pendingAssets.values()].map((item) => item.contentSha256),
    groupRulesHashes: [...pendingGroupRules.values()].map(
      (item) => item.contentSha256,
    ),
  });
  return {
    bundle,
    bundleBytes,
    bundleHash,
    pendingEvidence,
    pendingAssets,
    pendingGroupRules,
    validationHash,
  };
}

/**
 * Performs the runtime's complete bounded capture policy without creating a
 * run, copying artifacts, opening a ledger, or calling a model. Operator
 * reconciliation uses this before it claims an idempotency key or slot.
 */
export async function preflightCaptureBundleReadOnly(
  options: CaptureValidationOptions & {
    allowSyntheticEvidence: boolean;
    requireCurrentMetricDefinition?: boolean;
  },
): Promise<CaptureReadOnlyPreflightResult> {
  const prepared = await prepareCaptureBundle(options);
  const synthetic = prepared.bundle.evidence.every(
    (item) =>
      item.producer_mode === "synthetic_fixture" &&
      item.redaction_status === "synthetic",
  );
  if (options.allowSyntheticEvidence && !synthetic) {
    throw new ArtifactPolicyError(
      "Explicit synthetic preflight cannot contain real or mixed evidence",
    );
  }
  return {
    bundle: prepared.bundle,
    bundleSha256: prepared.bundleHash,
    validationHash: prepared.validationHash,
    evidenceMode: synthetic ? "synthetic" : "real",
    evidenceCount: prepared.pendingEvidence.length,
    assetCount: prepared.pendingAssets.size,
    groupRulesArtifactCount: prepared.pendingGroupRules.size,
  };
}

export async function validateRealCaptureBundle(
  options: CaptureValidationOptions,
): Promise<CaptureValidationResult> {
  const prepared = await prepareCaptureBundle({
    ...options,
    allowSyntheticEvidence: false,
  });
  const lanes = Object.fromEntries(
    (["organic_social", "contact_discovery", "search_console"] as const).map(
      (lane) => [
        lane,
        {
          sourceRunCount: prepared.bundle.source_runs.filter((run) => run.lane === lane)
            .length,
          evidenceCount: prepared.bundle.evidence.filter((item) => item.lane === lane)
            .length,
        },
      ],
    ),
  ) as CaptureValidationResult["lanes"];
  const metricDefinitionCompatibility =
    prepared.bundle.metric_definition_version === CURRENT_METRIC_DEFINITION_VERSION
      ? "current"
      : "legacy_read_only";

  return {
    status: "valid",
    evidenceMode: "real",
    validationScope: "capture_preflight_only",
    countsTowardThreeRunGate: false,
    runtimeCompatible: metricDefinitionCompatibility === "current",
    metricDefinitionCompatibility,
    bundleId: prepared.bundle.bundle_id,
    bundleSha256: prepared.bundleHash,
    validationHash: prepared.validationHash,
    sourceRunCount: prepared.bundle.source_runs.length,
    evidenceCount: prepared.pendingEvidence.length,
    assetCount: prepared.pendingAssets.size,
    groupRulesArtifactCount: prepared.pendingGroupRules.size,
    lanes,
    privacyPrerequisites: "passed",
    schemaValidation: "passed",
    pathConfinement: "passed",
    declaredHashes: "passed",
    modelCalled: false,
    graphStateModified: false,
    externalActionStatus: "not_executed",
  };
}

export async function intakeCaptureBundle(
  options: CaptureIntakeOptions,
): Promise<CaptureIntakeResult> {
  const {
    bundle,
    bundleBytes,
    bundleHash,
    pendingEvidence,
    pendingAssets,
    pendingGroupRules,
    validationHash,
  } = await prepareCaptureBundle({
    captureBundlePath: options.captureBundlePath,
    allowedEvidenceRoot: options.allowedEvidenceRoot,
    runAt: options.runAt,
    allowSyntheticEvidence: options.allowSyntheticEvidence ?? false,
    requireCurrentMetricDefinition: true,
    ...(options.maxArtifactBytes === undefined
      ? {}
      : { maxArtifactBytes: options.maxArtifactBytes }),
    ...(options.maxCaptureFileCount === undefined
      ? {}
      : { maxCaptureFileCount: options.maxCaptureFileCount }),
    ...(options.maxCaptureTotalBytes === undefined
      ? {}
      : { maxCaptureTotalBytes: options.maxCaptureTotalBytes }),
  });

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

  return {
    bundle,
    bundleArtifact,
    evidence,
    assetArtifacts,
    groupRulesArtifacts,
    intakeHash: validationHash,
  };
}
