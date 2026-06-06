/**
 * Council repo (subturtle-docs) — READ-ONLY context for the heartbeat. We clone
 * it fresh (or fast-forward to origin/main) into a git-ignored dir so the agent
 * can read the playbook, metrics framework, and decisions. The app never writes
 * or pushes here — beat logs live with the agent (data/heartbeats), not here.
 */

import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { COUNCIL_DIR, COUNCIL_REPO } from "../config.js";

const exec = promisify(execFile);

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Ensure COUNCIL_DIR holds a fresh checkout of COUNCIL_REPO@main. Returns the dir. */
export async function cloneOrUpdate(): Promise<string> {
  if (await exists(`${COUNCIL_DIR}/.git`)) {
    // Existing clone — discard any drift and fast-forward to origin/main.
    await exec("git", ["-C", COUNCIL_DIR, "fetch", "--quiet", "origin", "main"]);
    await exec("git", ["-C", COUNCIL_DIR, "reset", "--hard", "--quiet", "origin/main"]);
  } else {
    await mkdir(dirname(COUNCIL_DIR), { recursive: true });
    // gh clone uses the authenticated token (private repo) and sets up the remote.
    await exec("gh", ["repo", "clone", COUNCIL_REPO, COUNCIL_DIR, "--", "--depth", "1"]);
  }
  return COUNCIL_DIR;
}
