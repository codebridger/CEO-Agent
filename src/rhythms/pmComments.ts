/**
 * PM-check comment plumbing. The PM run has no comment tool (it's disallowed) so
 * the agent can't post plain `comment_text` that renders markdown/mentions as raw
 * text. Instead it ENDS its output with a directive naming the comments it wants
 * posted, and the app posts each through the rich-segment poster (clickup/rest.ts) —
 * the same path interactive @-mention replies use, so formatting + real mention
 * chips work identically across both paths.
 *
 * Directive shape (the agent is told to emit exactly this):
 *   {"comments":[{"taskId":"abc","replyTo":"<commentId|null>","mention":<userId|null>,"text":"<markdown>"}],
 *    "summary":"<one line>"}
 */

import { createTaskComment, replyToComment, type Member } from "../clickup/rest.js";

export interface CommentIntent {
  /** Task to comment on. */
  taskId: string;
  /** Comment id to thread the reply under; omit/null for a new root comment. */
  replyTo?: string;
  /** User id to open the comment with a real @-mention; omit/null for none. */
  mention?: number;
  /** The comment body, in markdown. */
  text: string;
}

export interface PmDirective {
  comments: CommentIntent[];
  /** The agent's one-line summary of the sweep (logged, not posted). */
  summary: string;
}

/** Coerce one parsed object into a CommentIntent, or null if it has no usable body/target. */
function toIntent(o: unknown): CommentIntent | null {
  const c = o as { taskId?: unknown; replyTo?: unknown; mention?: unknown; text?: unknown };
  const taskId = typeof c.taskId === "string" ? c.taskId.trim() : "";
  const text = typeof c.text === "string" ? c.text.trim() : "";
  if (!taskId || !text) return null;
  const replyTo = typeof c.replyTo === "string" && c.replyTo.trim() ? c.replyTo.trim() : undefined;
  const mentionNum = Number(c.mention);
  const mention = Number.isFinite(mentionNum) && mentionNum > 0 ? mentionNum : undefined;
  return { taskId, text, replyTo, mention };
}

/** Strict parse: returns the directive if the string is valid JSON with a comments array. */
function strict(s: string): PmDirective | null {
  try {
    const o = JSON.parse(s) as { comments?: unknown; summary?: unknown };
    if (!Array.isArray(o.comments)) return null;
    const comments = o.comments.map(toIntent).filter((c): c is CommentIntent => c !== null);
    const summary = typeof o.summary === "string" ? o.summary.trim() : "";
    return { comments, summary };
  } catch {
    return null;
  }
}

/** Turn JSON-ish escapes (\n, \t, \", \\, \uXXXX) into real characters. */
function unescapeJsonish(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * Lenient recovery when strict JSON fails — the usual cause is unescaped quotes or
 * stray characters in the markdown `text`. Pulls each comment object's fields by
 * name (text is captured last, non-greedy up to its closing `"}`, so inner quotes
 * survive). The agent is told to put `text` last in each object for exactly this.
 */
function recover(raw: string): CommentIntent[] {
  if (!/"comments"\s*:/.test(raw)) return [];
  const out: CommentIntent[] = [];
  const re =
    /"taskId"\s*:\s*"([^"]+)"[\s\S]*?(?:"replyTo"\s*:\s*(null|"[^"]*")[\s\S]*?)?(?:"mention"\s*:\s*(null|\d+)[\s\S]*?)?"text"\s*:\s*"([\s\S]*?)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const taskId = (m[1] ?? "").trim();
    const replyToRaw = m[2];
    const mentionRaw = m[3];
    const text = unescapeJsonish(m[4] ?? "").trim();
    if (!taskId || !text) continue;
    const replyTo =
      replyToRaw && replyToRaw !== "null" ? replyToRaw.replace(/^"|"$/g, "").trim() || undefined : undefined;
    const mention = mentionRaw && mentionRaw !== "null" ? Number(mentionRaw) : undefined;
    out.push({ taskId, text, replyTo, mention });
  }
  return out;
}

/** Best-effort one-line summary from a malformed directive. */
function recoverSummary(raw: string): string {
  const m = /"summary"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/.exec(raw) ?? /"summary"\s*:\s*"([\s\S]*?)"/.exec(raw);
  return m ? unescapeJsonish(m[1] ?? "").trim() : "";
}

/**
 * Pull the comment directive out of the agent's output, defensively: try the whole
 * string, then a fenced block, then the first {...} span as strict JSON; fall back
 * to lenient field recovery. Never throws — worst case returns no comments and the
 * raw text as the summary.
 */
export function parseCommentDirective(raw: string): PmDirective {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const brace = raw.match(/\{[\s\S]*\}/);
  const parsed =
    strict(raw) || (fence?.[1] ? strict(fence[1].trim()) : null) || (brace?.[0] ? strict(brace[0]) : null);
  if (parsed) return parsed;

  const comments = recover(raw);
  const summary =
    recoverSummary(raw) ||
    raw
      .replace(/```(?:json)?\s*[\s\S]*?```/g, "")
      .replace(/\{[\s\S]*"comments"[\s\S]*\}/g, "")
      .trim();
  return { comments, summary };
}

/**
 * Post every comment in the directive through the rich-segment poster (markdown +
 * real @-mention). Each comment is independent: one failure is recorded and the
 * rest still post. Returns a one-line outcome per comment for the log.
 */
export async function postPmComments(comments: CommentIntent[], members: Member[]): Promise<string[]> {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const outcomes: string[] = [];
  for (const c of comments) {
    const mention =
      c.mention != null ? { id: c.mention, name: nameById.get(c.mention) ?? `user ${c.mention}` } : undefined;
    const opts = { text: c.text, mention, notifyAll: true };
    try {
      if (c.replyTo) {
        const r = await replyToComment(c.replyTo, opts);
        outcomes.push(`reply ${r.id} under ${c.replyTo} (task ${c.taskId})`);
      } else {
        const r = await createTaskComment(c.taskId, opts);
        outcomes.push(`comment ${r.id} on task ${c.taskId}`);
      }
    } catch (err) {
      outcomes.push(`FAILED to comment on task ${c.taskId}: ${(err as Error).message}`);
      console.error(`[pm-check] comment on ${c.taskId} failed:`, (err as Error).message);
    }
  }
  return outcomes;
}
