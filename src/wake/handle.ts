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

import { AGENT_NAME, HEARTBEAT_TZ, IDENTITY, LONG_JOB_TIMEOUT_MS, MODEL, NAVID_DM_CHANNEL_ID } from "../config.js";
import { runAgent } from "../agent/runner.js";
import {
  createTaskComment,
  getOrCreateDirectMessage,
  getWorkspaceMembers,
  replyToComment,
  sendChatMessage,
  sendChatReply,
  type Member,
} from "../clickup/rest.js";
import { buildTaskActivityDigest } from "../activity/digest.js";
import { appendTurn, loadThread, maybeCompact, upsertIndex } from "../memory/threads.js";
import { matchCommand } from "../rhythms/commands.js";
import { describeJob, listJobs, MAX_JOBS } from "../rhythms/schedules.js";
import {
  describeWorkflow,
  listWorkflows,
  loadPlaybook,
  modelFor,
  MAX_WORKFLOWS,
  workflowForTask,
} from "../workflows/registry.js";
import { runExclusive } from "../rhythms/lock.js";
import { runHeartbeat } from "../rhythms/heartbeat.js";
import { runPmCheck } from "../rhythms/pmCheck.js";
import { enterWake, exitWake } from "./inflight.js";
import { markEventSeen } from "./dedup.js";
import { coerceActions, executeActions, type Action } from "../control/actions.js";
import { CREATE_COMMENT_TOOL, SEND_CHAT_TOOL } from "../agent/policy.js";

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
  /**
   * If this chat wake was triggered by a reply INSIDE a message thread, the id of
   * that thread's parent (root) message. The agent's reply is posted back into the
   * same thread rather than at the channel root. Undefined for top-level messages.
   */
  replyToMessageId?: string;
  /**
   * Stable id of the underlying event (task comment id / chat message id) used to
   * drop duplicate deliveries. Omit only for synthetic wakes that should always run.
   */
  eventId?: string;
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

