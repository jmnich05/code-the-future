import { projectCalendarDate } from "./project-policy.js";
import { IsoInstantSchema } from "./schema.js";

export function resolveSyntheticRunAt(
  requestedRunAt: string | undefined,
  allowSyntheticEvidence: boolean,
): string | undefined {
  if (requestedRunAt === undefined) return undefined;
  if (!allowSyntheticEvidence) {
    throw new Error("--run-at is restricted to explicit synthetic-evidence runs");
  }
  return IsoInstantSchema.parse(requestedRunAt);
}

export function defaultManualIdempotencyKey(
  captureSha256: string,
  startedAt: string,
): string {
  return `manual:${captureSha256}:${projectCalendarDate(startedAt)}`;
}
