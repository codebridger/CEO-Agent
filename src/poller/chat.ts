/**
 * Chat poller (PRD §4.1 fallback): ClickUp has no webhook for chat, so we poll
 * the agent's channels with the REST token (cheap) and wake it on new messages.
 *
 *  - DM channels: every new message from someone other than the agent wakes it.
 *  - The public group channel: only messages that @mention the agent wake it (ambient
 *    group chatter is left alone).
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
import { getChatChannels, getChatMessages } from "../clickup/rest.js";
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

/** All DM channels (discovered) plus the configured DM + public channels. */
async function buildWatchList(): Promise<Watch[]> {
  const isDM = new Map<string, boolean>();
  try {
    for (const ch of await getChatChannels()) {
      if (ch.type === "DM") isDM.set(ch.id, true);
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

    const maxDate = Math.max(...msgs.map((m) => m.date));
    const known = cursors[w.id];
    if (known === undefined) {
      cursors[w.id] = maxDate; // first sight — baseline, don't replay history
      continue;
    }

    const fresh = msgs
      .filter((m) => m.date > known && m.userId !== agentId)
      .sort((a, b) => a.date - b.date);

    for (const m of fresh) {
      if (!w.isDM && !textMentionsAgent(m.content)) continue; // group: only @mentions
      console.log(`[poller] new ${w.isDM ? "DM" : "mention"} in ${w.id} from ${m.userId}`);
      // Fire-and-forget — handleWake serializes per thread internally.
      void handleWake({
        source: "chat",
        threadId: `chat-${w.id}`,
        text: m.content,
        author: chatUserLabel(m.userId),
        authorUserId: Number(m.userId) || undefined,
        channelId: w.id,
        eventId: m.id,
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
