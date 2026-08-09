export const CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY_VERSION =
  "code-the-future.project-identity.v1.1" as const;

export const CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY = {
  schema_version: CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY_VERSION,
  canonical_host: "codethefuture.net",
  business_timezone: "America/New_York",
  search_console: {
    verified_real_property_ids: ["https://codethefuture.net/"],
  },
  ga4: {
    verified_real_property_id: "547164458",
    verified_stream_host_scope: "codethefuture.net",
  },
  meta_business: {
    verified_asset_id: "1211320332069277",
    verified_business_portfolio_id: "1382097470521196",
  },
  facebook: {
    verified_page_id: "61592857947154",
  },
  instagram: {
    verified_numeric_account_ids: [] as readonly string[],
    partial_observation_handle: "codethefuturelouisville",
  },
  allowed_real_producer_modes: {
    instagram_insights: ["authenticated_read", "read_only_export"],
    facebook_insights: ["authenticated_read", "read_only_export"],
    consent_registry: ["authenticated_read", "read_only_export"],
    public_web: ["authenticated_read", "read_only_export", "public_web"],
    contact_history: ["authenticated_read", "read_only_export"],
    search_console: ["authenticated_read", "read_only_export"],
    site_inventory: ["public_web", "read_only_export"],
    ga4: ["authenticated_read", "read_only_export"],
  },
} as const;

const PROJECT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.business_timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const OFFSET_QUALIFIED_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
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

export function normalizedIndexPath(urlOrPath: string): string {
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
  return `/${segments.join("/")}`.toLowerCase();
}

