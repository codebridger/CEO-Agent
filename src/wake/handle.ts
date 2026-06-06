/**
 * Category-A wake handler: a direct mention or DM that the agent answers immediately,
 * with the full history of that thread loaded as context (PRD §4.1, §4.2).
 *
 * Runs are **serialized per thread** (decision in the architecture memo): same
 * thread queues so two events can't race on one thread file; different threads
 * run concurrently. The lock is an in-process promise chain keyed by thread id.
 *
 * The app — not the agent — performs and VERIFIES every ClickUp write, so a run
 * can never claim a message was delivered when it wasn't:
 *   - Task replies: the agent composes the text (the comment tool is blocked for
 *     the run); the app posts it as a threaded reply under the triggering comment.
 *   - Chat: the agent composes a small JSON directive saying who to message and
 *     what to say (the send-chat tool is blocked for the run); the app delivers
 *     each message via REST and records only what actually went out. Targets can
 *     be the current thread ("here") or any teammate by user id — the app
 *     resolves/creates that person's DM channel, so the agent can message anyone.
 */

import { AGENT_NAME, IDENTITY, MODEL, NAVID_DM_CHANNEL_ID } from "../config.js";
import { runAgent } from "../agent/runner.js";
import {
  createTaskComment,
  getOrCreateDirectMessage,
  getWorkspaceMembers,
  replyToComment,
  sendChatMessage,
  type Member,
} from "../clickup/rest.js";
import { appendTurn, loadThread, maybeCompact, upsertIndex } from "../memory/threads.js";
import { matchCommand } from "../rhythms/commands.js";
import { runExclusive } from "../rhythms/lock.js";
import { runHeartbeat } from "../rhythms/heartbeat.js";
import { runPmCheck } from "../rhythms/pmCheck.js";
import { enterWake, exitWake } from "./inflight.js";
import { coerceActions, executeActions, type Action } from "../control/actions.js";

const CREATE_COMMENT_TOOL = "mcp__claude_ai_ClickUp__clickup_create_task_comment";
const SEND_CHAT_TOOL = "mcp__claude_ai_ClickUp__clickup_send_chat_message";

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

const MEMBERS_TOOL = "mcp__claude_ai_ClickUp__clickup_get_workspace_members";

/** Render the team directory the agent uses to pick a DM target by user id. */
function directoryBlock(members: Member[]): string {
  if (members.length === 0) {
    return `(empty here — call the ${MEMBERS_TOOL} tool to look up the person's numeric user id)`;
  }
  return members
    .map((m) => `  - ${m.id} — ${m.name}${m.email ? ` <${m.email}>` : ""}`)
    .join("\n");
}

function buildWakePrompt(inbound: Inbound, history: string, members: Member[]): string {
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
      "Do NOT send anything yourself — you have no send tool on this run. Decide what to send and to whom,",
      "then OUTPUT ONLY a JSON object (no prose, no code fence), exactly this shape:",
      '  {"messages": [ {"to": "<target>", "text": "<message>"} ]}',
      "Each target is one of:",
      '  - "here"  → reply in this same conversation (the normal case: answering whoever just messaged you).',
      "  - a teammate's numeric user id → send them a direct message. Find the id in the team directory below.",
      "List one entry per message you actually want sent. The system delivers each via ClickUp and records",
      "exactly what went out — so do NOT include a message unless you truly want it delivered, and never",
      "claim something was sent that isn't in this list. Address people by name inside the text.",
      "",
      "You may also include an optional \"actions\" array to manage your own infrastructure:",
      '  {"messages": [...], "actions": [ {"type": "<action>", ...} ]}',
      "Actions:",
      '  - {"type": "webhook.register"}  → (re)create your ClickUp webhook. Safe/additive; allowed anytime.',
      '  - {"type": "webhook.unregister", "id": "<id>"}  → delete a webhook. Only honored from Navid\'s private DM.',
      '  - {"type": "restart", "reason": "...", "at": <epoch-ms optional>}  → restart your app (e.g. after a config',
      "      change). Only honored from Navid's private DM. The restart is graceful and waits until you're idle.",
      '  - {"type": "self-improve", "topic": "short-name", "summary": "what & why", "files": [ {"path": "prompts/pm-check.md", "content": "<full new file>"} ]}',
      "      → improve your own instruction files. Read the current file first (under prompts/), then give the COMPLETE new",
      "      content. Only prompts/* and CONTRACT.md may be changed; it opens a PR for Navid (a CONTRACT.md change is",
      "      labelled as such). It never lands directly — it takes effect after Navid merges and you restart.",
      "  Omit \"actions\" entirely when you're just talking. The system performs each action and reports the real result.",
      "",
      "Team directory (id — name):",
      directoryBlock(members),
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
    enterWake();
    try {
      // Chat wakes get the team directory so the agent can address anyone by id.
      const members = inbound.source === "chat" ? await loadDirectory() : [];
      const history = await loadThread(inbound.threadId);
      const res = await runAgent({
        task: buildWakePrompt(inbound, history, members),
        model: MODEL.pm,
        // The app performs every write — block the agent's own posting tools so it
        // can only compose, never (claim to) send.
        disallowTools: inbound.source === "task" ? [CREATE_COMMENT_TOOL] : [SEND_CHAT_TOOL],
      });

      await appendTurn(inbound.threadId, inbound.author, inbound.text);

      if (!res.ok || !res.text.trim()) {
        await appendTurn(inbound.threadId, `${AGENT_NAME} (run failed)`, res.error ?? "no output");
        await upsertIndex(inbound.threadId, `run failed: ${res.error ?? "unknown"}`);
        console.error(`[wake] agent run failed for ${inbound.threadId}: ${res.error}`);
        return;
      }

      const replyText = res.text.trim();
      let summary = replyText;
      if (inbound.source === "task") {
        let delivered = true;
        let label = "";
        try {
          label = await postTaskReply(inbound, replyText);
        } catch (err) {
          delivered = false;
          console.error(`[wake] posting reply failed for ${inbound.threadId}:`, (err as Error).message);
        }
        await appendTurn(inbound.threadId, delivered ? AGENT_NAME : `${AGENT_NAME} (post failed)`, replyText);
        console.log(`[wake] handled ${inbound.threadId} (${label})`);
      } else {
        const directive = parseChatDirective(replyText);
        // Deliver messages FIRST so the human always sees the agent's words, even
        // if an action then fails or queues a restart.
        summary = await deliverChat(inbound, directive.messages, members);
        if (directive.actions.length > 0) {
          const outcomes = await executeActions(directive.actions, inbound);
          for (const o of outcomes) await appendTurn(inbound.threadId, `${AGENT_NAME} (action)`, o);
          summary = [summary, ...outcomes].filter(Boolean).join("; ");
          console.log(`[wake] actions for ${inbound.threadId}: ${outcomes.join("; ")}`);
        }
      }

      await upsertIndex(inbound.threadId, summary);
      await maybeCompact(inbound.threadId);
    } catch (err) {
      console.error(`[wake] error handling ${inbound.threadId}:`, (err as Error).message);
    } finally {
      exitWake();
    }
  });
}

