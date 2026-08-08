import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export class UnsafeStatePathError extends Error {
  override name = "UnsafeStatePathError";
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Creates a state directory if needed and rejects a final path that is a
 * directory symlink. Callers decide whether changing the directory
 * mode is appropriate; repository parents must not be chmodded as a side
 * effect of writing PROJECT_STATE.md.
 */
export async function prepareStateDirectory(
  path: string,
  options: { ownerOnly?: boolean } = {},
): Promise<string> {
  const absolutePath = resolve(path);
  await mkdir(absolutePath, { recursive: true, mode: 0o700 });
  const stats = await lstat(absolutePath);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new UnsafeStatePathError(
      `State output directory must be a real directory: ${absolutePath}`,
    );
  }
  if (options.ownerOnly) await chmod(absolutePath, 0o700);
  return absolutePath;
}

/** Rejects a pre-existing target unless it is a regular, non-symlink file. */
export async function assertSafeMutableFileTarget(path: string): Promise<void> {
  const absolutePath = resolve(path);
  try {
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new UnsafeStatePathError(
        `State output target must be a regular file: ${absolutePath}`,
      );
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function secureExistingOwnerOnlyFile(path: string): Promise<void> {
  const absolutePath = resolve(path);
  await assertSafeMutableFileTarget(absolutePath);
  const handle = await open(
    absolutePath,
    fsConstants.O_RDWR | fsConstants.O_NOFOLLOW,
  );
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new UnsafeStatePathError(
        `Private state target must be a regular file: ${absolutePath}`,
      );
    }
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

/**
 * Safely creates or validates a SQLite database before a library opens it by
 * path. Known sidecars are also rejected when they are symlinks or non-files.
 * The CLI's 0077 umask protects sidecars SQLite creates after this preflight.
 */
export async function preparePrivateSqliteFile(path: string): Promise<string> {
  const absolutePath = resolve(path);
  await prepareStateDirectory(dirname(absolutePath), { ownerOnly: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      absolutePath,
      fsConstants.O_RDWR |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600,
    );
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    await secureExistingOwnerOnlyFile(absolutePath);
  }

  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const sidecarPath = `${absolutePath}${suffix}`;
    try {
      await secureExistingOwnerOnlyFile(sidecarPath);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return absolutePath;
}

/**
 * Atomically replaces one mutable projection with owner-only bytes. The
 * temporary file is created with O_EXCL and O_NOFOLLOW in the destination
 * directory, synced before rename, and removed on failure. A rename replaces
 * the directory entry rather than following a target that appears after the
 * safety check.
 */
export async function writeOwnerOnlyFileAtomic(
  path: string,
  content: string | Uint8Array,
): Promise<string> {
  const absolutePath = resolve(path);
  const directory = await prepareStateDirectory(dirname(absolutePath));
  await assertSafeMutableFileTarget(absolutePath);

  const temporaryPath = join(
    directory,
    `.${basename(absolutePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(content);
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = undefined;

    // Recheck immediately before the atomic replacement. rename(2) replaces a
    // symlink directory entry without following its target if one races here.
    await assertSafeMutableFileTarget(absolutePath);
    await rename(temporaryPath, absolutePath);
    return absolutePath;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch((unlinkError: unknown) => {
      if (!isMissing(unlinkError)) throw unlinkError;
    });
    throw error;
  }
}
