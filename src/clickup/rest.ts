/**
 * Thin ClickUp REST client (the agent's personal token). This is the plumbing the
 * claude.ai connector can't do: webhook register/list/delete (no MCP tool
 * exists) and the cheap chat/comment reads the poller and dispatcher need.
 *
 * Acting on the business (posting comments, sending chat replies) stays in the
 * agent runs via the claude.ai connector — this file never writes business data.
 */

import { CLICKUP_API_TOKEN, WORKSPACE_ID } from "../config.js";
import { markdownToSegments } from "./markdown.js";

const V2 = "https://api.clickup.com/api/v2";
const V3 = "https://api.clickup.com/api/v3";

function token(): string {
  if (!CLICKUP_API_TOKEN) {
    throw new Error(
      "CLICKUP_API_TOKEN is not set. Add the agent's ClickUp personal token (pk_…) to .env — " +
        "it's required for webhook registration and the chat poller.",
    );
  }
  return CLICKUP_API_TOKEN;
}

/** Transient HTTP statuses worth retrying: rate-limit + server-side 5xx. */
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter; honor a numeric Retry-After (seconds) if given. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 10_000);
  }
  return 300 * 2 ** attempt + Math.floor(Math.random() * 200);
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  // Only idempotent GETs are retried — never replay a POST/PUT/DELETE, or we'd
  // risk double-posting a comment or chat message.
  const canRetry = method === "GET";
  let lastErr: Error | undefined;

  for (let attempt = 0; attempt < (canRetry ? MAX_ATTEMPTS : 1); attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: token(),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      // Network-level failure (DNS, reset, timeout) — transient for a GET.
      lastErr = new Error(`ClickUp ${method} ${url} → network error: ${(err as Error).message}`);
      if (canRetry && attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw lastErr;
    }

    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : {}) as T;

    lastErr = new Error(`ClickUp ${method} ${url} → ${res.status}: ${text.slice(0, 400)}`);
    if (canRetry && TRANSIENT_STATUS.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
      await sleep(backoffMs(attempt, res.headers.get("retry-after")));
      continue;
    }
    throw lastErr;
  }

  throw lastErr ?? new Error(`ClickUp ${method} ${url} → exhausted retries`);
}

// --- webhooks (no MCP equivalent) ----------------------------------------

export interface WebhookRecord {
  id: string;
  secret: string;
  endpoint: string;
  events: string[];
}

/** POST a webhook subscription scoped to a list. Returns id + signing secret. */
export async function createWebhook(opts: {
  endpoint: string;
  events: readonly string[];
  listId?: string;
}): Promise<WebhookRecord> {
  const payload: Record<string, unknown> = {
    endpoint: opts.endpoint,
    events: [...opts.events],
  };
  if (opts.listId) payload["list_id"] = Number(opts.listId);

  // ClickUp returns { id, webhook: { id, secret, endpoint, events, ... } }.
  const out = await req<{ id?: string; webhook?: Record<string, unknown> }>(
    "POST",
    `${V2}/team/${WORKSPACE_ID}/webhook`,
    payload,
  );
  const w = out.webhook ?? {};
  const id = String(w["id"] ?? out.id ?? "");
  const secret = String(w["secret"] ?? "");
  if (!id || !secret) {
    throw new Error(`ClickUp create webhook returned no id/secret: ${JSON.stringify(out).slice(0, 300)}`);
  }
  return {
    id,
    secret,
    endpoint: String(w["endpoint"] ?? opts.endpoint),
    events: (w["events"] as string[]) ?? [...opts.events],
  };
}

export async function listWebhooks(): Promise<
  Array<{ id: string; endpoint: string; events: string[]; health?: unknown }>
> {
  const out = await req<{ webhooks?: Array<Record<string, unknown>> }>(
    "GET",
    `${V2}/team/${WORKSPACE_ID}/webhook`,
  );
  return (out.webhooks ?? []).map((w) => ({
    id: String(w["id"]),
    endpoint: String(w["endpoint"] ?? ""),
    events: (w["events"] as string[]) ?? [],
    health: w["health"],
  }));
}

export async function deleteWebhook(id: string): Promise<void> {
  await req("DELETE", `${V2}/webhook/${id}`);
}

// --- reads used by the dispatcher / poller -------------------------------

