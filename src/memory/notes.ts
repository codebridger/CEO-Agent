/**
 * Standing memory — durable facts the agent chooses to remember, surviving across
 * runs (PRD §3 memory). Episodic thread files are per-conversation and get compacted
 * away; this file is the agent's long-term notebook: one timestamped fact per line,
 * loaded verbatim into EVERY run (see agent/runner.ts) so it's always in front of her.
 *
 * Written only through appendNote (the verified `remember` chat action), the same
 * app-performs-the-write pattern as chat delivery — the agent asks, the app records
 * the true outcome. Lives under data/memory/ and is published to the agent's data
 * branch by the history commit (it's in HISTORY_SUBDIRS).
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { MEMORY_DIR, NOTES_PATH } from "../config.js";

const HEADER =
  "# Aso's standing memory\n\n" +
  "Durable facts I've chosen to remember. Each line is one fact, dated when it was added.\n\n";

/** The current standing memory (empty string if nothing has been remembered yet). */
export async function readStandingMemory(): Promise<string> {
  try {
    return await readFile(NOTES_PATH, "utf8");
  } catch {
    return "";
  }
}

/** Today's date as YYYY-MM-DD, for stamping a note. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append one durable fact. Returns the line as stored (for the action outcome).
 * Creates the file with a header on first use. `via` records who prompted it.
 */
export async function appendNote(text: string, via?: string): Promise<string> {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("nothing to remember (empty note)");

  await mkdir(MEMORY_DIR, { recursive: true });
  const existing = await readStandingMemory();
  if (!existing.trim()) await writeFile(NOTES_PATH, HEADER, "utf8");

  const line = `- (${today()}${via ? `, via ${via}` : ""}) ${clean}`;
  await appendFile(NOTES_PATH, line + "\n", "utf8");
  return line;
}
