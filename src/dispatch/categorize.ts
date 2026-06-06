/**
 * Categorize a ClickUp webhook event into A / B / C (PRD §4.1):
 *   A — direct mention of Aso → wake now (returns an Inbound for handleWake)
 *   B — other task activity → inbox for the (M3) PM check
 *   C — drop (loop guard for Aso-authored events, or irrelevant types)
 *
 * The webhook body for comment events is thin, so mention detection fetches the
 * comment via REST and inspects it — isolated here so finalizing the mention
 * shape against a real payload is a one-spot change.
 */

import { IDENTITY } from "../config.js";
import { getTaskComments, type TaskComment } from "../clickup/rest.js";
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

/** Does this comment @-mention Aso? Checks segment user refs, then text. */
function commentMentionsAso(c: TaskComment): boolean {
  const aso = IDENTITY.asoUserId;
  for (const seg of c.segments) {
    const direct = seg["user"] as { id?: number | string } | undefined;
    const nested = (seg["attributes"] as { user?: { id?: number | string } } | undefined)?.user;
    const u = direct ?? nested;
    if (u?.id != null && Number(u.id) === aso) return true;
  }
  const t = c.text.toLowerCase();
  return t.includes("@aso") || t.includes("aso dara");
}

export async function categorize(ev: ClickUpWebhookEvent): Promise<Categorized> {
  const event = ev.event ?? "unknown";
  const taskId = ev.task_id;
  const author = eventAuthor(ev);

  // Loop guard — never react to our own activity (PRD §4.1 Category C).
  if (author != null && author === IDENTITY.asoUserId) {
    return { category: "C", reason: `authored by Aso (loop guard): ${event}` };
  }

  if (event === "taskCommentPosted" && taskId) {
    let comments: TaskComment[] = [];
    try {
      comments = await getTaskComments(taskId);
    } catch (err) {
      console.error(`[categorize] could not fetch comments for ${taskId}:`, (err as Error).message);
    }
    const latest = comments.find((c) => c.userId !== IDENTITY.asoUserId);
    if (latest && commentMentionsAso(latest)) {
      return {
        category: "A",
        inbound: {
          source: "task",
          threadId: `clickup-task-${taskId}`,
          text: latest.text,
          author: authorLabel(latest.userId),
          authorUserId: latest.userId,
          taskId,
          commentId: latest.id,
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
