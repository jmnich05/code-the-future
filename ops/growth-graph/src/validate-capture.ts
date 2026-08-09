import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { ZodError } from "zod";

import {
  ArtifactConflictError,
  ArtifactPolicyError,
  validateRealCaptureBundle,
} from "./artifacts.js";
import { Sha256Schema } from "./schema.js";

class CliArgumentError extends Error {}

interface SafeValidationError {
  status: "invalid";
  code:
    | "invalid_arguments"
    | "schema_validation_failed"
    | "capture_conflict"
    | "capture_policy_rejected"
    | "path_validation_failed"
    | "capture_validation_failed";
  error: string;
}

function classifyValidationError(error: unknown): SafeValidationError {
  const nodeCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  if (error instanceof CliArgumentError || nodeCode?.startsWith("ERR_PARSE_ARGS")) {
    return {
      status: "invalid",
      code: "invalid_arguments",
      error: "Validator arguments are invalid.",
    };
  }
  if (error instanceof ZodError) {
    return {
      status: "invalid",
      code: "schema_validation_failed",
      error: "Capture or digest schema validation failed.",
    };
  }
  if (error instanceof ArtifactConflictError) {
    return {
      status: "invalid",
      code: "capture_conflict",
      error: "Capture bytes do not match their declared or expected attestation.",
    };
  }
  if (error instanceof ArtifactPolicyError) {
    return {
      status: "invalid",
      code: "capture_policy_rejected",
      error: "Capture was rejected by the evidence policy.",
    };
  }
  if (
    nodeCode !== undefined &&
    [
      "EACCES",
      "EISDIR",
      "ELOOP",
      "EMFILE",
      "ENFILE",
      "ENOENT",
      "ENOTDIR",
      "EPERM",
    ].includes(nodeCode)
  ) {
    return {
      status: "invalid",
      code: "path_validation_failed",
      error: "Capture path validation or file access failed.",
    };
  }
  return {
    status: "invalid",
    code: "capture_validation_failed",
    error: "Capture validation failed.",
  };
}

function usage(): string {
  return `Code the Future real-capture validator (read-only)

Usage:
  npm run graph:validate-capture -- \\
    --capture /absolute/path/capture-bundle.json \\
    --evidence-root /absolute/path/to/smallest-approved-root \\
    --run-at 2026-08-08T16:00:00-04:00 \\
    [--sha LOWERCASE_SHA256]

The explicit --run-at instant makes consent and revocation checks repeatable.
This command rejects synthetic evidence, does not load an API key or call a
model, and does not create graph state, checkpoints, ledger rows, or copies.`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      capture: { type: "string" },
      "evidence-root": { type: "string" },
      "run-at": { type: "string" },
      sha: { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!values.capture || !values["evidence-root"] || !values["run-at"]) {
    throw new CliArgumentError("Required validator arguments are missing");
  }

  const result = await validateRealCaptureBundle({
    captureBundlePath: values.capture,
    allowedEvidenceRoot: values["evidence-root"],
    runAt: values["run-at"],
    ...(values.sha === undefined
      ? {}
      : { expectedCaptureSha256: Sha256Schema.parse(values.sha) }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(classifyValidationError(error))}\n`);
    process.exitCode = 1;
  });
}
