import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildObserverProjection,
  redactObserverValue,
  renderObserverHtml,
  writeObserverProjection,
} from "../src/observer.js";

test("redacts secrets and direct contact material", () => {
  const tokenShapedValue = ["sk", "proj", "synthetic-do-not-display"].join("-");
  const bearerShapedValue = ["Bearer", "synthetic-token-value"].join(" ");
  const redacted = redactObserverValue({
    runId: "synthetic-run",
    apiKey: tokenShapedValue,
    publicContact: "person@example.test",
    nested: { authorization: bearerShapedValue },
  }) as Record<string, unknown>;
  assert.equal(redacted.runId, "synthetic-run");
  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.publicContact, "[REDACTED]");
  assert.deepEqual(redacted.nested, { authorization: "[REDACTED]" });
});

test("renders every required graph node and the bounded repair edge", () => {
  const projection = buildObserverProjection({
    runId: "synthetic-repair-run",
    graphVersion: "growth_portfolio_shadow_v1",
    policyVersion: "1.0.0",
    evidenceMode: "synthetic",
    status: "running",
    currentNode: "eval",
    startedAt: "2026-08-08T12:00:00.000Z",
    traversedEdges: [
      "llm_strategy->action_draft",
      "action_draft->eval",
      "eval->bounded_repair",
      "bounded_repair->eval",
    ],
  });
  for (const node of [
    "trigger",
    "preflight",
    "capture",
    "validate",
    "data_analysis",
    "llm_strategy",
    "action_draft",
    "eval",
    "bounded_repair",
    "human_review",
    "commit",
    "readback",
    "finalize",
  ]) {
    assert.ok(projection.topology.some((entry) => entry.id === node));
  }
  assert.equal(
    projection.edges.find(
      (edge) => edge.from === "bounded_repair" && edge.to === "eval",
    )?.active,
    true,
  );
});

test("renders a static observer without an action surface", () => {
  const html = renderObserverHtml(
    buildObserverProjection({
      runId: "synthetic-static-run",
      graphVersion: "growth_portfolio_shadow_v1",
      policyVersion: "1.0.0",
      evidenceMode: "synthetic",
      status: "awaiting_review",
      currentNode: "human_review",
      startedAt: "2026-08-08T12:00:00.000Z",
      lanes: {
        organic_social: {
          status: "eligible",
          proposalStatus: "drafted",
          reviewStatus: "awaiting_review",
        },
      },
    }),
  );
  assert.match(html, /Synthetic test evidence/);
  assert.match(html, /Graph nodes and current execution state/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /\/(?:invoke|retry|resume|approve|publish|send|deploy)\b/i);
});

test("writes observer artifacts with owner-only permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctf-observer-synthetic-"));
  const observerDirectory = join(root, "observer");
  const projection = buildObserverProjection({
    runId: "synthetic-file-run",
    graphVersion: "growth_portfolio_shadow_v1",
    policyVersion: "1.0.0",
    evidenceMode: "real",
    status: "completed",
    startedAt: "2026-08-08T12:00:00.000Z",
  });
  await writeObserverProjection(observerDirectory, projection);
  const htmlPath = join(observerDirectory, "index.html");
  assert.match(await readFile(htmlPath, "utf8"), /Read-only inspection/);
  assert.equal((await stat(htmlPath)).mode & 0o777, 0o600);
  assert.equal(
    (await stat(join(observerDirectory, "latest.json"))).mode & 0o777,
    0o600,
  );
  assert.equal((await stat(observerDirectory)).mode & 0o777, 0o700);
});
