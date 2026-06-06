/**
 * Category-A wake handler: a direct mention or DM that the agent answers immediately,
 * with the full history of that thread loaded as context (PRD §4.1, §4.2).
 *
 * Runs are **serialized per thread** (decision in the architecture memo): same
 * thread queues so two events can't race on one thread file; different threads
 * run concurrently. The lock is an in-process promise chain keyed by thread id.
 *
 * Task replies: the agent COMPOSES the reply (it cannot post — the comment tool
 * is blocked for the run), and the app posts it as a **threaded reply** under the
 * triggering comment via REST, assigned to the asker so they get a notification.
 * This keeps replies in-thread (no MCP tool can do that) and keeps the write
 * token server-side, away from the agent's reasoning. Chat replies still go out
 * through the agent's connector.
 */

import { AGENT_NAME, IDENTITY, MODEL, NAVID_DM_CHANNEL_ID } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { createTaskComment, replyToComment, sendChatMessage } from "../clickup/rest.js";
import { appendTurn, loadThread, maybeCompact, upsertIndex } from "../memory/threads.js";
import { matchCommand } from "../rhythms/commands.js";
import { runExclusive } from "../rhythms/lock.js";
import { runHeartbeat } from "../rhythms/heartbeat.js";
import { runPmCheck } from "../rhythms/pmCheck.js";

const CREATE_COMMENT_TOOL = "mcp__claude_ai_ClickUp__clickup_create_task_comment";

export interface Inbound {
  /** Where the message came from — decides how the agent replies. */
  source: "task" | "chat";
  /** Stable thread id / file slug, e.g. "clickup-task-86e..." or "chat-8crzyb7-1458". */
  threadId: string;
  /** The new message text the agent should respond to. */
  text: string;
  /** Display label of the sender (for the thread file). */
  author: string;
  /** ClickUp user id of the sender — so the agent can notify them in its reply. */
  authorUserId?: number;
  /** Task id to comment on (source === "task"). */
  taskId?: string;
  /** The comment that triggered this wake — the agent's reply threads under it. */
  commentId?: string;
  /** Chat channel id to reply in (source === "chat"). */
  channelId?: string;
}

// thread id -> tail of its run queue. Same-thread runs chain; cleaned up when idle.
const locks = new Map<string, Promise<void>>();

