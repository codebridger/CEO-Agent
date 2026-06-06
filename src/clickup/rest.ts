/**
 * Thin ClickUp REST client (the agent's personal token). This is the plumbing the
 * claude.ai connector can't do: webhook register/list/delete (no MCP tool
 * exists) and the cheap chat/comment reads the poller and dispatcher need.
 *
 * Acting on the business (posting comments, sending chat replies) stays in the
 * agent runs via the claude.ai connector — this file never writes business data.
 */

import { CLICKUP_API_TOKEN, WORKSPACE_ID } from "../config.js";

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

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: token(),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickUp ${method} ${url} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
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

export interface PostCommentOpts {
  text: string;
  /** Assign the comment to this user id so they get a notification. */
  assignee?: number;
  /** Also notify the task's assignees. */
  notifyAll?: boolean;
}

function commentBody(o: PostCommentOpts): Record<string, unknown> {
  return {
    comment_text: o.text,
    notify_all: o.notifyAll ?? true,
    ...(o.assignee ? { assignee: o.assignee } : {}),
  };
}

/** Post a threaded reply UNDER an existing comment (keeps the conversation in-thread). */
export async function replyToComment(commentId: string, o: PostCommentOpts): Promise<{ id: string }> {
  const out = await req<{ id?: string | number }>("POST", `${V2}/comment/${commentId}/reply`, commentBody(o));
  return { id: String(out.id ?? "") };
}

/** Post a new ROOT-level comment on a task (used only when asked to talk at top level). */
export async function createTaskComment(taskId: string, o: PostCommentOpts): Promise<{ id: string }> {
  const out = await req<{ id?: string | number }>("POST", `${V2}/task/${taskId}/comment`, commentBody(o));
  return { id: String(out.id ?? "") };
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
 * Send a chat message as the agent (the token's account). Used by the app for
 * command acks and rhythm "done" notices — not for the agent's own replies,
 * which go through its connector.
 */
export async function sendChatMessage(channelId: string, content: string): Promise<{ id: string }> {
  const out = await req<{ data?: { id?: string | number }; id?: string | number }>(
    "POST",
    `${V3}/workspaces/${WORKSPACE_ID}/chat/channels/${channelId}/messages`,
    { type: "message", content_format: "text/md", content },
  );
  return { id: String(out.data?.id ?? out.id ?? "") };
}
