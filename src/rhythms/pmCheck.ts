/**
 * PM check (PRD §4.1.3) — the 5-hourly project-management sweep. Starts from the
 * inbox (the Category-B activity M2 batched), groups it by task, and runs one
 * agent pass to act over each group + sweep active work. The contract's PM-check
 * rules are the system prompt; this just hands over the worklist.
 */

import { MODEL, SUBTURTLE_APP_LIST_ID } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { renderPrompt } from "../prompts/load.js";
import { commitHistory } from "../history/commit.js";
import { drainTo, readInbox, type InboxEvent } from "../memory/inbox.js";
import { setLastPmCheck } from "./state.js";

/** Built-in fallback if prompts/pm-check.md is missing (the contract carries the real rules). */
const PM_CHECK_FALLBACK = [
  "This is your scheduled PM check — the project-management sweep in your contract.",
  "",
  "{{activity}}",
  "",
  "Work over each group per your contract, then sweep the active tasks in the Subturtle.app list (list id {{listId}}). Comment where it helps; if nothing is active, propose the next batch in the public channel. Report a short summary of what you did.",
].join("\n");

function groupByTask(events: InboxEvent[]): string {
  const groups = new Map<string, InboxEvent[]>();
  for (const e of events) {
    const key = e.taskId ?? e.threadId;
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }
  const lines: string[] = [];
  for (const [task, evs] of groups) {
    lines.push(`- Task ${task}:`);
    for (const e of evs) lines.push(`    • ${e.event} — ${e.summary}`);
  }
  return lines.join("\n");
}

export async function runPmCheck(): Promise<{ ok: boolean; text: string }> {
  const events = await readInbox();
  const activity = events.length
    ? `Activity since your last check, grouped by task:\n${groupByTask(events)}`
    : "No new activity arrived since your last check.";

  const task = await renderPrompt(
    "pm-check",
    { activity, listId: SUBTURTLE_APP_LIST_ID },
    PM_CHECK_FALLBACK,
  );

  const res = await runAgent({ task, model: MODEL.pm });
  if (res.ok) {
    await drainTo(); // archive the inbox only on success
    await setLastPmCheck(new Date().toISOString());
    await commitHistory(`pm-check ${new Date().toISOString().slice(0, 10)}`);
    console.log("[pm-check] done");
  } else {
    console.error("[pm-check] run failed:", res.error);
  }
  return { ok: res.ok, text: res.text };
}
