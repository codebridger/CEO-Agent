/**
 * Heartbeat (PRD §4.1.4) — the recurring CEO routine. Clones the council repo
 * read-only for context, runs one Opus pass to assess the business and draft
 * moves (posting them for discussion), and writes a beat log to the agent's own
 * history (data/heartbeats/<date>.md). The app commits that history; the council
 * repo is never written to.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  HEARTBEAT_TZ,
  HEARTBEATS_DIR,
  MODEL,
  NAVID_DM_CHANNEL_ID,
  PUBLIC_CHANNEL_ID,
} from "../config.js";
import { runAgent } from "../agent/runner.js";
import { sendChatMessage } from "../clickup/rest.js";
import { cloneOrUpdate } from "../council/repo.js";
import { commitHistory } from "../history/commit.js";
import { localParts } from "./time.js";
import { setLastHeartbeat } from "./state.js";

export async function runHeartbeat(): Promise<{ ok: boolean; text: string }> {
  await mkdir(HEARTBEATS_DIR, { recursive: true });
  const { dateStr } = localParts(HEARTBEAT_TZ);
  const beatPath = join(HEARTBEATS_DIR, `${dateStr}.md`);

  let councilDir = "";
  try {
    councilDir = await cloneOrUpdate();
  } catch (err) {
    console.error("[heartbeat] council clone failed:", (err as Error).message);
  }

  const task = [
    "This is your heartbeat — the recurring CEO routine in your contract. Run it now, in full.",
    "",
    councilDir
      ? `The council repo (READ-ONLY context) is freshly cloned at:\n  ${councilDir}\nRead its README/CLAUDE.md, ops/cto-heartbeat.md (the playbook), docs/metrics/framework.md, and the latest in decisions/. Follow the playbook. Do not write to this clone.`
      : "The council repo could not be cloned this beat — work from what you can read via the connectors, and note the gap in the beat log.",
    "",
    `Your own beat-log history lives in:\n  ${HEARTBEATS_DIR}\nRead the most recent file there for the last beat (treat this as the first beat if it's empty).`,
    "",
    "Pull the current state: Stripe (subscriptions, MRR, cancels), Mixpanel (installs, signups, WAU, key events per the metrics framework), ClickUp (shipped / in progress / blocked), and the repos. If any source can't be read, say so in the beat — never guess a number.",
    "Assess what changed since the last beat and what it means for revenue. Use known context before raising alarms.",
    "Draft 2 to 4 concrete next moves, ranked by revenue impact, each typed Execute / PR-FAQ / ADR / Council.",
    `Post the drafts for discussion in the public group chat (channel id ${PUBLIC_CHANNEL_ID}).`,
    "",
    `Finally, WRITE your beat log to this exact path:\n  ${beatPath}\nFollow the council ops/heartbeat-log/TEMPLATE.md format (snapshot table, drafts, outcomes; note any data you could not read). Do NOT git commit or push — the system commits it for you.`,
    "When done, reply with a one-line summary of the beat.",
  ].join("\n");

  const res = await runAgent({ task, model: MODEL.heartbeat, timeoutMs: 600_000 });
  if (res.ok) {
    await setLastHeartbeat(dateStr);
    await commitHistory(`heartbeat ${dateStr}`);
    try {
      await sendChatMessage(NAVID_DM_CHANNEL_ID, `Heartbeat done for ${dateStr}. ${res.text.slice(0, 240)}`);
    } catch (err) {
      console.error("[heartbeat] could not DM Navid:", (err as Error).message);
    }
    console.log(`[heartbeat] done ${dateStr}`);
  } else {
    console.error("[heartbeat] run failed:", res.error);
  }
  return { ok: res.ok, text: res.text };
}
