import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_OUTPUT = join(REPO_ROOT, "public-dist");

// Root files require an explicit decision because the repository root also holds
// operator context, deployment source, migrations, and graph state.
export const PUBLIC_ROOT_FILES = Object.freeze([
  "404.html",
  "about.html",
  "checkout-success.html",
  "curriculum.html",
  "enroll.html",
  "faq.html",
  "how-it-works.html",
  "index.html",
  "launchpad.html",
  "older-adults.html",
  "older-kids.html",
  "privacy.html",
  "programs.html",
  "review.html",
  "robots.txt",
  "roundup.html",
  "site-pages.css",
  "sitemap.xml",
  "summer-2026.html",
  "terms.html",
  "why-ai-now.html",
  "young-teens.html",
]);

// These directories contain the current browser runtime. Only deployable web
// formats are copied from them; source notes, local servers, nested Netlify
// configs, env examples, and build generators remain outside the publish tree.
export const PUBLIC_RUNTIME_DIRECTORIES = Object.freeze([
  "assets",
  "buildlab",
  "curriculum",
  "platform",
  "play",
  "studentdemos",
]);

export const PUBLIC_RUNTIME_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".m4a",
  ".mp3",
  ".mp4",
  ".png",
  ".svg",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const BLOCKED_RUNTIME_SUFFIXES = [
  ".example.js",
  "platform/assets/film.mp4",
  "platform/assets/film-poster.jpg",
];
const BLOCKED_RUNTIME_DIRECTORY_NAMES = new Set(["in-person", "netlify", "server"]);

function assertInside(base, candidate, label) {
  const rel = relative(base, candidate);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || resolve(base, rel) !== candidate) {
    throw new Error(`${label} must be a descendant of the repository root`);
  }
}

function isRuntimeFile(path) {
  const lower = path.toLowerCase();
  return (
    PUBLIC_RUNTIME_EXTENSIONS.has(extname(lower)) &&
    !BLOCKED_RUNTIME_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  );
}

async function copyRequiredFile(source, destination) {
  const stat = await lstat(source);
  if (!stat.isFile()) {
    throw new Error(`Required public file is not a regular file: ${relative(REPO_ROOT, source)}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function copyRuntimeTree(sourceRoot, destinationRoot) {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const source = join(sourceRoot, entry.name);
    const destination = join(destinationRoot, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed in public runtime trees: ${relative(REPO_ROOT, source)}`);
    }
    if (entry.isDirectory()) {
      if (BLOCKED_RUNTIME_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
        continue;
      }
      await copyRuntimeTree(source, destination);
      continue;
    }
    if (entry.isFile() && isRuntimeFile(source)) {
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported public runtime entry: ${relative(REPO_ROOT, source)}`);
    }
  }
}

export async function buildPublicSite() {
  assertInside(REPO_ROOT, PUBLIC_OUTPUT, "Public output");
  // This directory is generated and reproducible. Clear the prior build first
  // so local and CI verification never needs room for two full media copies.
  await rm(PUBLIC_OUTPUT, { recursive: true, force: true });
  const stagingRoot = await mkdtemp(join(REPO_ROOT, ".public-dist-"));

  try {
    for (const sourcePath of PUBLIC_ROOT_FILES) {
      const source = join(REPO_ROOT, sourcePath);
      const destination = join(stagingRoot, sourcePath);
      assertInside(REPO_ROOT, source, "Public source");
      await copyRequiredFile(source, destination);
    }

    for (const sourcePath of PUBLIC_RUNTIME_DIRECTORIES) {
      const source = join(REPO_ROOT, sourcePath);
      const destination = join(stagingRoot, sourcePath);
      assertInside(REPO_ROOT, source, "Runtime source");
      await copyRuntimeTree(source, destination);
    }

    await rename(stagingRoot, PUBLIC_OUTPUT);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  return PUBLIC_OUTPUT;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const output = await buildPublicSite();
  console.log(`Built allowlisted public site at ${relative(REPO_ROOT, output)}/`);
}
