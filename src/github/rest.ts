/**
 * GitHub "linked development activity" reader for a ClickUp task.
 *
 * ClickUp's GitHub integration surfaces commits/PRs in a task's activity feed
 * when they reference the task id (e.g. a `Ref #86exw6kme` commit trailer or a
 * `CU-86exw6kme` branch). The ClickUp task object exposes NONE of that, so we go
 * to the source: search the org on GitHub for the bare task id, which catches
 * both the `#<id>` and `CU-<id>` conventions.
 *
 * Auth is the box's already-authenticated `gh` CLI (the same login the app uses
 * for self-improvement PRs) — no GitHub token lives in this app's config. Every
 * call is read-only and degrades to an empty list on error: linked activity is a
 * nice-to-have context block, never something that should fail a run.
 */

import { execFile } from "node:child_process";
import { GITHUB_ORG } from "../config.js";

export interface LinkedCommit {
  repo: string;
  sha: string;
  /** First line of the commit message. */
  message: string;
  author: string;
  /** ISO date string. */
  date: string;
  url: string;
}

export interface LinkedPR {
  repo: string;
  number: number;
  title: string;
  /** "open" | "closed". */
  state: string;
  merged: boolean;
  /** ISO date string (created). */
  date: string;
  url: string;
}

export interface GitHubActivity {
  commits: LinkedCommit[];
  prs: LinkedPR[];
}

/** Run `gh` and parse its `--json` stdout. Resolves to [] on any failure. */
function ghJson<T>(args: string[]): Promise<T[]> {
  return new Promise((resolvePromise) => {
    execFile("gh", args, { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        console.error(`[github] gh ${args.slice(0, 2).join(" ")} failed:`, err.message);
        resolvePromise([]);
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout || "[]") as T[]);
      } catch (e) {
        console.error("[github] could not parse gh json:", (e as Error).message);
        resolvePromise([]);
      }
    });
  });
}

interface RawCommit {
  repository?: { name?: string; fullName?: string };
  sha?: string;
  commit?: { message?: string; author?: { date?: string } };
  author?: { login?: string; is_bot?: boolean };
  url?: string;
}

interface RawPR {
  repository?: { name?: string; fullName?: string };
  number?: number;
  title?: string;
  state?: string; // gh returns lowercase: "open" | "closed" | "merged"
  isPullRequest?: boolean;
  createdAt?: string;
  url?: string;
}

/**
 * Release-automation commits (semantic-release-bot) echo every task id in their
 * generated changelog, so they match the search but aren't development activity.
 * Drop them so the digest shows real commits, not the release cascade.
 */
function isReleaseNoise(c: RawCommit): boolean {
  if (c.author?.is_bot) return true;
  const msg = c.commit?.message ?? "";
  return /^chore\(release\)/i.test(msg) || /\[skip ci\]/i.test(msg);
}

/**
 * Commits and PRs across `GITHUB_ORG` that reference `taskId`. Searches the bare
 * id as a quoted phrase so partial-token noise is avoided. `limit` caps each
 * list (GitHub search is rate-limited to ~30 req/min on an authed account).
 */
export async function getTaskGitHubActivity(
  taskId: string,
  opts: { limit?: number } = {},
): Promise<GitHubActivity> {
  const limit = opts.limit ?? 10;
  const q = `"${taskId}"`;

  // Over-fetch commits a little, since release-noise gets filtered out below.
  const [rawCommits, rawPrs] = await Promise.all([
    ghJson<RawCommit>([
      "search",
      "commits",
      q,
      "--owner",
      GITHUB_ORG,
      "--limit",
      String(limit * 2),
      "--json",
      "repository,sha,commit,author,url",
    ]),
    ghJson<RawPR>([
      "search",
      "prs",
      q,
      "--owner",
      GITHUB_ORG,
      "--limit",
      String(limit),
      "--json",
      "repository,number,title,state,createdAt,url",
    ]),
  ]);

  const repoName = (r?: { name?: string; fullName?: string }): string =>
    r?.fullName ?? r?.name ?? "";

  const commits: LinkedCommit[] = rawCommits
    .filter((c) => !isReleaseNoise(c))
    .slice(0, limit)
    .map((c) => ({
      repo: repoName(c.repository),
      sha: (c.sha ?? "").slice(0, 8),
      message: (c.commit?.message ?? "").split("\n")[0] ?? "",
      author: c.author?.login ?? "",
      date: c.commit?.author?.date ?? "",
      url: c.url ?? "",
    }));

  const prs: LinkedPR[] = rawPrs.map((p) => ({
    repo: repoName(p.repository),
    number: Number(p.number ?? 0),
    title: p.title ?? "",
    state: (p.state ?? "").toLowerCase(),
    merged: (p.state ?? "").toLowerCase() === "merged",
    date: p.createdAt ?? "",
    url: p.url ?? "",
  }));

  return { commits, prs };
}