function buildWakePrompt(
  inbound: Inbound,
  history: string,
  members: Member[],
  activity: string,
  schedules: string,
  playbook: string,
  workflows: string,
): string {
  const uid = inbound.authorUserId;
  const head = [
    `You have been woken by a new ${inbound.source === "chat" ? "chat message" : "task comment"} addressed to you.`,
    "Answer it now, in your own voice, following your contract (plain English, short, honest, no cheerleading).",
    "",
    playbook.trim()
      ? "This task belongs to one of your workflows — follow its playbook for how to handle it " +
        "(e.g. editing, illustrating, iterating):\n---\n" + playbook.trim() + "\n---"
      : "",
    "",
    history.trim()
      ? "Conversation so far (your episodic memory for this thread):\n---\n" + history.trim() + "\n---"
      : "This is a new thread — no prior history.",
    "",
    activity.trim()
      ? "Task activity tail (full comment thread + linked GitHub work — already fetched for you):\n---\n" +
        activity.trim() +
        "\n---"
      : "",
    "",
    `New message from ${inbound.author}:`,
    inbound.text.trim(),
    "",
    "Read whatever further ClickUp/Stripe context you need first.",
    "If a comment or message includes an attachment or link (a 📎 line above, or a URL in the text) that matters for",
    "the reply, fetch it rather than guessing — download it (e.g. with curl; ClickUp attachment URLs are public) and",
    "read the file (an image/PDF too: save it and open it). Don't claim to have read a file you didn't actually fetch.",
    "",
    "TWO WAYS TO HANDLE THIS — pick the one that fits:",
    "  1) ANSWER NOW (the usual case) — anything you can finish in this one run: a question, a quick edit, a short lookup.",
    "     Do it now and reply as instructed below.",
    "  2) TAKE IT AS A LONG JOB — choose this if the work needs the browser, hits an external site, is multi-step, or will",
    "     plausibly take more than a minute. This run has a short time limit and WILL be killed mid-task (losing your work)",
    "     if you try to cram a long job into it. So do NOT start the work here. Instead OUTPUT ONLY this JSON (no prose, no",
    "     code fence, nothing else):",
    '       {"longJob": {"ack": "<a short note telling them you are on it>", "task": "<full, self-contained description of the work to do>"}}',
    "     The system sends your ack immediately, then runs you AGAIN with a long time budget and the browser available to",
    '     actually do the work, and posts your result back into this thread. Put everything that second run needs into "task"',
    "     (it also sees this thread's history). When in doubt for real, hands-on work, choose the long job — it's the",
    "     difference between finishing and timing out.",
  ];

  if (inbound.source === "chat") {
    head.push(
      "If you are TAKING IT AS A LONG JOB (option 2 above): output ONLY the longJob JSON and nothing else — not the",
      "messages directive below. Otherwise, to ANSWER NOW (option 1):",
      "Do NOT send anything yourself — you have no send tool on this run. Decide what to send and to whom,",
      "then OUTPUT ONLY a JSON object (no prose before or after it, no code fence), exactly this shape:",
      '  {"messages": [ {"to": "<target>", "text": "<message>"} ]}',
      "It MUST be valid JSON. Inside \"text\": write \\n for line breaks, and do NOT use double-quote",
      "characters — use single quotes ('like this') if you need to quote something. Output the JSON only.",
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
      '  - {"type": "remember", "text": "<durable fact>"}  → save a fact to your standing memory so you',
      "      keep it across runs (e.g. a teammate left, a decision, a preference). It's loaded into every",
      "      future run automatically. Use it whenever you learn something you should not forget. Safe; anytime.",
      '  - {"type": "webhook.register"}  → (re)create your ClickUp webhook. Safe/additive; allowed anytime.',
      '  - {"type": "webhook.unregister", "id": "<id>"}  → delete a webhook. Only honored from Navid\'s private DM.',
      '  - {"type": "restart", "reason": "...", "at": <epoch-ms optional>}  → restart your app (e.g. after a config',
      "      change). Only honored from Navid's private DM. The restart is graceful and waits until you're idle.",
      '  - {"type": "self-improve", "topic": "short-name", "summary": "what & why", "files": [ {"path": "prompts/pm-check.md", "content": "<full new file>"} ]}',
      "      → improve your own instruction files. Read the current file first (under prompts/), then give the COMPLETE new",
      "      content. Only prompts/* and CONTRACT.md may be changed; it opens a PR for Navid (a CONTRACT.md change is",
      "      labelled as such). It never lands directly — it takes effect after Navid merges and you restart.",
      '  - {"type": "schedule", "title": "<name>", "cron": "<m h dom mon dow>", "task": "<what to do each run>", "tz": "<IANA, optional>", "long": false, "id": "<optional, to update>"}',
      "      → create (or update, with id) a recurring job you run on a cron cadence, e.g. top up a content backlog every",
      "      Monday. Standard 5-field cron in your timezone (default " + HEARTBEAT_TZ + "); the minute field must be specific",
      '      (no "*" — so at most ~hourly). A normal job is unattended: NO browser, ~5-min budget, no publishing — use it for',
      "      ClickUp/repo/analysis work (drafting tasks, chasing, summarising). Set \"long\": true for a HEAVY job that needs the",
      "      browser or longer than ~5 min (it gets a 20-min budget + the browser); a long job runs unattended and can drive",
      "      Navid's screen, so it is only allowed from Navid's private DM. Normal jobs are safe/additive, allowed anytime. Up to " +
        String(MAX_JOBS) + " jobs.",
      "      A job that is too big for one run can SPAN MULTIPLE runs: when a run nears its time budget, output ONLY",
      '      {"continue": {"state": "<what you finished + what is left + where you are>", "summary": "<one line>"}} to',
      '      checkpoint, and {"done": {"summary": "..."}} when the whole job is complete. The next run resumes from your',
      "      saved state (a long job's browser session stays open), so heavy work finishes across chunks instead of being cut off.",
      "      For a LONG job the app automatically posts your start / each checkpoint / done back into the thread this was asked",
      "      from, and keeps a detailed step log — so do NOT post your own progress updates; just do the work and checkpoint.",
      '  - {"type": "unschedule", "id": "<job id>"}  → remove one of your jobs. Allowed anytime.',
      '  - {"type": "workflow", "name": "<name>", "playbook": "<the rules, as markdown>", "model": "sonnet"|"opus",',
      '       "listId": "<clickup list>", "cron": "<m h dom mon dow, optional>", "tz": "<IANA, optional>",',
      '       "generate": "<what to draft each run, if cron set>", "allowBrowser": false, "id": "<optional, to update>"}',
      '      → set up (or update, with id) a repeatable, human-in-the-loop WORKFLOW. "playbook" is its rules, written as',
      "       markdown — it is saved in your OWN data (not the code repo), so creating/editing a workflow needs no PR or restart.",
      "       A workflow has two halves that share that playbook + model: the cron GENERATE step drafts into the ClickUp list,",
      "       and any comment on a task in that list wakes you to ITERATE (edit/illustrate) with the same playbook loaded. On",
      '       update, omit "playbook" to keep the current rules. "model":"opus" runs both halves on Opus. "allowBrowser":true',
      "       lets the unattended generate step use the browser — that (publishing-capable) variant is only honored from Navid's",
      "       private DM; a Canva/ClickUp-only workflow is fine anytime.",
      '  - {"type": "workflow.remove", "id": "<workflow id>"}  → remove a workflow. Allowed anytime.',
      "  Omit \"actions\" entirely when you're just talking. The system performs each action and reports the real result.",
      "",
      schedules,
      workflows,
      "Team directory (id — name):",
      directoryBlock(members),
    );
  } else {
    // Task: compose only. The app posts it as a threaded reply (the agent has no
    // tool that can, and posting stays server-side for the guardrails).
    head.push(
      "If you are ANSWERING NOW (option 1): do NOT post anything yourself. Compose your reply and OUTPUT ONLY the exact",
      `reply text — no preamble, no "I posted…", just the message. The system will post it as a threaded reply under`,
      `${inbound.author}'s comment and notify them. Address them by name in the text.`,
      "If instead you are TAKING IT AS A LONG JOB (option 2): output ONLY the longJob JSON and nothing else.",
    );
  }

  return head.filter(Boolean).join("\n");
}