export function protectedIndexPathCategory(
  urlOrPath: string,
): (typeof PROTECTED_INDEX_PATHS)[number] | undefined {
  const normalized = normalizedIndexPath(urlOrPath);
  return PROTECTED_INDEX_PATHS.find(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function isProtectedIndexPath(urlOrPath: string): boolean {
  return protectedIndexPathCategory(urlOrPath) !== undefined;
}

export function isSanitizedProtectedPathCategory(urlOrPath: string): boolean {
  const category = protectedIndexPathCategory(urlOrPath);
  if (!category || normalizedIndexPath(urlOrPath) !== category) return false;
  try {
    const url = new URL(urlOrPath);
    if (url.username || url.password || url.search || url.hash) return false;
    const rawPath = url.pathname.toLowerCase();
    return rawPath === category || rawPath === `${category}/`;
  } catch {
    const rawPath = urlOrPath.toLowerCase();
    return rawPath === category || rawPath === `${category}/`;
  }
}

export function projectCalendarDate(value: string | number): string {
  if (typeof value === "string" && !OFFSET_QUALIFIED_INSTANT.test(value)) {
    throw new Error(
      "Project calendar date requires an ISO-8601 instant with an explicit UTC offset",
    );
  }
  const instant = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(instant)) {
    throw new Error("Project calendar date requires a valid instant");
  }
  const parts = new Map(
    PROJECT_DATE_FORMATTER.formatToParts(new Date(instant)).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function addProjectCalendarDays(value: string, days: number): string {
  const match = ISO_CALENDAR_DATE.exec(value);
  if (!match || !Number.isSafeInteger(days)) {
    throw new Error("Project calendar arithmetic requires an ISO date and integer days");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    throw new Error("Project calendar arithmetic requires a real calendar date");
  }
  calendar.setUTCDate(calendar.getUTCDate() + days);
  const shiftedYear = String(calendar.getUTCFullYear()).padStart(4, "0");
  const shiftedMonth = String(calendar.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(calendar.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

export function projectDateIsWithinWindow(
  projectDate: string,
  window: { start: string; end: string },
): boolean {
  return projectDate >= window.start && projectDate <= window.end;
}

export type ProjectEvidenceSource =
  keyof typeof CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.allowed_real_producer_modes;
export type ProjectProducerMode =
  | "authenticated_read"
  | "read_only_export"
  | "public_web"
  | "synthetic_fixture";

interface PolicyArtifact {
  schema_version: string;
  source: ProjectEvidenceSource;
  producer: {
    adapter?: string;
    version?: string;
    mode: ProjectProducerMode;
  };
  redaction_status: "public" | "redacted" | "synthetic";
  data_state: "complete" | "partial" | "top_rows" | "unknown";
  platform?: "instagram" | "facebook";
  account_id?: string;
  property_id?: string;
  property_url?: string;
  stream?:
    | { state: "verified"; stream_url: string }
    | { state: "unavailable"; reason: string };
  meta_identity?: {
    asset_id: string;
    page_id: string;
    business_portfolio_id?: string | undefined;
  } | undefined;
}

export interface ProjectIdentityDecision {
  accepted: boolean;
  decision_eligible: boolean;
  reason?: string;
}

export function isExplicitSyntheticEvidence(
  artifact: Pick<PolicyArtifact, "producer" | "redaction_status">,
): boolean {
  return (
    artifact.producer.mode === "synthetic_fixture" &&
    artifact.redaction_status === "synthetic"
  );
}

export function isAllowedEvidenceProducerMode(
  source: ProjectEvidenceSource,
  mode: ProjectProducerMode,
): boolean {
  if (mode === "synthetic_fixture") return true;
  const allowed = CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY
    .allowed_real_producer_modes[source] as readonly string[];
  return allowed.includes(mode);
}

function hostIsInProjectScope(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/u, "");
    const scope = CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.canonical_host;
    return host === scope || host.endsWith(`.${scope}`);
  } catch {
    return false;
  }
}

function isExactVerifiedSearchPrefix(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.toLowerCase().replace(/\.$/u, "") ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.canonical_host &&
      url.port === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function reject(reason: string): ProjectIdentityDecision {
  return { accepted: false, decision_eligible: false, reason };
}

export function evaluateCodeTheFutureProjectIdentity(
  artifact: PolicyArtifact,
): ProjectIdentityDecision {
  if (isExplicitSyntheticEvidence(artifact)) {
    return { accepted: true, decision_eligible: true };
  }

  if (artifact.producer.mode === "synthetic_fixture") {
    return reject(
      "Synthetic producer mode requires an explicitly synthetic evidence attestation",
    );
  }

  if (!isAllowedEvidenceProducerMode(artifact.source, artifact.producer.mode)) {
    return reject("Evidence producer mode is not allowed for its source");
  }

  if (artifact.source === "consent_registry") {
    if (
      artifact.platform === "facebook" &&
      (artifact.account_id ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.facebook.verified_page_id ||
        artifact.account_id ===
          CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.meta_business.verified_asset_id)
    ) {
      return { accepted: true, decision_eligible: false };
    }
    if (artifact.platform === "instagram") {
      const verifiedIds = CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.instagram
        .verified_numeric_account_ids as readonly string[];
      if (
        (artifact.account_id !== undefined && verifiedIds.includes(artifact.account_id)) ||
        artifact.account_id ===
          CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.instagram
            .partial_observation_handle
      ) {
        return { accepted: true, decision_eligible: false };
      }
    }
    return reject("Consent evidence does not match a scoped project social identity");
  }

  if (artifact.source === "facebook_insights" || artifact.platform === "facebook") {
    const typedIdentityMatches =
      artifact.schema_version === "code-the-future.growth-evidence.v1.1" &&
      artifact.account_id ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.facebook.verified_page_id &&
      artifact.meta_identity?.asset_id ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.meta_business.verified_asset_id &&
      artifact.meta_identity.page_id ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.facebook.verified_page_id &&
      artifact.meta_identity.business_portfolio_id ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.meta_business
          .verified_business_portfolio_id;
    if (typedIdentityMatches) {
      return { accepted: true, decision_eligible: true };
    }
    if (artifact.meta_identity !== undefined) {
      return reject("Facebook Meta asset, Page, or business portfolio identity is wrong");
    }
    if (
      artifact.account_id ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.facebook.verified_page_id ||
      (artifact.data_state !== "complete" &&
        artifact.account_id ===
          CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.meta_business.verified_asset_id)
    ) {
      return { accepted: true, decision_eligible: false };
    }
    return reject("Facebook evidence does not match the verified project Page identity");
  }

  if (artifact.source === "instagram_insights" || artifact.platform === "instagram") {
    const verifiedIds = CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.instagram
      .verified_numeric_account_ids as readonly string[];
    if (artifact.account_id !== undefined && verifiedIds.includes(artifact.account_id)) {
      return { accepted: true, decision_eligible: true };
    }
    if (
      artifact.account_id ===
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.instagram.partial_observation_handle &&
      artifact.source === "instagram_insights" &&
      artifact.data_state !== "complete"
    ) {
      return { accepted: true, decision_eligible: false };
    }
    return reject(
      "Instagram evidence lacks a verified numeric project account identity",
    );
  }

  if (artifact.source === "search_console" || artifact.source === "site_inventory") {
    if (
      artifact.property_id !==
        CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.search_console
          .verified_real_property_ids[0] ||
      artifact.property_url === undefined ||
      !isExactVerifiedSearchPrefix(artifact.property_url)
    ) {
      return reject(
        "Search evidence does not match the verified Code the Future URL-prefix property",
      );
    }
    return { accepted: true, decision_eligible: true };
  }

  if (artifact.source === "ga4") {
    if (
      artifact.property_id !==
      CODE_THE_FUTURE_PROJECT_IDENTITY_POLICY.ga4.verified_real_property_id
    ) {
      return reject("GA4 evidence does not match the verified project property");
    }
    if (artifact.schema_version === "code-the-future.growth-evidence.v1") {
      return { accepted: true, decision_eligible: false };
    }
    if (artifact.stream?.state === "unavailable" && artifact.data_state !== "complete") {
      return { accepted: true, decision_eligible: false };
    }
    if (
      artifact.stream?.state !== "verified" ||
      !hostIsInProjectScope(artifact.stream.stream_url)
    ) {
      return reject("GA4 evidence lacks a verified Code the Future stream host");
    }
    return { accepted: true, decision_eligible: true };
  }

  return { accepted: true, decision_eligible: true };
}