/** Best-effort team directory; an empty list just means the agent works by raw ids. */
async function loadDirectory(): Promise<Member[]> {
  try {
    return await getWorkspaceMembers();
  } catch (err) {
    console.error("[wake] could not load team directory:", (err as Error).message);
    return [];
  }
}

interface OutMsg {
  to: string;
  text: string;
}

interface Directive {
  messages: OutMsg[];
  actions: Action[];
}

/** Pull the {messages:[...], actions:[...]} directive out of the agent's output, defensively. */
function parseChatDirective(raw: string): Directive {
  const coerce = (s: string): Directive | null => {
    try {
      const o = JSON.parse(s) as { messages?: unknown; actions?: unknown };
      const hasMessages = Array.isArray(o.messages);
      const hasActions = Array.isArray(o.actions);
      if (!hasMessages && !hasActions) return null;
      const messages = (hasMessages ? (o.messages as unknown[]) : [])
        .map((m) => m as { to?: unknown; text?: unknown })
        .filter((m) => typeof m.text === "string" && m.text.trim())
        .map((m) => ({ to: String(m.to ?? "here"), text: String(m.text) }));
      return { messages, actions: coerceActions(o.actions) };
    } catch {
      return null;
    }
  };
  // Try the whole output, then a fenced block, then the first {...} span.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const brace = raw.match(/\{[\s\S]*\}/);
  const parsed =
    coerce(raw) || (fence?.[1] && coerce(fence[1].trim())) || (brace?.[0] && coerce(brace[0]));
  // Fallback: if the agent ignored the format, treat the text as a plain in-thread
  // reply rather than silently dropping it. Never invent actions on the fallback path.
  if (!parsed) return { messages: [{ to: "here", text: raw }], actions: [] };
  if (parsed.messages.length === 0 && parsed.actions.length === 0) {
    return { messages: [{ to: "here", text: raw }], actions: [] };
  }
  return parsed;
}

/**
 * Deliver every message in the agent's directive via REST, verify each, and record
 * the true outcome to the thread file(s). Returns a one-line summary for the index.
 */
async function deliverChat(inbound: Inbound, msgs: OutMsg[], members: Member[]): Promise<string> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const outcomes: string[] = [];

  for (const m of msgs) {
    const here = m.to === "here" || m.to === inbound.channelId;
    let who = here ? "this thread" : m.to;
    try {
      let channelId: string;
      let targetThreadId: string;
      if (here) {
        channelId = inbound.channelId ?? "";
        targetThreadId = inbound.threadId;
        if (!channelId) throw new Error("no channel id for this thread");
      } else {
        const uid = Number(String(m.to).replace(/^user:/, "").trim());
        if (!Number.isInteger(uid)) throw new Error(`unknown target "${m.to}"`);
        const member = byId.get(uid);
        who = member ? `${member.name} (${uid})` : `user ${uid}`;
        const dm = await getOrCreateDirectMessage([uid]);
        channelId = dm.id;
        targetThreadId = `chat-${dm.id}`;
      }

      const sent = await sendChatMessage(channelId, m.text);
      // Record under the agent's name in the inbound thread (so the conversation
      // reads naturally), and also in the recipient's own thread when it differs.
      await appendTurn(inbound.threadId, here ? AGENT_NAME : `${AGENT_NAME} → ${who}`, m.text);
      if (targetThreadId !== inbound.threadId) {
        await appendTurn(targetThreadId, AGENT_NAME, m.text);
        await upsertIndex(targetThreadId, m.text);
      }
      outcomes.push(here ? "replied" : `sent to ${who}`);
      console.log(`[wake] delivered chat to ${who} (msg ${sent.id})`);
    } catch (err) {
      const reason = (err as Error).message;
      await appendTurn(
        inbound.threadId,
        `${AGENT_NAME} (send to ${who} FAILED)`,
        `${m.text}\n\n[delivery error: ${reason}]`,
      );
      outcomes.push(`FAILED to ${who}: ${reason}`);
      console.error(`[wake] chat delivery failed (${who}):`, reason);
    }
  }

  return outcomes.join("; ");
}

/** Convenience used by the poller for the Navid DM (the most common chat thread). */
export const NAVID_DM_THREAD_ID = `chat-${NAVID_DM_CHANNEL_ID}`;
