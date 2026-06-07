/**
 * Commit the agent's own activity history (threads + beat logs) onto the agent's
 * OWN branch — NOT main. main carries only logic + code; the agent's data lives on
 * a branch named after the agent (DATA_BRANCH, e.g. `aso-dara`). Called at the end
 * of each PM check and heartbeat — batched at that cadence rather than per-wake to
 * avoid commit noise and push contention.
 *
 * Mechanism: DATA_BRANCH is checked out as a linked worktree at DATA_BRANCH_WORKTREE
 * (gitignored on main, so the running app's `data/` is never disturbed). On each call
 * we mirror `data/threads` + `data/heartbeats` into that worktree, commit, and push the
 * branch. The live app keeps reading/writing `data/` directly — this only publishes it.
 *
 * Scope is strictly threads + beat logs; secrets (webhooks.json, tls/), the inbox,
 * poller cursors and the council clone never leave `data/` (they're not mirrored).
 * Best-effort: a push failure is logged, not fatal (the commit is still local).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_GIT_EMAIL,
  AGENT_NAME,
  DATA_BRANCH,
  DATA_BRANCH_WORKTREE,
  DATA_DIR,
  REPO_ROOT,
} from "../config.js";

const exec = promisify(execFile);
// Subdirs of data/ that are version-controlled, mirrored into the data-branch worktree.
const HISTORY_SUBDIRS = ["threads", "heartbeats"];

function git(args: string[], cwd: string = REPO_ROOT): Promise<{ stdout: string; stderr: string }> {
  return exec("git", args, { cwd });
}

/**
 * Ensure DATA_BRANCH is checked out as a linked worktree at DATA_BRANCH_WORKTREE.
 * Idempotent: a no-op once the worktree exists. On a fresh clone it recreates the
 * worktree from origin/<DATA_BRANCH> (or, if the branch doesn't exist yet anywhere,
 * creates it as an orphan so the very first run can bootstrap it).
 */
async function ensureWorktree(): Promise<void> {
  if (existsSync(join(DATA_BRANCH_WORKTREE, ".git"))) return;

  await git(["fetch", "origin", DATA_BRANCH]).catch(() => {});

  const branchExistsLocal = await git(["rev-parse", "--verify", `refs/heads/${DATA_BRANCH}`])
    .then(() => true)
    .catch(() => false);
  const branchExistsRemote = await git(["rev-parse", "--verify", `refs/remotes/origin/${DATA_BRANCH}`])
    .then(() => true)
    .catch(() => false);

  if (branchExistsLocal) {
    await git(["worktree", "add", DATA_BRANCH_WORKTREE, DATA_BRANCH]);
  } else if (branchExistsRemote) {
    await git(["worktree", "add", "--track", "-b", DATA_BRANCH, DATA_BRANCH_WORKTREE, `origin/${DATA_BRANCH}`]);
  } else {
    // First-ever bootstrap: data-only branch with no shared history with main.
    await git(["worktree", "add", "--orphan", "-b", DATA_BRANCH, DATA_BRANCH_WORKTREE]);
  }
}

/** Mirror data/<sub> -> worktree/<sub>, dropping anything the live tree no longer has. */
async function mirror(sub: string): Promise<void> {
  const src = join(DATA_DIR, sub);
  const dest = join(DATA_BRANCH_WORKTREE, sub);
  await rm(dest, { recursive: true, force: true });
  if (existsSync(src)) {
    await mkdir(dest, { recursive: true });
    await cp(src, dest, { recursive: true });
  }
}

/**
 * Mirror + commit the agent's history onto the data branch and push it. Returns true
 * when the branch is in sync with origin afterwards (pushed, or already up to date),
 * false on any failure — the daily scheduler uses this to retry an unpushed commit on
 * the next tick rather than stranding it locally.
 */
export async function commitHistory(message: string): Promise<boolean> {
  try {
    await ensureWorktree();

    for (const sub of HISTORY_SUBDIRS) await mirror(sub);

    await git(["add", "-A", "--", ...HISTORY_SUBDIRS], DATA_BRANCH_WORKTREE);
    // `git diff --cached --quiet` exits non-zero iff something is staged.
    const hasStaged = await git(["diff", "--cached", "--quiet"], DATA_BRANCH_WORKTREE)
      .then(() => false)
      .catch(() => true);
    if (hasStaged) {
      await git(
        ["-c", `user.name=${AGENT_NAME}`, "-c", `user.email=${AGENT_GIT_EMAIL}`, "commit", "-m", message],
        DATA_BRANCH_WORKTREE,
      );
      console.log(`[history] committed to ${DATA_BRANCH}: ${message}`);
    }
    // Always push — this also retries a previously-failed push when nothing is newly staged.
    try {
      await git(["push", "-u", "origin", DATA_BRANCH], DATA_BRANCH_WORKTREE);
      return true;
    } catch (err) {
      console.error("[history] push failed (committed locally):", (err as Error).message);
      return false;
    }
  } catch (err) {
    console.error("[history] commit failed:", (err as Error).message);
    return false;
  }
}
