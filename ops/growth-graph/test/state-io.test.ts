import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildObserverProjection,
  writeObserverProjection,
} from "../src/observer.js";
import {
  preparePrivateSqliteFile,
  prepareStateDirectory,
  UnsafeStatePathError,
  writeOwnerOnlyFileAtomic,
} from "../src/state-io.js";

test("atomically replaces mutable state with owner-only bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctf-state-atomic-"));
  const target = join(root, "PROJECT_STATE.md");
  await writeFile(target, "old complete projection\n");
  await chmod(target, 0o666);

  await writeOwnerOnlyFileAtomic(target, "new complete projection\n");

  assert.equal(await readFile(target, "utf8"), "new complete projection\n");
  assert.equal((await stat(target)).mode & 0o777, 0o600);
  assert.deepEqual(
    (await readdir(root)).filter((name) => name.endsWith(".tmp")),
    [],
  );
});

test("mutable state writes reject a symlink target without touching its referent", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctf-state-target-link-"));
  const unrelated = join(root, "unrelated.txt");
  const target = join(root, "PROJECT_STATE.md");
  await writeFile(unrelated, "must remain unchanged\n");
  await symlink(unrelated, target);

  await assert.rejects(
    writeOwnerOnlyFileAtomic(target, "unsafe replacement\n"),
    UnsafeStatePathError,
  );
  assert.equal(await readFile(unrelated, "utf8"), "must remain unchanged\n");
  assert.equal((await lstat(target)).isSymbolicLink(), true);
});

test("state directories reject a final symlink path", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctf-state-dir-link-"));
  const unrelated = join(root, "unrelated");
  const target = join(root, "observer");
  await mkdir(unrelated);
  await symlink(unrelated, target, "dir");

  await assert.rejects(prepareStateDirectory(target), UnsafeStatePathError);
  assert.deepEqual(await readdir(unrelated), []);
});

test("observer target preflight prevents a partial pair update", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctf-observer-preflight-"));
  const observerDirectory = join(root, "observer");
  const unrelated = join(root, "unrelated.html");
  await mkdir(observerDirectory, { mode: 0o777 });
  await writeFile(join(observerDirectory, "latest.json"), "old json\n");
  await writeFile(unrelated, "must remain unchanged\n");
  await symlink(unrelated, join(observerDirectory, "index.html"));
  const projection = buildObserverProjection({
    runId: "synthetic-preflight-run",
    graphVersion: "growth_portfolio_shadow_v1",
    policyVersion: "1.0.0",
    evidenceMode: "synthetic",
    status: "completed",
    startedAt: "2026-08-08T12:00:00.000Z",
  });

  await assert.rejects(
    writeObserverProjection(observerDirectory, projection),
    UnsafeStatePathError,
  );
  assert.equal(
    await readFile(join(observerDirectory, "latest.json"), "utf8"),
    "old json\n",
  );
  assert.equal(await readFile(unrelated, "utf8"), "must remain unchanged\n");
  assert.equal((await stat(observerDirectory)).mode & 0o777, 0o700);
});

test("SQLite preflight creates private files and rejects symlink targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctf-sqlite-preflight-"));
  const stateRoot = join(root, "state");
  const databasePath = join(stateRoot, "checkpoints.sqlite");
  await mkdir(stateRoot, { mode: 0o777 });

  assert.equal(await preparePrivateSqliteFile(databasePath), databasePath);
  assert.equal((await stat(stateRoot)).mode & 0o777, 0o700);
  assert.equal((await stat(databasePath)).mode & 0o777, 0o600);

  const unrelated = join(root, "unrelated.sqlite");
  const linkedDatabase = join(stateRoot, "linked.sqlite");
  await writeFile(unrelated, "must remain unchanged\n");
  await symlink(unrelated, linkedDatabase);
  await assert.rejects(
    preparePrivateSqliteFile(linkedDatabase),
    UnsafeStatePathError,
  );
  assert.equal(await readFile(unrelated, "utf8"), "must remain unchanged\n");
});