export interface TaskComment {
  id: string;
  /** Plain text of the comment. */
  text: string;
  /** Author user id. */
  userId: number | undefined;
  /** Raw `comment` segment array, for mention detection. */
  segments: Array<Record<string, unknown>>;
  date: number | undefined;
}

/** GET the id of the list a task belongs to (used to bind a task to a workflow). */
export async function getTaskListId(taskId: string): Promise<string | undefined> {
  const t = await req<{ list?: { id?: string | number } }>("GET", `${V2}/task/${taskId}`);
  return t.list?.id !== undefined ? String(t.list.id) : undefined;
}

/** GET a task's comments (newest first), normalized for mention detection. */
export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const out = await req<{ comments?: Array<Record<string, unknown>> }>(
    "GET",
    `${V2}/task/${taskId}/comment`,
  );
  return (out.comments ?? []).map((c) => {
    const user = c["user"] as Record<string, unknown> | undefined;
    return {
      id: String(c["id"]),
      text: String(c["comment_text"] ?? ""),
      userId: user ? Number(user["id"]) : undefined,
      segments: (c["comment"] as Array<Record<string, unknown>>) ?? [],
      date: c["date"] ? Number(c["date"]) : undefined,
    };
  });
}

/** One threaded reply under a comment, normalized like a top-level comment. */
export interface CommentReply {
  id: string;
  text: string;
  userId: number | undefined;
  /** Raw `comment` segment array, for mention detection (a reply can @-mention too). */
  segments: Array<Record<string, unknown>>;
  date: number | undefined;
}

/** GET the threaded replies under a single comment (used to expand reply_count > 0). */
export async function getCommentReplies(commentId: string): Promise<CommentReply[]> {
  const out = await req<{ comments?: Array<Record<string, unknown>> }>(
    "GET",
    `${V2}/comment/${commentId}/reply`,
  );
  return (out.comments ?? []).map((c) => {
    const user = c["user"] as Record<string, unknown> | undefined;
    return {
      id: String(c["id"]),
      text: String(c["comment_text"] ?? ""),
      userId: user ? Number(user["id"]) : undefined,
      segments: (c["comment"] as Array<Record<string, unknown>>) ?? [],
      date: c["date"] ? Number(c["date"]) : undefined,
    };
  });
}

/** A comment plus its expanded threaded replies — one node of the activity tail. */
export interface CommentThread extends TaskComment {
  reply_count: number;
  replies: CommentReply[];
}

/** A file/link attached to a comment (lives in the `comment` segments, not `comment_text`). */
export interface CommentAttachment {
  /** "file" = an uploaded attachment; "link" = an embedded bookmark (e.g. a Drive link). */
  kind: "file" | "link";
  /** Display name (file title or the link's service). */
  title: string;
  /** Fetchable URL (ClickUp attachment URLs are public; bookmarks point at the source). */
  url?: string;
  mimetype?: string;
}

/**
 * Pull attachments out of a comment's `comment` segment array. ClickUp puts files in a
 * `type:"attachment"` segment (with an `attachment` object) and embedded links in a
 * `type:"bookmark"` segment — neither appears in `comment_text`, so a plain text read
 * misses them entirely (an attachment-only comment has empty text).
 */
export function extractAttachments(segments: Array<Record<string, unknown>>): CommentAttachment[] {
  const out: CommentAttachment[] = [];
  for (const s of segments ?? []) {
    if (s["type"] === "attachment" && s["attachment"]) {
      const a = s["attachment"] as Record<string, unknown>;
      out.push({
        kind: "file",
        title: String(a["title"] ?? s["text"] ?? "file"),
        url: a["url"] ? String(a["url"]) : undefined,
        mimetype: a["mimetype"] ? String(a["mimetype"]) : undefined,
      });
    } else if (s["type"] === "bookmark" && s["bookmark"]) {
      const b = s["bookmark"] as Record<string, unknown>;
      const url = b["url"] ?? b["id"];
      out.push({
        kind: "link",
        title: b["service"] ? String(b["service"]) : "link",
        url: url ? String(url) : undefined,
      });
    }
  }
  return out;
}

/**
 * The fullest comment history the public API allows: pages `GET /task/{id}/comment`
 * back through `start`/`start_id` (the endpoint returns ~25 newest-first per page)
 * and expands every comment that has threaded replies. This is the accessible
 * "activity tail" — ClickUp exposes no field/status-change history endpoint
 * (404), time-in-status is plan-gated, and audit logs are Enterprise-only, so
 * comments + replies are all an API token can reconstruct.
 *
 * Returns OLDEST-first (chronological) for prompt readability. Best-effort on
 * replies: a failed reply fetch leaves that node's `replies` empty rather than
 * throwing the whole tail away.
 */
