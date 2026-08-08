import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  renderProjectState,
  writeProjectState,
  type ProjectStateInput,
} from "../src/project-state.js";

function syntheticProjectState(): ProjectStateInput {
  return {
    runId: "synthetic-state-run",
    graphVersion: "growth_portfolio_shadow_v1",
    policyVersion: "1.0.0",
    policyHash: "synthetic-policy-hash",
    evidenceMode: "synthetic",
    status: "awaiting_review",
    startedAt: "2026-08-08T12:00:00.000Z",
    completedAt: "2026-08-08T12:01:00.000Z",
    objectiveWindow: {
      startsAt: "2026-08-08",
      endsAt: "2026-10-07",
    },
    lanes: {
      organic_social: {
        status: "eligible",
        sourceCoverage: "complete",
        evidenceCount: 3,
        baselineStatus: "complete",
        baselineSummary: "Synthetic platform-separated follower baseline.",
        maturityStatus: "mature",
        primaryKpi: "organic_net_new_followers_60d_instagram",
        decision: "repeat",
        proposalStatus: "drafted",
        evalStatus: "pass",
        reviewStatus: "awaiting_review",
        nextSafeAction: "Inspect the local proposal.",
      },
    },
    localPersistence: {
      committed: true,
      verified: true,
      transactionId: "synthetic-transaction",
    },
    reviewCount: 1,
    externalActionStatus: "not_executed",
    errors: [],
    nextSafeAction: "Review the synthetic proposal; take no external action.",
  };
}

test("renders lane state and the shadow authority boundary", () => {
  const markdown = renderProjectState(syntheticProjectState());
  assert.match(markdown, /Organic Instagram and Facebook/);
  assert.match(markdown, /SYNTHETIC TEST EVIDENCE/);
  assert.match(markdown, /External actions: \*\*not_executed/);
  assert.match(markdown, /cannot publish or schedule social posts/);
  assert.doesNotMatch(markdown, /sk-proj-/i);
});

test("writes project state atomically with owner-only permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctf-project-state-"));
  const path = join(root, "PROJECT_STATE.md");

  assert.equal(await writeProjectState(path, syntheticProjectState()), path);
  assert.match(await readFile(path, "utf8"), /synthetic-state-run/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);

  await writeProjectState(path, {
    ...syntheticProjectState(),
    status: "completed",
  });
  assert.match(await readFile(path, "utf8"), /Status: \*\*completed\*\*/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});