/** Post the composed reply to ClickUp (threaded by default, markdown rendered). Returns a log label. */
async function postTaskReply(inbound: Inbound, text: string): Promise<string> {
  const threaded = Boolean(inbound.commentId) && !wantsRootComment(inbound.text);
  // Address the person with a real @mention (like a human would) rather than assigning
  // them the comment. Drop the "(founder)"-style suffix from the display label. The text
  // itself is rendered as markdown by rest.ts (rich segments, plain-text fallback).
  const name = inbound.author.replace(/\s*\([^)]*\)\s*$/, "").trim() || inbound.author;
  const mention = inbound.authorUserId ? { id: inbound.authorUserId, name } : undefined;
  const opts = { text, mention, notifyAll: true };

  if (threaded) {
    const r = await replyToComment(inbound.commentId ?? "", opts);
    return `threaded reply ${r.id} under comment ${inbound.commentId}`;
  }
  const r = await createTaskComment(inbound.taskId ?? "", opts);
  return `root comment ${r.id} on task ${inbound.taskId}`;
}

interface LongJob {
  /** The short note sent to the user immediately, while the work runs. */
  ack: string;
  /** Self-contained description of the work the second (long) run should do. */
  task: string;
}

/**
 * Detect a long-job directive in the agent's output: {"longJob": {"ack","task"}}.
 * Works for both branches — chat output is JSON already, and a task reply is plain
 * text that simply won't parse (→ null, normal reply). Tries the whole string, a
 * fenced block, then the first {...} span, mirroring parseChatDirective's leniency.
 */
