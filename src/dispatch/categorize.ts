/**
 * Categorize a ClickUp webhook event into A / B / C (PRD §4.1):
 *   A — direct mention of the agent → wake now (returns an Inbound for handleWake)
 *   B — other task activity → inbox for the (M3) PM check
 *   C — drop (loop guard for agent-authored events, or irrelevant types)
 *
 * The webhook body for comment events is thin, so mention detection fetches the
 * comment via REST and inspects it — isolated here so finalizing the mention
 * shape against a real payload is a one-spot change.
 */

import { IDENTITY } from "../config.js";
import { textMentionsAgent } from "../agent/identity.js";
import { getTaskActivityTail } from "../clickup/rest.js";
import type { Inbound } from "../wake/handle.js";

export interface ClickUpWebhookEvent {
  event?: string;
  task_id?: string;
  webhook_id?: string;
  history_items?: Array<{ user?: { id?: number | string; username?: string } }>;
}

export type Categorized =
  | { category: "A"; inbound: Inbound }
  | {
      category: "B";
      event: string;
      taskId?: string;
      threadId: string;
      author?: number;
      summary: string;
    }
  | { category: "C"; reason: string };

function eventAuthor(ev: ClickUpWebhookEvent): number | undefined {
  const u = ev.history_items?.[0]?.user;
  if (u?.id == null) return undefined;
  const n = Number(u.id);
  return Number.isFinite(n) ? n : undefined;
}

function authorLabel(userId: number | undefined): string {
  if (userId === IDENTITY.navidUserId) return "Navid Shad (founder)";
  if (userId === IDENTITY.somiUserId) return "Somayeh Roohani";
  return userId != null ? `teammate ${userId}` : "someone";
}

/**
 * One comment or threaded reply, flattened for mention resolution. `rootId` is the
 * top-level comment to thread a reply under (a reply's parent, or the comment itself) —
 * ClickUp replies always attach to a root comment, so this is the in-thread target.
 */
interface Mentionable {
  id: string;
  text: string;
  userId: number | undefined;
  date: number;
  segments: Array<Record<string, unknown>>;
  rootId: string;
  /** True if this is a reply (not the root comment) — i.e. it lives inside a thread. */
  isReply: boolean;
  /** True if the agent already participates in this thread (authored its root or any reply). */
  agentInThread: boolean;
}

/** Does this item @-mention the agent? Checks segment user refs, then text. */
function mentionsAgent(item: { segments: Array<Record<string, unknown>>; text: string }): boolean {
  for (const seg of item.segments) {
    const direct = seg["user"] as { id?: number | string } | undefined;
    const nested = (seg["attributes"] as { user?: { id?: number | string } } | undefined)?.user;
    const u = direct ?? nested;
    if (u?.id != null && Number(u.id) === IDENTITY.agentUserId) return true;
  }
  return textMentionsAgent(item.text);
}

/**
 * Flatten the task's full comment tail (root comments + their threaded replies) into
 * one newest-first list, tagging each item with its thread (`rootId`) and whether the
 * agent already participates in that thread. Including replies is essential: a person
 * can @-mention the agent in a threaded reply, and the dispatcher must thread the answer
 * back into THAT conversation — and once the agent is in a thread, a follow-up reply
 * there should get an immediate response without re-@-mentioning.
 */
async function mentionablesNewestFirst(taskId: string): Promise<Mentionable[]> {
  const tail = await getTaskActivityTail(taskId, { maxComments: 50 });
  const items: Mentionable[] = [];
  for (const root of tail) {
    const agentInThread =
      root.userId === IDENTITY.agentUserId ||
      root.replies.some((r) => r.userId === IDENTITY.agentUserId);
    items.push({
      id: root.id,
      text: root.text,
      userId: root.userId,
      date: root.date ?? 0,
      segments: root.segments,
      rootId: root.id,
      isReply: false,
      agentInThread,
    });
    for (const r of root.replies) {
      items.push({
        id: r.id,
        text: r.text,
        userId: r.userId,
        date: r.date ?? 0,
        segments: r.segments,
        rootId: root.id,
        isReply: true,
        agentInThread,
      });
    }
  }
  return items.sort((a, b) => b.date - a.date);
}

export async function categorize(ev: ClickUpWebhookEvent): Promise<Categorized> {
  const event = ev.event ?? "unknown";
  const taskId = ev.task_id;
  const author = eventAuthor(ev);

  // Loop guard — never react to our own activity (PRD §4.1 Category C).
  if (author != null && author === IDENTITY.agentUserId) {
    return { category: "C", reason: `authored by the agent (loop guard): ${event}` };
  }

  if (event === "taskCommentPosted" && taskId) {
    let items: Mentionable[] = [];
    try {
      items = await mentionablesNewestFirst(taskId);
    } catch (err) {
      console.error(`[categorize] could not fetch comments for ${taskId}:`, (err as Error).message);
    }
    // The most recent comment OR threaded reply from anyone but the agent.
    const latest = items.find((c) => c.userId !== IDENTITY.agentUserId);
    // Reply now (Category A) if the agent is @-mentioned, OR if this is a follow-up
    // reply in a thread the agent is already part of — a live conversation shouldn't
    // need a re-@-mention each turn. A brand-new root comment with no mention still
    // goes to the inbox so the agent doesn't barge into every unrelated topic.
    const continuesAgentThread = !!latest && latest.isReply && latest.agentInThread;
    if (latest && (mentionsAgent(latest) || continuesAgentThread)) {
      return {
        category: "A",
        inbound: {
          source: "task",
          threadId: `clickup-task-${taskId}`,
          text: latest.text,
          author: authorLabel(latest.userId),
          authorUserId: latest.userId,
          taskId,
          // Thread the reply under the ROOT of wherever the message is, so a mention or
          // follow-up inside a thread is answered in that same thread.
          commentId: latest.rootId,
          // Dedup on the actual message id (unique per comment/reply), so a new reply is
          // a fresh wake but re-resolving the same message is dropped.
          eventId: latest.id,
        },
      };
    }
    return {
      category: "B",
      event,
      taskId,
      threadId: `clickup-task-${taskId}`,
      author,
      summary: `comment by ${authorLabel(latest?.userId ?? author)}: ${(latest?.text ?? "").slice(0, 140)}`,
    };
  }

  // Any other task event → Category-B activity for the PM check.
  if (taskId) {
    return {
      category: "B",
      event,
      taskId,
      threadId: `clickup-task-${taskId}`,
      author,
      summary: `${event} by ${authorLabel(author)}`,
    };
  }

  return { category: "C", reason: `unhandled event: ${event}` };
}
