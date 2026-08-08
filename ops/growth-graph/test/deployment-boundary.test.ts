import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";

// @ts-expect-error The dependency-free Netlify builder is intentionally plain ESM.
import * as publicBuildModule from "../../../scripts/build-public-site.mjs";

const {
  buildPublicSite,
  PUBLIC_OUTPUT,
  PUBLIC_ROOT_FILES,
  PUBLIC_RUNTIME_DIRECTORIES,
  PUBLIC_RUNTIME_EXTENSIONS,
} = publicBuildModule as {
  buildPublicSite: () => Promise<string>;
  PUBLIC_OUTPUT: string;
  PUBLIC_ROOT_FILES: readonly string[];
  PUBLIC_RUNTIME_DIRECTORIES: readonly string[];
  PUBLIC_RUNTIME_EXTENSIONS: ReadonlySet<string>;
};

async function listFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else {
      files.push(relative(root, path));
    }
  }
  return files;
}

test("builds only the explicit browser-runtime allowlist", async () => {
  const repositoryRootEntries = await readdir(new URL("../../../", import.meta.url), {
    withFileTypes: true,
  });
  const repositoryRootHtml = repositoryRootEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    [...PUBLIC_ROOT_FILES].filter((path) => path.endsWith(".html")).sort(),
    repositoryRootHtml,
    "every repository-root HTML page must be explicitly allowlisted",
  );

  await buildPublicSite();
  const files = await listFiles(PUBLIC_OUTPUT);

  for (const required of [
    "index.html",
    "404.html",
    "robots.txt",
    "sitemap.xml",
    "platform/index.html",
    "platform/login.html",
    "platform/missions.html",
    "platform/lib/config.js",
    "curriculum/module-01-what-is-ai/lessons/player.html",
    "curriculum/module-02-ai-and-society/lessons/player.html",
    "curriculum/module-03-how-coding-got-done/lessons/player.html",
    "curriculum/module-04-build-your-own/studio.html",
    "buildlab/play.html",
    "play/cdf1-dh0bcnt5/index.html",
    "studentdemos/index.html",
  ]) {
    assert.ok(files.includes(required), `missing required public runtime file: ${required}`);
  }

  for (const forbidden of [
    "AGENTS.md",
    "CLAUDE.md",
    "MEMORY.md",
    "PROJECT_CHARTER.md",
    "PROJECT_STATE.md",
    "README.md",
    "admin/index.html",
    "docs/graph/README.md",
    "netlify/functions/ai.js",
    "netlify/edge-functions/gate.js",
    "ops/growth-graph/package.json",
    "scripts/build-public-site.mjs",
    "supabase/migrations/20260611120000_staff_notify.sql",
    "curriculum/README.md",
    "curriculum/module-01-what-is-ai/capstone/.env.example",
    "curriculum/module-01-what-is-ai/capstone/netlify.toml",
    "curriculum/module-01-what-is-ai/capstone/netlify/functions/ai.js",
    "curriculum/module-01-what-is-ai/capstone/server/dev-server.mjs",
    "curriculum/module-01-what-is-ai/lessons/build.mjs",
    "curriculum/module-01-what-is-ai/in-person/class-01-facilitator-guide.html",
    "curriculum/module-01-what-is-ai/in-person/coach-notes-session1.html",
    "curriculum/module-02-ai-and-society/in-person/coach-notes-session2.html",
    "curriculum/module-03-how-coding-got-done/in-person/coach-notes-session3.html",
    "curriculum/module-04-build-your-own/in-person/coach-notes-session4.html",
    "platform/lib/config.example.js",
    "play/LINKS.txt",
  ]) {
    assert.ok(!files.includes(forbidden), `internal file crossed deploy boundary: ${forbidden}`);
  }

  assert.deepEqual([...PUBLIC_ROOT_FILES].sort(), files.filter((path) => !path.includes("/")).sort());
  assert.ok(!PUBLIC_RUNTIME_DIRECTORIES.includes("admin"), "ungated admin tree must never be allowlisted");
  for (const path of files.filter((candidate) => candidate.includes("/"))) {
    assert.doesNotMatch(
      path,
      /(^|\/)(?:admin|in-person|netlify|server)(?:\/|$)/,
      `internal directory deployed: ${path}`,
    );
    assert.ok(
      PUBLIC_RUNTIME_DIRECTORIES.some((directory) => path.startsWith(`${directory}/`)),
      `file is outside allowlisted runtime directories: ${path}`,
    );
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    assert.ok(PUBLIC_RUNTIME_EXTENSIONS.has(extension), `non-runtime extension deployed: ${path}`);
    assert.ok(!path.endsWith(".example.js"), `example source deployed: ${path}`);
  }
});

test("keeps functions and internal source outside the Netlify publish directory", async () => {
  const netlify = await readFile(
    new URL("../../../netlify.toml", import.meta.url),
    "utf8",
  );
  const gitignore = await readFile(
    new URL("../../../.gitignore", import.meta.url),
    "utf8",
  );

  assert.match(netlify, /\[build\][\s\S]*?command\s*=\s*"node scripts\/build-public-site\.mjs"/);
  assert.match(netlify, /\[build\][\s\S]*?publish\s*=\s*"public-dist"/);
  assert.match(netlify, /\[build\][\s\S]*?functions\s*=\s*"netlify\/functions"/);
  assert.match(netlify, /\[build\][\s\S]*?edge_functions\s*=\s*"netlify\/edge-functions"/);
  assert.doesNotMatch(netlify, /publish\s*=\s*"\."/);

  for (const path of [
    "/docs/*",
    "/ops/*",
    "/PROJECT_CHARTER.md",
    "/PROJECT_STATE.md",
  ]) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      netlify,
      new RegExp(
        `from\\s*=\\s*"${escaped}"[\\s\\S]*?to\\s*=\\s*"/404\\.html"[\\s\\S]*?status\\s*=\\s*404[\\s\\S]*?force\\s*=\\s*true`,
      ),
    );
  }

  assert.match(gitignore, /^\.state\/$/m);
  assert.match(gitignore, /^PROJECT_STATE\.md$/m);
  assert.match(gitignore, /^public-dist\/$/m);
  assert.match(gitignore, /^\.public-dist-\*\/$/m);
});
