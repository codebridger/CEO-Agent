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
  MIXPANEL_DEV_PROJECT_ID,
  MIXPANEL_PROD_PROJECT_ID,
  MODEL,
  NAVID_DM_CHANNEL_ID,
  PUBLIC_CHANNEL_ID,
} from "../config.js";
import { runAgent } from "../agent/runner.js";
import { BROWSER_TOOLS } from "../agent/policy.js";
import { renderPrompt } from "../prompts/load.js";
import { sendChatMessage } from "../clickup/rest.js";
import { cloneOrUpdate } from "../council/repo.js";
import { localParts } from "./time.js";
import { setLastHeartbeat } from "./state.js";

/** Built-in fallback if prompts/heartbeat.md is missing (the contract carries the real routine). */
const HEARTBEAT_FALLBACK = [
  "This is your heartbeat — the recurring CEO routine in your contract. Run it now, in full.",
  "",
  "{{council}}",
  "",
  "Your own beat-log history lives in:\n  {{beatHistoryDir}}\nRead the most recent file there for the last beat.",
  "",
  'Pull the current state: Stripe, ClickUp, the repos, and Mixpanel — read BOTH projects separately: PROD "{{mixpanelProd}}" (live) and DEV "{{mixpanelDev}}" (staging). Never guess a number.',
  "Assess what changed and what it means for revenue. Draft 2–4 next moves ranked by revenue impact.",
  "Post the drafts in the public group chat (channel id {{publicChannelId}}).",
  "",
  "Finally, WRITE your beat log to this exact path:\n  {{beatPath}}\nFollow the council beat-log template. Do NOT commit or push — the system commits it. Reply with a one-line summary.",
].join("\n");

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

  const council = councilDir
    ? `The council repo (READ-ONLY context) is freshly cloned at:\n  ${councilDir}\nRead its README/CLAUDE.md, ops/cto-heartbeat.md (the playbook), docs/metrics/framework.md, and the latest in decisions/. Follow the playbook. Do not write to this clone.`
    : "The council repo could not be cloned this beat — work from what you can read via the connectors, and note the gap in the beat log.";

  const task = await renderPrompt(
    "heartbeat",
    {
      council,
      beatHistoryDir: HEARTBEATS_DIR,
      beatPath,
      publicChannelId: PUBLIC_CHANNEL_ID,
      mixpanelProd: MIXPANEL_PROD_PROJECT_ID,
      mixpanelDev: MIXPANEL_DEV_PROJECT_ID,
    },
    HEARTBEAT_FALLBACK,
  );

  // Unattended run — never drive the browser on Navid's screen (see policy.ts).
  const res = await runAgent({ task, model: MODEL.heartbeat, timeoutMs: 600_000, disallowTools: BROWSER_TOOLS });
  if (res.ok) {
    await setLastHeartbeat(dateStr);
    // History is committed + pushed once a day by the scheduler's daily data push.
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
