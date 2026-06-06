/**
 * Commit the agent's own activity history (threads + beat logs) into this repo
 * and push. Called at the end of each PM check and heartbeat — batched at that
 * cadence rather than per-wake to avoid commit noise and push contention.
 *
 * Scope is strictly `data/threads` + `data/heartbeats`; secrets (webhooks.json,
 * tls/) are .gitignored and can never be staged. Best-effort: a push failure is
 * logged, not fatal (the commit is still local).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AGENT_GIT_EMAIL, AGENT_NAME, REPO_ROOT } from "../config.js";

const exec = promisify(execFile);
const HISTORY_PATHS = ["data/threads", "data/heartbeats"];

function git(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec("git", args, { cwd: REPO_ROOT });
}

export async function commitHistory(message: string): Promise<void> {
  try {
    await git(["add", "--", ...HISTORY_PATHS]);
    // `git diff --cached --quiet` exits non-zero iff something is staged.
    const hasStaged = await git(["diff", "--cached", "--quiet", "--", ...HISTORY_PATHS])
      .then(() => false)
      .catch(() => true);
    if (!hasStaged) return;

    await git([
      "-c",
      `user.name=${AGENT_NAME}`,
      "-c",
      `user.email=${AGENT_GIT_EMAIL}`,
      "commit",
      "-m",
      message,
    ]);
    await git(["push"]).catch((err) =>
      console.error("[history] push failed (committed locally):", (err as Error).message),
    );
    console.log(`[history] committed: ${message}`);
  } catch (err) {
    console.error("[history] commit failed:", (err as Error).message);
  }
}
