/**
 * Thread files (PRD §4.2) — the agent's episodic memory. One markdown file per
 * conversation thread, named by source + id (e.g. `clickup-task-86exu5xd7.md`,
 * `chat-8crzyb7-1458.md`), plus an INDEX.md with one line per thread.
 *
 * The app owns these files (deterministic): the wake handler loads the history,
 * passes it to the agent as context, then records the inbound message and the agent's
 * reply here. The agent is asked only to read + reply, not to manage files.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { THREAD_COMPACT_BYTES, THREAD_INDEX_PATH, THREADS_DIR } from "../config.js";
import { MODEL } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { BROWSER_TOOLS } from "../agent/policy.js";

/** A thread id is a filesystem-safe slug, e.g. "clickup-task-86exu5xd7" or "chat-8crzyb7-1458". */
export function threadFile(threadId: string): string {
  return join(THREADS_DIR, `${threadId}.md`);
}

async function ensureDir(): Promise<void> {
  await mkdir(THREADS_DIR, { recursive: true });
}

/** Full current contents of a thread file ("" if it doesn't exist yet). */
export async function loadThread(threadId: string): Promise<string> {
  try {
    return await readFile(threadFile(threadId), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

/** Append one turn to a thread file as a timestamped markdown block. */
export async function appendTurn(threadId: string, who: string, text: string): Promise<void> {
  await ensureDir();
  const block = `\n### ${who} · ${new Date().toISOString()}\n\n${text.trim()}\n`;
  const path = threadFile(threadId);
  const existing = await loadThread(threadId);
  const header = existing ? "" : `# Thread ${threadId}\n`;
  await writeFile(path, existing + header + block, "utf8");
}

/**
 * INDEX.md: one line per thread — `- <id> · last <iso> · <state>`. Upsert the
 * line for this thread (read the index the agent reads first, replace or append).
 */
export async function upsertIndex(threadId: string, state: string): Promise<void> {
  await ensureDir();
  let lines: string[] = [];
  try {
    const raw = await readFile(THREAD_INDEX_PATH, "utf8");
    lines = raw.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const line = `- ${threadId} · last ${new Date().toISOString()} · ${state.replace(/\n/g, " ").slice(0, 120)}`;
  const idx = lines.findIndex((l) => l.startsWith(`- ${threadId} `));
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  await writeFile(THREAD_INDEX_PATH, `# Thread index\n\n${lines.join("\n")}\n`, "utf8");
}

/**
 * Compaction (PRD §4.2.4): once a thread file passes the size limit, summarize
 * the older portion into a "story so far" block and keep recent turns verbatim.
 * Best-effort — a compaction failure is logged and the thread is left intact.
 */
export async function maybeCompact(threadId: string): Promise<void> {
  const path = threadFile(threadId);
  let size = 0;
  try {
    size = (await stat(path)).size;
  } catch {
    return;
  }
  if (size <= THREAD_COMPACT_BYTES) return;

  const full = await loadThread(threadId);
  // Keep the most recent ~40% of turns verbatim; summarize the head.
  const turns = full.split(/\n(?=### )/);
  const keepFrom = Math.max(1, Math.floor(turns.length * 0.6));
  const head = turns.slice(0, keepFrom).join("\n");
  const tail = turns.slice(keepFrom).join("\n");
  if (!head.trim()) return;

  try {
    const res = await runAgent({
      model: MODEL.pm,
      includeMemory: false, // summarizing a thread; standing memory would muddy the summary
      task: [
        "Summarize the conversation history below into a tight 'story so far' — who is involved,",
        "what was discussed, what was decided or agreed, and any open threads. Plain English,",
        "no preamble, just the summary. This replaces the older messages in a memory file.",
        "",
        "---",
        head,
      ].join("\n"),
      timeoutMs: 120_000,
      // Maintenance run — no browser, no notification ping (see policy.ts).
      disallowTools: BROWSER_TOOLS,
    });
    if (!res.ok || !res.text.trim()) return;
    const rebuilt =
      `# Thread ${threadId}\n\n## Story so far (compacted ${new Date().toISOString()})\n\n` +
      `${res.text.trim()}\n\n## Recent\n${tail}`;
    await writeFile(path, rebuilt, "utf8");
  } catch (err) {
    console.error(`[threads] compaction failed for ${threadId}:`, (err as Error).message);
  }
}
