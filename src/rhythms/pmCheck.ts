/**
 * PM check (PRD §4.1.3) — the 5-hourly project-management sweep. Starts from the
 * inbox (the Category-B activity M2 batched), groups it by task, and runs one
 * agent pass to act over each group + sweep active work. The contract's PM-check
 * rules are the system prompt; this just hands over the worklist.
 */

import { MODEL, SUBTURTLE_APP_LIST_ID } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { BROWSER_TOOLS } from "../agent/policy.js";
import { renderPrompt } from "../prompts/load.js";
import { drainTo, readInbox, type InboxEvent } from "../memory/inbox.js";
import { buildTaskActivityDigest } from "../activity/digest.js";
import { setLastPmCheck } from "./state.js";

/** Cap how many tasks we pull a full activity tail for — bounds prompt size + GitHub search calls. */
const MAX_ACTIVITY_TASKS = 8;

/** Built-in fallback if prompts/pm-check.md is missing (the contract carries the real rules). */
const PM_CHECK_FALLBACK = [
  "This is your scheduled PM check — the project-management sweep in your contract.",
  "",
  "{{activity}}",
  "",
  "Work over each group per your contract, then sweep the active tasks in the Subturtle.app list (list id {{listId}}). Comment where it helps; if nothing is active, propose the next batch in the public channel. Report a short summary of what you did.",
].join("\n");

function groupByTask(events: InboxEvent[]): { rendered: string; taskIds: string[] } {
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
  // Only real task ids (not threadId-only chat groups) get an activity tail.
  const taskIds = [...new Set(events.map((e) => e.taskId).filter((t): t is string => !!t))];
  return { rendered: lines.join("\n"), taskIds };
}

/** Build the per-task activity tails for the touched tasks, capped, as one block. */
async function activityTails(taskIds: string[]): Promise<string> {
  const picked = taskIds.slice(0, MAX_ACTIVITY_TASKS);
  if (picked.length === 0) return "";
  const digests = await Promise.all(picked.map((id) => buildTaskActivityDigest(id)));
  const more =
    taskIds.length > picked.length
      ? `\n\n(+${taskIds.length - picked.length} more touched tasks — read their tails directly if needed.)`
      : "";
  return (
    "Full activity tail for each touched task (comments + threaded replies + linked GitHub work), " +
    "already fetched so you don't miss any of it:\n\n" +
    digests.map((d) => d.markdown).join("\n\n---\n\n") +
    more
  );
}

export async function runPmCheck(): Promise<{ ok: boolean; text: string }> {
  const events = await readInbox();
  const grouped = events.length ? groupByTask(events) : { rendered: "", taskIds: [] };
  const tails = await activityTails(grouped.taskIds);
  const activity = events.length
    ? `Activity since your last check, grouped by task:\n${grouped.rendered}${tails ? `\n\n${tails}` : ""}`
    : "No new activity arrived since your last check.";

  const task = await renderPrompt(
    "pm-check",
    { activity, listId: SUBTURTLE_APP_LIST_ID },
    PM_CHECK_FALLBACK,
  );

  // Unattended run — never drive the browser on Navid's screen (see policy.ts).
  const res = await runAgent({ task, model: MODEL.pm, disallowTools: BROWSER_TOOLS });
  if (res.ok) {
    await drainTo(); // archive the inbox only on success
    await setLastPmCheck(new Date().toISOString());
    // History is committed + pushed once a day by the scheduler's daily data push,
    // not per PM check — keeps the data-branch log to one commit a day.
    console.log("[pm-check] done");
  } else {
    console.error("[pm-check] run failed:", res.error);
  }
  return { ok: res.ok, text: res.text };
}
