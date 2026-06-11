/**
 * PM check (PRD §4.1.3) — the 5-hourly project-management sweep. Starts from the
 * inbox (the Category-B activity M2 batched), groups it by task, and runs one
 * agent pass to act over each group + sweep active work. The contract's PM-check
 * rules are the system prompt; this just hands over the worklist.
 */

import { MODEL, SUBTURTLE_APP_LIST_ID } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { BROWSER_TOOLS, CREATE_COMMENT_TOOL } from "../agent/policy.js";
import { renderPrompt } from "../prompts/load.js";
import { drainTo, readInbox, type InboxEvent } from "../memory/inbox.js";
import { buildTaskActivityDigest } from "../activity/digest.js";
import { getWorkspaceMembers, type Member } from "../clickup/rest.js";
import { parseCommentDirective, postPmComments } from "./pmComments.js";
import { setLastPmCheck } from "./state.js";

/** Cap how many tasks we pull a full activity tail for — bounds prompt size + GitHub search calls. */
const MAX_ACTIVITY_TASKS = 8;

/** Built-in fallback if prompts/pm-check.md is missing (the contract carries the real rules). */
const PM_CHECK_FALLBACK = [
  "This is your scheduled PM check — the project-management sweep in your contract.",
  "",
  "{{activity}}",
  "",
  "Work over each group per your contract, then sweep the active tasks in the Subturtle.app list (list id {{listId}}). If nothing is active, propose the next batch in the public channel.",
  "",
  "You CANNOT post task comments yourself on this run. To comment on a task, end your reply with ONLY this JSON object (no prose around it):",
  '  {"comments":[{"taskId":"<id>","replyTo":"<commentId or null>","mention":<userId or null>,"text":"<markdown>"}],"summary":"<one line>"}',
  "The app posts each comment for you with proper markdown and a real @-mention. Put \"text\" LAST in each object, write \\n for line breaks, and avoid double-quotes inside text. Use replyTo to thread under a comment (else a new root comment); set mention to the user id you're addressing. Empty comments array is fine if there's nothing worth posting.",
  "",
  "Team directory (id — name):",
  "{{directory}}",
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

/** Render the team directory the agent uses to pick a mention target by user id. */
function directoryBlock(members: Member[]): string {
  if (members.length === 0) return "  (directory unavailable — omit mentions this run)";
  return members.map((m) => `  - ${m.id} — ${m.name}${m.email ? ` <${m.email}>` : ""}`).join("\n");
}

/** Best-effort team directory; an empty list just means the agent posts without mentions. */
async function loadDirectory(): Promise<Member[]> {
  try {
    return await getWorkspaceMembers();
  } catch (err) {
    console.error("[pm-check] could not load team directory:", (err as Error).message);
    return [];
  }
}

export async function runPmCheck(): Promise<{ ok: boolean; text: string }> {
  const events = await readInbox();
  const grouped = events.length ? groupByTask(events) : { rendered: "", taskIds: [] };
  const tails = await activityTails(grouped.taskIds);
  const activity = events.length
    ? `Activity since your last check, grouped by task:\n${grouped.rendered}${tails ? `\n\n${tails}` : ""}`
    : "No new activity arrived since your last check.";

  const members = await loadDirectory();
  const task = await renderPrompt(
    "pm-check",
    { activity, listId: SUBTURTLE_APP_LIST_ID, directory: directoryBlock(members) },
    PM_CHECK_FALLBACK,
  );

  // Unattended run — never drive the browser on Navid's screen (see policy.ts).
  // Block the plain comment tool so the agent can't post raw `comment_text` (markdown
  // + @mentions would render as literal text); it emits a directive and the app posts
  // each comment with rich segments instead — same path as interactive @-mention replies.
  const res = await runAgent({
    task,
    model: MODEL.pm,
    disallowTools: [...BROWSER_TOOLS, CREATE_COMMENT_TOOL],
  });
  if (!res.ok) {
    console.error("[pm-check] run failed:", res.error);
    return { ok: false, text: res.text };
  }

  // Post the comments the agent asked for, with markdown + real mentions.
  const directive = parseCommentDirective(res.text);
  let outcomes: string[] = [];
  if (directive.comments.length > 0) {
    outcomes = await postPmComments(directive.comments, members);
    console.log(`[pm-check] posted ${outcomes.length} comment(s): ${outcomes.join("; ")}`);
  }

  await drainTo(); // archive the inbox only on success
  await setLastPmCheck(new Date().toISOString());
  // History is committed + pushed once a day by the scheduler's daily data push,
  // not per PM check — keeps the data-branch log to one commit a day.
  console.log("[pm-check] done");
  const summary = [directive.summary, outcomes.length ? `(${outcomes.length} comment(s) posted)` : ""]
    .filter(Boolean)
    .join(" ");
  return { ok: true, text: summary || res.text };
}
