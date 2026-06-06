/**
 * Self-restart (PRD §4.5). A "restart" is just a graceful shutdown — pm2's
 * autorestart brings the process back. Restarts are always *deferred*: a request
 * is written to data/restart.json and a watcher performs the shutdown only when
 * the app is idle (no rhythm run, no in-flight wakes), so a restart never kills a
 * wake or its claude child mid-run. The inbox lives on disk, so events survive.
 */

import { readFile, unlink, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { LAST_EXIT_PATH, RESTART_REQUEST_PATH, RESTART_WATCH_MS } from "../config.js";
import { isRhythmBusy } from "../rhythms/lock.js";
import { inFlightWakes } from "../wake/inflight.js";

export interface RestartRequest {
  /** Epoch ms; the watcher fires once now >= at. */
  at: number;
  reason: string;
}

/** Record an intentional, clean exit so the next boot does NOT count it as a crash. */
function markCleanExit(): void {
  try {
    // Synchronous: this runs on the way to process.exit, after which the loop is gone.
    writeFileSync(LAST_EXIT_PATH, JSON.stringify({ clean: true, pid: process.pid, at: Date.now() }) + "\n");
  } catch {
    /* best-effort — a missed flag just means one phantom crash on next boot */
  }
}

/**
 * Stop accepting work and exit cleanly. pm2 restarts us. Shared by SIGTERM/SIGINT
 * and the restart watcher so there is exactly one shutdown path.
 */
let shuttingDown = false;
export function gracefulShutdown(reason: string, server: Server, stops: Array<() => void>): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[main] ${reason} — shutting down gracefully`);
  for (const stop of stops) {
    try {
      stop();
    } catch (err) {
      console.error("[main] stop hook failed:", (err as Error).message);
    }
  }
  markCleanExit();
  server.close(() => {
    console.log("[main] server closed; exiting");
    process.exit(0);
  });
  // Hard stop if connections linger (in-flight wakes still complete via their own promises).
  setTimeout(() => process.exit(0), 15_000).unref();
}

/** Queue a restart. `at` defaults to now ("restart at the next idle moment"). */
export async function requestRestart(req: { at?: number; reason: string }): Promise<void> {
  const payload: RestartRequest = { at: req.at ?? Date.now(), reason: req.reason };
  await writeFile(RESTART_REQUEST_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function readRestartRequest(): Promise<RestartRequest | null> {
  try {
    return JSON.parse(await readFile(RESTART_REQUEST_PATH, "utf8")) as RestartRequest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null; // a malformed request shouldn't wedge the watcher
  }
}

async function clearRestartRequest(): Promise<void> {
  await unlink(RESTART_REQUEST_PATH).catch(() => {});
}

/**
 * Poll for a due restart request and fire it once the app is idle. Returns a stop
 * function. `trigger(reason)` should call gracefulShutdown.
 */
export function startRestartWatcher(trigger: (reason: string) => void): () => void {
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    const req = await readRestartRequest();
    if (!req) return;
    if (Date.now() < req.at) return; // scheduled for later
    if ((await isRhythmBusy()) || inFlightWakes() > 0) {
      console.log("[restart] due but app is busy — deferring to next tick");
      return;
    }
    await clearRestartRequest();
    trigger(`restart (${req.reason})`);
  }, RESTART_WATCH_MS);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