export async function getTaskActivityTail(
  taskId: string,
  opts: { maxComments?: number } = {},
): Promise<CommentThread[]> {
  const max = opts.maxComments ?? 100;
  const collected: Array<Record<string, unknown>> = [];
  let start: number | undefined;
  let startId: string | undefined;

  // Page newest-first until we hit `max` or a short/empty page (end of history).
  for (let guard = 0; guard < 20 && collected.length < max; guard++) {
    const qs = new URLSearchParams();
    if (start !== undefined) qs.set("start", String(start));
    if (startId !== undefined) qs.set("start_id", startId);
    const url = `${V2}/task/${taskId}/comment${qs.toString() ? `?${qs}` : ""}`;
    const page = await req<{ comments?: Array<Record<string, unknown>> }>("GET", url);
    const batch = page.comments ?? [];
    if (batch.length === 0) break;
    collected.push(...batch);
    const last = batch[batch.length - 1];
    const lastDate = last?.["date"] ? Number(last["date"]) : undefined;
    const lastId = last?.["id"] ? String(last["id"]) : undefined;
    // No forward progress (same cursor) → stop, else we'd loop on the tail page.
    if (lastDate === start && lastId === startId) break;
    if (batch.length < 25) break; // last page
    start = lastDate;
    startId = lastId;
  }

  const trimmed = collected.slice(0, max);
  const threads: CommentThread[] = await Promise.all(
    trimmed.map(async (c) => {
      const user = c["user"] as Record<string, unknown> | undefined;
      const replyCount = c["reply_count"] ? Number(c["reply_count"]) : 0;
      const base: CommentThread = {
        id: String(c["id"]),
        text: String(c["comment_text"] ?? ""),
        userId: user ? Number(user["id"]) : undefined,
        segments: (c["comment"] as Array<Record<string, unknown>>) ?? [],
        date: c["date"] ? Number(c["date"]) : undefined,
        reply_count: replyCount,
        replies: [],
      };
      if (replyCount > 0) {
        try {
          base.replies = await getCommentReplies(base.id);
        } catch (err) {
          console.error(`[clickup] replies for comment ${base.id} failed:`, (err as Error).message);
        }
      }
      return base;
    }),
  );

  // Oldest-first for the prompt.
  return threads.sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
}

export interface PostCommentOpts {
  text: string;
  /** Assign the comment to this user id so they get a notification. */
  assignee?: number;
  /** Also notify the task's assignees. */
  notifyAll?: boolean;
  /**
   * Open the comment with a real `@Name` mention of this person (the way a human
   * would address them) instead of assigning them the comment. Sends the rich
   * `comment` segment array; the leading `tag` segment is what ClickUp renders as
   * the mention chip.
   */
  mention?: { id: number; name: string };
}

/**
 * Rich body: the agent's text rendered as ClickUp segments so markdown actually
 * formats (ClickUp ignores markdown in `comment_text`). A mention, if any, leads.
 */
function richBody(o: PostCommentOpts): Record<string, unknown> {
  const body = markdownToSegments(o.text);
  const comment: unknown[] = o.mention
    ? [{ type: "tag", user: { id: o.mention.id }, text: `@${o.mention.name}` }, { text: " " }, ...body]
    : body;
  return { comment, notify_all: o.notifyAll ?? true };
}

/** Plain fallback body — used only if ClickUp rejects the rich segment form. */
function plainBody(o: PostCommentOpts): Record<string, unknown> {
  return {
    comment_text: o.text,
    notify_all: o.notifyAll ?? true,
    ...(o.assignee ? { assignee: o.assignee } : {}),
  };
}

/** POST a comment as rich markdown segments; fall back to plain text if the rich form is rejected. */
async function postComment(path: string, o: PostCommentOpts): Promise<{ id: string }> {
  try {
    const out = await req<{ id?: string | number }>("POST", path, richBody(o));
    return { id: String(out.id ?? "") };
  } catch (err) {
    console.error(`[clickup] rich comment rejected (${(err as Error).message}); retrying as plain text`);
    const out = await req<{ id?: string | number }>("POST", path, plainBody(o));
    return { id: String(out.id ?? "") };
  }
}

