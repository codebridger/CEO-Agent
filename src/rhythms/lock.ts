/**
 * Cross-process lock so two rhythm runs never overlap — the scheduler and the
 * chat-command path share one process, but a manual `npm run trigger` is a
 * separate process, so an in-memory mutex isn't enough. A lockfile under data/
 * covers all three. Stale locks (a crashed run) are reclaimed after STALE_MS.
 */

import { open, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR } from "../config.js";

const LOCK = resolve(DATA_DIR, "rhythm.lock");
// Must exceed the longest run that can hold the lock — a `long` scheduled chunk/workflow
// runs up to LONG_JOB_TIMEOUT_MS (20 min), so give margin or a live run looks "stale".
const STALE_MS = 25 * 60 * 1000;

async function acquire(name: string): Promise<boolean> {
  try {
    const fh = await open(LOCK, "wx"); // O_EXCL: fails if it exists
    await fh.writeFile(`${name} ${new Date().toISOString()} pid ${process.pid}`);
    await fh.close();
    return true;
  } catch {
    try {
      const s = await stat(LOCK);
      if (Date.now() - s.mtimeMs < STALE_MS) return false; // a live run holds it
      await unlink(LOCK).catch(() => {}); // stale — reclaim
      const fh = await open(LOCK, "wx").catch(() => null);
      if (!fh) return false;
      await fh.writeFile(`${name} ${new Date().toISOString()} pid ${process.pid}`);
      await fh.close();
      return true;
    } catch {
      return false;
    }
  }
}

/** True if a rhythm run currently holds the lock (a fresh, non-stale lockfile exists). */
export async function isRhythmBusy(): Promise<boolean> {
  try {
    const s = await stat(LOCK);
    return Date.now() - s.mtimeMs < STALE_MS;
  } catch {
    return false; // no lockfile → idle
  }
}

/** Run `fn` while holding the rhythm lock; skip (return undefined) if it's busy. */
export async function runExclusive<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (!(await acquire(name))) {
    console.log(`[rhythm] ${name} skipped — another rhythm is running`);
    return undefined;
  }
  try {
    return await fn();
  } finally {
    await unlink(LOCK).catch(() => {});
  }
}