function withLock(threadId: string, fn: () => Promise<void>): Promise<void> {
  const prev = locks.get(threadId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run regardless of a prior failure
  // Drop the lock entry once this is the last queued run.
  locks.set(
    threadId,
    next.finally(() => {
      if (locks.get(threadId) === next) locks.delete(threadId);
    }),
  );
  return next;
}

/** Did the asker explicitly ask for a top-level (root) comment rather than a thread? */
function wantsRootComment(text: string): boolean {
  return /\b(root|top[\s-]?level|new comment|not (in )?(the )?thread)\b/i.test(text);
}

function buildWakePrompt(inbound: Inbound, history: string): string {
  const uid = inbound.authorUserId;
  const head = [
    `You have been woken by a new ${inbound.source === "chat" ? "chat message" : "task comment"} addressed to you.`,
    "Answer it now, in your own voice, following your contract (plain English, short, honest, no cheerleading).",
    "",
    history.trim()
      ? "Conversation so far (your episodic memory for this thread):\n---\n" + history.trim() + "\n---"
      : "This is a new thread — no prior history.",
    "",
    `New message from ${inbound.author}:`,
    inbound.text.trim(),
    "",
    "Read whatever ClickUp/Stripe context you need first.",
  ];

  if (inbound.source === "chat") {
    head.push(
      `Then reply in ClickUp chat channel id "${inbound.channelId}" using the send-chat-message tool with that exact channel_id — not any other channel, not your own notes channel.`,
      uid != null
        ? `Address ${inbound.author} by name and pass followers: ["${uid}"] so they get the notification.`
        : "",
      "After sending, report back the exact text you sent (it is recorded to memory).",
    );
  } else {
    // Task: compose only. The app posts it as a threaded reply (the agent has no
    // tool that can, and posting stays server-side for the guardrails).
    head.push(
      "Do NOT post anything yourself. Compose your reply and OUTPUT ONLY the exact reply text —",
      `no preamble, no "I posted…", just the message. The system will post it as a threaded reply`,
      `under ${inbound.author}'s comment and notify them. Address them by name in the text.`,
    );
  }

  return head.filter(Boolean).join("\n");
}

/** Post the composed reply to ClickUp (threaded by default). Returns a log label. */
async function postTaskReply(inbound: Inbound, text: string): Promise<string> {
  const opts = { text, assignee: inbound.authorUserId, notifyAll: true };
  if (inbound.commentId && !wantsRootComment(inbound.text)) {
    const r = await replyToComment(inbound.commentId, opts);
    return `threaded reply ${r.id} under comment ${inbound.commentId}`;
  }
  const r = await createTaskComment(inbound.taskId ?? "", opts);
  return `root comment ${r.id} on task ${inbound.taskId}`;
}

/**
 * Handle one Category-A message end to end. Resolves when the reply is sent and
 * the thread file updated. Errors are logged, not thrown (callers fire-and-forget).
 */
/** A manual rhythm command from Navid ("run heartbeat" / "run pm check"). */
async function handleCommand(inbound: Inbound, cmd: "heartbeat" | "pm-check"): Promise<void> {
  console.log(`[wake] rhythm command from Navid: ${cmd}`);
  const ack =
    cmd === "heartbeat"
      ? "On it — running the heartbeat now. I'll post the beat when it's done."
      : "On it — running the PM check now.";
  if (inbound.channelId) {
    await sendChatMessage(inbound.channelId, ack).catch((e) =>
      console.error("[wake] command ack failed:", (e as Error).message),
    );
  }
  // Fire-and-forget under the cross-process lock so it can't overlap a scheduled run.
  void runExclusive(cmd, cmd === "heartbeat" ? runHeartbeat : runPmCheck);
}

export function handleWake(inbound: Inbound): Promise<void> {
  // A rhythm command from Navid short-circuits the normal reply.
  if (inbound.authorUserId === IDENTITY.navidUserId) {
    const cmd = matchCommand(inbound.text);
    if (cmd) return handleCommand(inbound, cmd);
  }

  return withLock(inbound.threadId, async () => {
    try {
      const history = await loadThread(inbound.threadId);
      const res = await runAgent({
        task: buildWakePrompt(inbound, history),
        model: MODEL.pm,
        // For task wakes the app posts the reply — block the agent from commenting itself.
        disallowTools: inbound.source === "task" ? [CREATE_COMMENT_TOOL] : [],
      });

      await appendTurn(inbound.threadId, inbound.author, inbound.text);

      if (!res.ok || !res.text.trim()) {
        await appendTurn(inbound.threadId, `${AGENT_NAME} (run failed)`, res.error ?? "no output");
        await upsertIndex(inbound.threadId, `run failed: ${res.error ?? "unknown"}`);
        console.error(`[wake] agent run failed for ${inbound.threadId}: ${res.error}`);
        return;
      }

      const replyText = res.text.trim();
      let label = inbound.source === "chat" ? `channel ${inbound.channelId}` : "";
      let delivered = true;
      if (inbound.source === "task") {
        try {
          label = await postTaskReply(inbound, replyText);
        } catch (err) {
          delivered = false;
          console.error(`[wake] posting reply failed for ${inbound.threadId}:`, (err as Error).message);
        }
      }

      await appendTurn(inbound.threadId, delivered ? AGENT_NAME : `${AGENT_NAME} (post failed)`, replyText);
      await upsertIndex(inbound.threadId, replyText);
      await maybeCompact(inbound.threadId);
      console.log(`[wake] handled ${inbound.threadId} (${label})`);
    } catch (err) {
      console.error(`[wake] error handling ${inbound.threadId}:`, (err as Error).message);
    }
  });
}

/** Convenience used by the poller for the Navid DM (the most common chat thread). */
export const NAVID_DM_THREAD_ID = `chat-${NAVID_DM_CHANNEL_ID}`;