/** Post a threaded reply UNDER an existing comment (keeps the conversation in-thread). */
export async function replyToComment(commentId: string, o: PostCommentOpts): Promise<{ id: string }> {
  return postComment(`${V2}/comment/${commentId}/reply`, o);
}

/** Post a new ROOT-level comment on a task (used only when asked to talk at top level). */
export async function createTaskComment(taskId: string, o: PostCommentOpts): Promise<{ id: string }> {
  return postComment(`${V2}/task/${taskId}/comment`, o);
}

export interface ChatChannel {
  id: string;
  type: string; // "DM", "CHANNEL", ...
}

export async function getChatChannels(limit = 100): Promise<ChatChannel[]> {
  const out = await req<{ data?: Array<Record<string, unknown>> }>(
    "GET",
    `${V3}/workspaces/${WORKSPACE_ID}/chat/channels?limit=${limit}`,
  );
  return (out.data ?? []).map((c) => ({ id: String(c["id"]), type: String(c["type"] ?? "") }));
}

export interface ChatMessage {
  id: string;
  content: string;
  date: number;
  userId: string;
}

/** GET recent messages in a channel (newest first per ClickUp). */
export async function getChatMessages(channelId: string, limit = 25): Promise<ChatMessage[]> {
  const out = await req<{ data?: Array<Record<string, unknown>> }>(
    "GET",
    `${V3}/workspaces/${WORKSPACE_ID}/chat/channels/${channelId}/messages?limit=${limit}`,
  );
  return (out.data ?? []).map((m) => ({
    id: String(m["id"]),
    content: String(m["content"] ?? ""),
    date: Number(m["date"] ?? 0),
    userId: String(m["user_id"] ?? ""),
  }));
}

/**
 * Send a chat message as the agent (the token's account). The app sends ALL chat
 * messages this way — command acks, rhythm "done" notices, and the agent's own
 * replies — so every send is verified (returns a real message id) instead of
 * trusted from the model's self-report.
 */
export async function sendChatMessage(channelId: string, content: string): Promise<{ id: string }> {
  const out = await req<{ data?: { id?: string | number }; id?: string | number }>(
    "POST",
    `${V3}/workspaces/${WORKSPACE_ID}/chat/channels/${channelId}/messages`,
    { type: "message", content_format: "text/md", content },
  );
  const id = String(out.data?.id ?? out.id ?? "");
  if (!id) throw new Error(`ClickUp send to channel ${channelId} returned no message id`);
  return { id };
}

export interface Member {
  id: number;
  /** Display name (falls back to email, then id). */
  name: string;
  email?: string;
}

/**
 * Every member of the workspace — the team directory the agent uses to resolve a
 * name ("Somi") to a user id before sending them a direct message. Sourced from
 * the V2 team endpoint (the connector's member tool has no REST equivalent here).
 */
export async function getWorkspaceMembers(): Promise<Member[]> {
  const out = await req<{ teams?: Array<{ id?: string | number; members?: Array<{ user?: Record<string, unknown> }> }> }>(
    "GET",
    `${V2}/team`,
  );
  const teams = out.teams ?? [];
  const team = teams.find((t) => String(t.id) === WORKSPACE_ID) ?? teams[0];
  return (team?.members ?? [])
    .map((m) => m.user)
    .filter((u): u is Record<string, unknown> => !!u && u["id"] != null)
    .map((u) => ({
      id: Number(u["id"]),
      name: String(u["username"] ?? u["email"] ?? u["id"]),
      email: u["email"] ? String(u["email"]) : undefined,
    }));
}

/**
 * Resolve (or create) the direct-message channel between the agent and `userIds`.
 * ClickUp returns the existing DM if one already exists, so this is idempotent —
 * it's how the agent can message anyone, even with no prior thread.
 */
export async function getOrCreateDirectMessage(userIds: number[]): Promise<{ id: string }> {
  const out = await req<{ data?: { id?: string | number }; id?: string | number }>(
    "POST",
    `${V3}/workspaces/${WORKSPACE_ID}/chat/channels/direct_message`,
    { user_ids: userIds },
  );
  const id = String(out.data?.id ?? out.id ?? "");
  if (!id) {
    throw new Error(`ClickUp direct_message returned no channel id: ${JSON.stringify(out).slice(0, 200)}`);
  }
  return { id };
}
