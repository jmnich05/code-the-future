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

export function normalizeScheduledSlot(slot: string): string {
  const parsed = IsoInstantSchema.parse(slot);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts = new Map(
    formatter
      .formatToParts(new Date(parsed))
      .map((part) => [part.type, part.value]),
  );
  const offset =
    (parts.get("timeZoneName") ?? "GMT").replace("GMT", "") || "+00:00";
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}${offset}`;
}

export function scheduledIdempotencyKeyForSlot(
  projectId: string,
  graphVersion: string,
  slot: string,
): string {
  return `scheduled:${projectId}:${graphVersion}:${normalizeScheduledSlot(slot)}`;
}

export function validateTriggerIdentity(input: {
  triggerKind: string;
  triggerReference?: string;
  idempotencyKey: string;
  projectId: string;
  graphVersion: string;
}): "manual" | "scheduled" {
  if (input.triggerKind !== "manual" && input.triggerKind !== "scheduled") {
    throw new Error("--trigger-kind must be manual or scheduled");
  }
  if (input.triggerKind === "scheduled") {
    if (!input.triggerReference) {
      throw new Error("Scheduled triggers require --trigger-ref");
    }
    const expected = scheduledIdempotencyKeyForSlot(
      input.projectId,
      input.graphVersion,
      input.triggerReference,
    );
    if (input.idempotencyKey !== expected) {
      throw new Error(
        "Scheduled trigger reference and idempotency key do not match",
      );
    }
  } else {
    if (input.triggerReference) {
      throw new Error("--trigger-ref is accepted only for scheduled triggers");
    }
    if (input.idempotencyKey.startsWith("scheduled:")) {
      throw new Error(
        "Manual triggers cannot use the reserved scheduled idempotency namespace",
      );
    }
  }
  return input.triggerKind;
}