function parseLongJob(raw: string): LongJob | null {
  const tryParse = (s: string): LongJob | null => {
    try {
      const o = JSON.parse(s) as { longJob?: { ack?: unknown; task?: unknown } };
      const lj = o?.longJob;
      if (!lj) return null;
      const ack = String(lj.ack ?? "").trim();
      const task = String(lj.task ?? "").trim();
      return ack && task ? { ack, task } : null;
    } catch {
      return null;
    }
  };
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const brace = raw.match(/\{[\s\S]*\}/);
  return (
    tryParse(raw.trim()) ||
    (fence?.[1] ? tryParse(fence[1].trim()) : null) ||
    (brace?.[0] ? tryParse(brace[0]) : null)
  );
}

/** Post one message into the thread the wake came from (threaded reply / in-thread chat). */
async function postInThread(inbound: Inbound, text: string): Promise<void> {
  if (inbound.source === "task") {
    await postTaskReply(inbound, text);
    return;
  }
  if (inbound.replyToMessageId) {
    await sendChatReply(inbound.replyToMessageId, text);
  } else if (inbound.channelId) {
    await sendChatMessage(inbound.channelId, text);
  } else {
    throw new Error("no channel id for this chat thread");
  }
}

/** Prompt for the second (long) run: do the work end to end, then report back. */
function buildLongRunPrompt(
  inbound: Inbound,
  ctx: { history: string; activity: string; playbook: string },
  task: string,
): string {
  return [
    `You decided this needs real work with a time budget, and ${inbound.author} has already been told you're on it.`,
    "Now do it, end to end. You have your FULL toolset including the browser, and a generous time budget — there's no",
    "rush, just finish it correctly.",
    "",
    ctx.playbook.trim() ? "Workflow playbook (the rules to follow):\n---\n" + ctx.playbook.trim() + "\n---" : "",
    "",
    ctx.history.trim() ? "Conversation so far (this thread):\n---\n" + ctx.history.trim() + "\n---" : "",
    "",
    ctx.activity.trim() ? "Task activity tail:\n---\n" + ctx.activity.trim() + "\n---" : "",
    "",
    "The job to do now:",
    task,
    "",
    `When finished, OUTPUT ONLY your final report to ${inbound.author} — plain text in your normal voice (per your`,
    'contract), no preamble, no JSON, no "I posted…". Say what you did and the result. If you could NOT finish, say',
    "what you got done and exactly what blocked you. The system posts your report into this same thread — do not try",
    "to post it yourself.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Execute a long job (Design A): send the agent's ack now as the in-thread placeholder,
 * run the real work with a long budget + the browser, then post the outcome back into
 * the same thread. A failed/timed-out run posts an honest "couldn't finish" rather than
 * leaving the thread hanging on the ack.
 */
async function runLongJob(
  inbound: Inbound,
  ctx: { history: string; activity: string; playbook: string; model: string },
  job: LongJob,
): Promise<void> {
  // 1) Acknowledge immediately — this is what the user sees while the work runs.
  try {
    await postInThread(inbound, job.ack);
    await appendTurn(inbound.threadId, `${AGENT_NAME} (on it)`, job.ack);
  } catch (err) {
    console.error(`[wake] long-job ack failed for ${inbound.threadId}:`, (err as Error).message);
  }

  // 2) Do the work — long budget, browser allowed, posting tools still blocked (the app posts).
  const res = await runAgent({
    task: buildLongRunPrompt(inbound, ctx, job.task),
    model: ctx.model,
    timeoutMs: LONG_JOB_TIMEOUT_MS,
    disallowTools: inbound.source === "task" ? [CREATE_COMMENT_TOOL] : [SEND_CHAT_TOOL],
  });

  // 3) Post the outcome (or an honest failure) into the same thread.
  const outcome =
    res.ok && res.text.trim()
      ? res.text.trim()
      : `❌ Couldn't finish that one — ${res.error ?? "no output"}. Want me to retry, or take a different approach?`;
  try {
    await postInThread(inbound, outcome);
    await appendTurn(inbound.threadId, res.ok ? AGENT_NAME : `${AGENT_NAME} (long job failed)`, outcome);
    await upsertIndex(inbound.threadId, outcome.slice(0, 200));
  } catch (err) {
    console.error(`[wake] long-job result post failed for ${inbound.threadId}:`, (err as Error).message);
    await appendTurn(inbound.threadId, `${AGENT_NAME} (post failed)`, outcome);
  }
  console.log(`[wake] long job for ${inbound.threadId}: ${res.ok ? "done" : `FAILED ${res.error}`}`);
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
  // Idempotency: the same comment/message can arrive more than once (ClickUp
  // re-delivery, the latest-comment resolver in categorize, poller/webhook
  // overlap). Drop a repeat synchronously, before any work, so the agent never
  // answers the same message twice.
  if (inbound.eventId && !markEventSeen(`${inbound.source}:${inbound.eventId}`)) {
    console.log(`[wake] drop duplicate ${inbound.threadId} (event ${inbound.eventId})`);
    return Promise.resolve();
  }

  // A rhythm command from Navid short-circuits the normal reply.
  if (inbound.authorUserId === IDENTITY.navidUserId) {
    const cmd = matchCommand(inbound.text);
    if (cmd) return handleCommand(inbound, cmd);
  }

  return withLock(inbound.threadId, async () => {
    enterWake();
    try {
      // Chat wakes get the team directory (to address anyone by id) and the agent's
      // current scheduled jobs (so it can reference/replace them, not duplicate).
      const members = inbound.source === "chat" ? await loadDirectory() : [];
      const schedules = inbound.source === "chat" ? await loadSchedulesBlock() : "";
      const workflows = inbound.source === "chat" ? await loadWorkflowsBlock(inbound.text) : "";
      const history = await loadThread(inbound.threadId);
      // Task wakes get the full activity tail (comments + replies + linked GitHub),
      // assembled here so the agent never has to reconstruct it (and can't miss it).
      const activity = inbound.source === "task" && inbound.taskId ? await loadActivity(inbound.taskId) : "";
      // If this task belongs to a workflow, the iterate step runs with that workflow's
      // playbook + model (the same the recurring generate step uses).
      const wf = inbound.source === "task" && inbound.taskId ? await workflowForTask(inbound.taskId) : undefined;
      const playbook = wf ? await loadPlaybook(wf) : "";
      const jobModel = wf ? modelFor(wf) : MODEL.pm;
      const res = await runAgent({
        task: buildWakePrompt(inbound, history, members, activity, schedules, playbook, workflows),
        model: jobModel,
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

      // The agent may have decided this is a LONG JOB rather than an answer-now reply.
      // If so, acknowledge immediately and do the real work in a second run with a long
      // budget + the browser available (Design A). The thread stays serialized — this
      // still runs inside the per-thread lock — so nothing else races on it meanwhile.
      const longJob = parseLongJob(replyText);
      if (longJob) {
        await runLongJob(inbound, { history, activity, playbook, model: jobModel }, longJob);
        await maybeCompact(inbound.threadId);
        return;
      }
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

/** Best-effort activity tail; an empty string just means the agent reads context itself. */
async function loadActivity(taskId: string): Promise<string> {
  try {
    const digest = await buildTaskActivityDigest(taskId);
    return digest.markdown;
  } catch (err) {
    console.error(`[wake] could not build activity digest for ${taskId}:`, (err as Error).message);
    return "";
  }
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

/** Render the agent's current scheduled jobs for its prompt (so it can update/remove, not duplicate). */
async function loadSchedulesBlock(): Promise<string> {
  try {
    const jobs = await listJobs();
    if (jobs.length === 0) return `Your scheduled jobs: none yet (you can create up to ${MAX_JOBS}).`;
    return ["Your scheduled jobs (use the schedule action with an id to update, or unschedule to remove):"]
      .concat(jobs.map((j) => `  - ${describeJob(j)}`))
      .join("\n");
  } catch (err) {
    console.error("[wake] could not load schedules:", (err as Error).message);
    return "";
  }
}

/** Render the agent's current workflows for its prompt (so it can update/remove, not duplicate). */
async function loadWorkflowsBlock(messageText = ""): Promise<string> {
  try {
    const wfs = await listWorkflows();
    if (wfs.length === 0) return `Your workflows: none yet (you can set up to ${MAX_WORKFLOWS}).`;
    // Only inline the full playbook bodies when the message is actually about a
    // workflow (editing one needs the current text — the workflow action replaces
    // the file wholesale, no merge). Otherwise just the summary, so an unrelated
    // chat message doesn't drag every playbook into context. The task wake always
    // loads the relevant body via loadPlaybook.
    const t = messageText.toLowerCase();
    const wantsBodies =
      /\b(workflow|playbook)\b/.test(t) || wfs.some((w) => t.includes(w.name.toLowerCase()));
    if (!wantsBodies) {
      return [
        "Your workflows (ask about a workflow/playbook to see its full text; use the workflow action with an id to update, or workflow.remove to remove):",
        ...wfs.map((w) => `  - ${describeWorkflow(w)}`),
      ].join("\n");
    }
    const blocks = await Promise.all(
      wfs.map(async (w) => {
        const body = (await loadPlaybook(w)).trim();
        const playbook = body
          ? `\n    playbook (${w.playbook}.md):\n${body.replace(/^/gm, "      ")}`
          : `\n    playbook (${w.playbook}.md): (empty)`;
        return `  - ${describeWorkflow(w)}${playbook}`;
      }),
    );
    return [
      "Your workflows (use the workflow action with an id to update, or workflow.remove to remove).",
      "To edit a playbook, send the workflow action with the FULL new playbook text — it replaces the file wholesale, so splice into the current text below; omit playbook to keep it unchanged.",
      ...blocks,
    ].join("\n");
  } catch (err) {
    console.error("[wake] could not load workflows:", (err as Error).message);
    return "";
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
  if (parsed && (parsed.messages.length > 0 || parsed.actions.length > 0)) return parsed;

  // Strict JSON failed (the usual cause: the agent left an unescaped " inside `text`,
  // e.g. quoting a commit message). Recover the message text(s) leniently so we deliver
  // the agent's actual words — never the raw {"messages":...} plumbing. Don't recover
  // actions: executing a malformed directive is riskier than skipping it.
  const recovered = recoverMessages(raw);
  if (recovered.length > 0) return { messages: recovered, actions: [] };

  // True fallback: no directive at all (the agent answered in plain prose). Post the
  // prose as an in-thread reply, but strip any stray JSON envelope so plumbing never leaks.
  const prose = stripDirectiveEnvelope(raw).trim();
  return { messages: [{ to: "here", text: prose || raw }], actions: [] };
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
 * Lenient extraction of `{to, text}` pairs from a messages directive whose JSON is
 * malformed (typically unescaped quotes inside `text`). Bypasses JSON.parse: grabs each
 * text up to the closing `"}` of its object (non-greedy, so unescaped inner quotes survive).
 */
function recoverMessages(raw: string): OutMsg[] {
  if (!/"messages"\s*:/.test(raw)) return [];
  const out: OutMsg[] = [];
  const withTo = /"to"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"text"\s*:\s*"([\s\S]*?)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = withTo.exec(raw)) !== null) {
    const text = unescapeJsonish(m[2] ?? "").trim();
    if (text) out.push({ to: (m[1] ?? "").trim() || "here", text });
  }
  if (out.length > 0) return out;
  // No to/text pairs matched — fall back to text-only, defaulting each to this thread.
  const textOnly = /"text"\s*:\s*"([\s\S]*?)"\s*\}/g;
  while ((m = textOnly.exec(raw)) !== null) {
    const text = unescapeJsonish(m[1] ?? "").trim();
    if (text) out.push({ to: "here", text });
  }
  return out;
}

/** Remove a fenced or bare {...} directive envelope from prose, leaving the human text. */
function stripDirectiveEnvelope(raw: string): string {
  return raw
    .replace(/```(?:json)?\s*[\s\S]*?```/g, "")
    .replace(/\{[\s\S]*"messages"[\s\S]*\}/g, "")
    .trim();
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

      // Stay in the thread the human used: if this wake came from an in-thread
      // reply and we're answering "here", post the reply under the same parent
      // message instead of at the channel root.
      const sent =
        here && inbound.replyToMessageId
          ? await sendChatReply(inbound.replyToMessageId, m.text)
          : await sendChatMessage(channelId, m.text);
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
