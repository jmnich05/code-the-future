import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("trajectory bank is synthetic, cross-lane, and authority bounded", async () => {
  const text = await readFile(
    new URL("../evals/trajectory-bank.jsonl", import.meta.url),
    "utf8",
  );
  const cases = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(cases.length >= 30);
  assert.ok(cases.every((entry) => entry.synthetic === true));
  assert.deepEqual(
    new Set(cases.map((entry) => entry.lane)),
    new Set(["portfolio", "organic_social", "contact_discovery", "search_console"]),
  );
  assert.ok(
    cases.every((entry) =>
      (entry.expected_path as string[]).every(
        (node) => !/publish|send|deploy|message|boost|spend/i.test(node),
      ),
    ),
  );
  assert.doesNotMatch(text, /sk-(?:proj-)?[A-Za-z0-9_-]{12,}/i);
});
