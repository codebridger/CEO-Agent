/**
 * Self-improvement PR flow (PRD §4.3). The agent proposes new contents for its own
 * instruction files; this opens a PR for Navid to review — it never lands changes
 * directly. All git work happens in a throwaway worktree built off origin/main, so
 * the live checkout (and its history-commit branch) is never disturbed.
 *
 * Guardrails: only prompts/* and CONTRACT.md may be changed (the agent can tune its
 * playbooks and propose contract changes, but cannot rewrite arbitrary code this way).
 * A CONTRACT.md change is flagged in the PR title (PRD §4.3.4).
 */

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import { promisify } from "node:util";
import { AGENT_GIT_EMAIL, AGENT_NAME, GITHUB_REVIEWER, REPO_ROOT, SELFIMPROVE_DIR } from "../config.js";

const exec = promisify(execFile);

export interface ProposeFile {
  path: string;
  content: string;
}

export interface ProposeOpts {
  topic: string;
  summary: string;
  files: ProposeFile[];
}

/** Only the agent's instruction files and the contract may be self-edited. */
function isEditable(p: string): boolean {
  const n = normalize(p).replace(/^(\.\/)+/, "");
  if (isAbsolute(n) || n.startsWith("..")) return false;
  return n === "CONTRACT.md" || n.startsWith("prompts/");
}

function slugify(topic: string): string {
  const s = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return s || "update";
}

/** Open (or update) a self-improvement PR. Returns the PR URL + branch. */
export async function proposeImprovement(opts: ProposeOpts): Promise<{ prUrl: string; branch: string }> {
  if (!opts.files?.length) throw new Error("self-improve: no files to change");
  for (const f of opts.files) {
    if (!isEditable(f.path)) {
      throw new Error(`self-improve: path not allowed: ${f.path} (only prompts/* and CONTRACT.md)`);
    }
    if (typeof f.content !== "string" || !f.content.trim()) {
      throw new Error(`self-improve: empty content for ${f.path}`);
    }
  }

  const isContractChange = opts.files.some((f) => normalize(f.path).replace(/^(\.\/)+/, "") === "CONTRACT.md");
  const slug = slugify(opts.topic);
  const branch = `self-improve/${slug}`;
  const work = resolve(SELFIMPROVE_DIR, slug);
  const git = (args: string[], cwd: string = REPO_ROOT): Promise<unknown> => exec("git", args, { cwd });

  // Clean any leftover worktree/branch for this slug, then build a fresh one off main.
  await rm(work, { recursive: true, force: true }).catch(() => {});
  await git(["worktree", "prune"]).catch(() => {});
  await git(["branch", "-D", branch]).catch(() => {});
  await git(["fetch", "--quiet", "origin", "main"]);
  await mkdir(dirname(work), { recursive: true });
  await git(["worktree", "add", "-b", branch, work, "origin/main"]);

  try {
    for (const f of opts.files) {
      const dest = resolve(work, normalize(f.path));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, f.content.endsWith("\n") ? f.content : f.content + "\n", "utf8");
    }
    await git(["add", "--", ...opts.files.map((f) => normalize(f.path))], work);

    const title = `${isContractChange ? "[contract change] " : ""}self-improve: ${opts.topic}`;
    await git(
      ["-c", `user.name=${AGENT_NAME}`, "-c", `user.email=${AGENT_GIT_EMAIL}`, "commit", "-m", title],
      work,
    );
    await git(["push", "--force-with-lease", "-u", "origin", branch], work);

    const body = [
      opts.summary.trim() || "Self-improvement proposal.",
      "",
      isContractChange
        ? "⚠️ **This is a contract change** — please review carefully; merging it changes the operating contract."
        : "",
      `Proposed by ${AGENT_NAME} (self-improvement). Takes effect after you merge and the app restarts.`,
      "",
      `@${GITHUB_REVIEWER} please review.`,
    ]
      .filter(Boolean)
      .join("\n");

    let prUrl: string;
    try {
      const { stdout } = await exec(
        "gh",
        ["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body", body, "--assignee", GITHUB_REVIEWER],
        { cwd: work },
      );
      prUrl = stdout.trim().split("\n").pop() ?? "";
    } catch {
      // A PR for this branch may already exist (re-proposing the same topic) — reuse it.
      const { stdout } = await exec("gh", ["pr", "view", branch, "--json", "url", "-q", ".url"], { cwd: work });
      prUrl = stdout.trim();
    }
    return { prUrl, branch };
  } finally {
    await git(["worktree", "remove", "--force", work]).catch(() => {});
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
