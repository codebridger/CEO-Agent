/**
 * Chat poller (PRD §4.1 fallback): ClickUp has no webhook for chat, so we poll
 * the agent's channels with the REST token (cheap) and wake it on new messages.
 *
 *  - DM channels: every new message from someone other than the agent wakes it.
 *  - Every other channel in the workspace: only messages that @mention the agent
 *    wake it (ambient group chatter is left alone). New channels are discovered
 *    each tick, so an @mention anywhere wakes the agent with no per-channel config.
 *
 * Per-channel cursors (last seen message timestamp) persist in
 * data/poller/cursors.json. On first sight of a channel we baseline to the
 * latest message so we never replay old history on startup.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  IDENTITY,
  NAVID_DM_CHANNEL_ID,
  POLL_INTERVAL_MS,
  POLLER_CURSORS_PATH,
  PUBLIC_CHANNEL_ID,
} from "../config.js";
import type { ChatMessage } from "../clickup/rest.js";
import { getChatChannels, getChatMessages, getChatMessageReplies } from "../clickup/rest.js";
import { textMentionsAgent } from "../agent/identity.js";
import { handleWake } from "../wake/handle.js";

interface Watch {
  id: string;
  isDM: boolean;
}

let cursors: Record<string, number> = {};

async function loadCursors(): Promise<void> {
  try {
    cursors = JSON.parse(await readFile(POLLER_CURSORS_PATH, "utf8")) as Record<string, number>;
  } catch {
    cursors = {};
  }
}

async function saveCursors(): Promise<void> {
  await mkdir(dirname(POLLER_CURSORS_PATH), { recursive: true });
  await writeFile(POLLER_CURSORS_PATH, JSON.stringify(cursors, null, 2) + "\n", "utf8");
}

/**
 * Every channel in the workspace. DMs wake on any message; non-DM channels
 * (groups like "Subturtle Content Marketing") wake only on an @mention of the
 * agent — same rule as the public channel. The list is rebuilt every tick, so
 * channels created after startup are picked up automatically with no config.
 *
 * Note: ClickUp has no chat webhook, so this poll is the *only* way the agent
 * hears chat. Registering more webhooks cannot cover channels — webhooks carry
 * task events only.
 */
async function buildWatchList(): Promise<Watch[]> {
  const isDM = new Map<string, boolean>();
  try {
    for (const ch of await getChatChannels()) {
      isDM.set(ch.id, ch.type === "DM");
    }
  } catch (err) {
    console.error("[poller] could not list channels:", (err as Error).message);
  }
  isDM.set(NAVID_DM_CHANNEL_ID, true);
  if (!isDM.has(PUBLIC_CHANNEL_ID)) isDM.set(PUBLIC_CHANNEL_ID, false);
  return [...isDM].map(([id, dm]) => ({ id, isDM: dm }));
}

function chatUserLabel(userId: string): string {
  if (userId === String(IDENTITY.navidUserId)) return "Navid Shad (founder)";
  if (userId === String(IDENTITY.somiUserId)) return "Somayeh Roohani";
  return `teammate ${userId}`;
}

async function tick(): Promise<void> {
  const watches = await buildWatchList();
  const agentId = String(IDENTITY.agentUserId);

  for (const w of watches) {
    let msgs;
    try {
      msgs = await getChatMessages(w.id, 25);
    } catch (err) {
      console.error(`[poller] read ${w.id} failed:`, (err as Error).message);
      continue;
    }
    if (msgs.length === 0) continue;

    // Expand threaded replies. ClickUp surfaces only top-level messages here, so a
    // reply sent *inside* a message thread (e.g. someone replying under one of the
    // agent's messages) is invisible to a top-level-only poll — and its date never
    // advances the cursor. Pull replies for any message that has them and treat
    // them like first-class messages.
    // Each candidate keeps its parent message id when it came from a thread, so the
    // agent can reply back into that same thread rather than at the channel root.
    const items: { m: ChatMessage; parentId?: string }[] = msgs.map((m) => ({ m }));
    for (const m of msgs) {
      if (!m.replyCount) continue;
      try {
        for (const r of await getChatMessageReplies(m.id)) items.push({ m: r, parentId: m.id });
      } catch (err) {
        console.error(`[poller] read replies for ${m.id} failed:`, (err as Error).message);
      }
    }

    const maxDate = Math.max(...items.map((c) => c.m.date));
    const known = cursors[w.id];
    if (known === undefined) {
      cursors[w.id] = maxDate; // first sight — baseline, don't replay history
      continue;
    }

    const fresh = items
      .filter((c) => c.m.date > known && c.m.userId !== agentId)
      .sort((a, b) => a.m.date - b.m.date);

    for (const { m, parentId } of fresh) {
      if (!w.isDM && !textMentionsAgent(m.content)) continue; // group: only @mentions
      console.log(`[poller] new ${w.isDM ? "DM" : "mention"} in ${w.id} from ${m.userId}${parentId ? " (thread)" : ""}`);
      // Fire-and-forget — handleWake serializes per thread internally.
      void handleWake({
        source: "chat",
        threadId: `chat-${w.id}`,
        text: m.content,
        author: chatUserLabel(m.userId),
        authorUserId: Number(m.userId) || undefined,
        channelId: w.id,
        eventId: m.id,
        replyToMessageId: parentId,
      });
    }
    cursors[w.id] = Math.max(known, maxDate);
  }
  await saveCursors();
}

/** Start the poll loop. Returns a stop function. */
export async function startPoller(): Promise<() => void> {
  await loadCursors();
  let stopped = false;
  let running = false;

  const run = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error("[poller] tick error:", (err as Error).message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
  void run(); // baseline immediately so we don't miss the window before the first interval
  console.log(`[poller] chat poller started (every ${POLL_INTERVAL_MS}ms)`);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
