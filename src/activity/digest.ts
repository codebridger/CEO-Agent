/**
 * "Task activity tail" digest — the unified context block the agent reads before
 * acting on a task. It stitches together the two activity surfaces the agent
 * otherwise can't reliably see:
 *
 *   1. The full comment history (paginated) WITH threaded replies expanded —
 *      ClickUp's API returns only the newest page by default and never the
 *      replies, so a plain read misses the tail and every in-thread answer.
 *   2. Linked GitHub commits/PRs — the development activity ClickUp shows in the
 *      task feed but exposes through no API; fetched straight from GitHub.
 *
 * The native field/status-change audit log stays out of reach (no public
 * endpoint; time-in-status is plan-gated; audit logs are Enterprise-only), so
 * this is the fullest tail an API token can reconstruct. The app assembles it
 * deterministically and injects it into the run, rather than hoping the agent
 * fetches it — that gap is the whole reason the tail was being missed.
 */

import { AGENT_NAME, IDENTITY } from "../config.js";
import { extractAttachments, getTaskActivityTail, type CommentThread } from "../clickup/rest.js";
import { getTaskGitHubActivity, type GitHubActivity } from "../github/rest.js";

const MAX_TEXT = 500; // per comment/reply, to keep the block bounded

function label(userId: number | undefined): string {
  if (userId === IDENTITY.agentUserId) return AGENT_NAME;
  if (userId === IDENTITY.navidUserId) return "Navid Shad (founder)";
  if (userId === IDENTITY.somiUserId) return "Somayeh Roohani";
  return userId != null ? `teammate ${userId}` : "someone";
}

function when(date: number | string | undefined): string {
  if (date == null || date === "") return "";
  const ms = typeof date === "number" ? date : Date.parse(date);
  if (!Number.isFinite(ms)) return typeof date === "string" ? date : "";
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function clip(s: string): string {
  const t = s.trim().replace(/\s+\n/g, "\n");
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t;
}

/** Render a comment/reply's attachments as indented lines (skipped when there are none). */
function renderAttachments(segments: Array<Record<string, unknown>>, indent: string): string[] {
  return extractAttachments(segments).map((a) => {
    const what = a.kind === "file" ? "attachment" : "link";
    const meta = a.mimetype ? ` (${a.mimetype})` : "";
    return `${indent}📎 ${what}: ${a.title}${meta}${a.url ? ` — ${a.url}` : ""}`;
  });
}

function renderComments(threads: CommentThread[]): string {
  if (threads.length === 0) return "_No comments on this task._";
  const lines: string[] = [];
  for (const c of threads) {
    const ts = when(c.date);
    lines.push(`- ${ts ? `[${ts}] ` : ""}${label(c.userId)}: ${clip(c.text)}`);
    lines.push(...renderAttachments(c.segments, "    "));
    for (const r of c.replies) {
      const rts = when(r.date);
      lines.push(`    ↳ ${rts ? `[${rts}] ` : ""}${label(r.userId)}: ${clip(r.text)}`);
      lines.push(...renderAttachments(r.segments, "        "));
    }
  }
  return lines.join("\n");
}

function renderGitHub(gh: GitHubActivity): string {
  if (gh.prs.length === 0 && gh.commits.length === 0) {
    return "_No linked commits or PRs found on GitHub._";
  }
  const lines: string[] = [];
  for (const p of gh.prs) {
    const state = p.merged ? "merged" : p.state || "open";
    lines.push(`- PR #${p.number} (${state}) — ${p.repo}: ${p.title} — ${p.url}`);
  }
  for (const c of gh.commits) {
    const ts = when(c.date);
    lines.push(
      `- commit ${c.sha} — ${c.repo}: ${c.message}${c.author ? ` (by ${c.author})` : ""}${ts ? ` [${ts}]` : ""}`,
    );
  }
  return lines.join("\n");
}

export interface TaskActivityDigest {
  comments: CommentThread[];
  github: GitHubActivity;
  /** Rendered markdown block ready to drop into a prompt. */
  markdown: string;
}

/**
 * Build the activity digest for one task. Both sources are best-effort: a failure
 * in either degrades to an empty section, never throws into the run.
 */
export async function buildTaskActivityDigest(
  taskId: string,
  opts: { maxComments?: number; githubLimit?: number } = {},
): Promise<TaskActivityDigest> {
  const [comments, github] = await Promise.all([
    getTaskActivityTail(taskId, { maxComments: opts.maxComments ?? 100 }).catch((err) => {
      console.error(`[digest] comments for ${taskId} failed:`, (err as Error).message);
      return [] as CommentThread[];
    }),
    getTaskGitHubActivity(taskId, { limit: opts.githubLimit ?? 10 }).catch((err) => {
      console.error(`[digest] github for ${taskId} failed:`, (err as Error).message);
      return { commits: [], prs: [] } as GitHubActivity;
    }),
  ]);

  const markdown = [
    `### Activity tail — task ${taskId}`,
    "",
    "**Comments (oldest first, ↳ = threaded reply):**",
    renderComments(comments),
    "",
    "**Linked GitHub activity (commits/PRs referencing this task):**",
    renderGitHub(github),
  ].join("\n");

  return { comments, github, markdown };
}
