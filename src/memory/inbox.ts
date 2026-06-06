/**
 * Event inbox (PRD §4.1.2): an append-only log of Category-B activity events.
 * The listener writes here; the (M3) PM check reads + archives. Never silently
 * dropped — `drainTo` moves processed lines to processed.jsonl.
 */

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { EVENTS_DIR, INBOX_PATH, PROCESSED_PATH } from "../config.js";

export interface InboxEvent {
  ts: string; // ISO timestamp the listener received it
  event: string; // ClickUp event type
  taskId?: string;
  threadId: string;
  author?: number;
  summary: string;
}

async function ensureDir(): Promise<void> {
  await mkdir(EVENTS_DIR, { recursive: true });
}

/** Append one Category-B event as a JSON line. */
export async function appendEvent(rec: InboxEvent): Promise<void> {
  await ensureDir();
  await appendFile(INBOX_PATH, JSON.stringify(rec) + "\n", "utf8");
}

/** Read all pending inbox events (used by the M3 PM check). */
export async function readInbox(): Promise<InboxEvent[]> {
  try {
    const raw = await readFile(INBOX_PATH, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as InboxEvent);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Archive everything currently in the inbox to processed.jsonl and clear the
 * inbox. Returns the drained events. The M3 PM check calls this after acting.
 */
export async function drainTo(): Promise<InboxEvent[]> {
  const events = await readInbox();
  if (events.length === 0) return [];
  await mkdir(dirname(PROCESSED_PATH), { recursive: true });
  const stamped = events.map((e) => JSON.stringify({ ...e, processedAt: new Date().toISOString() }) + "\n");
  await appendFile(PROCESSED_PATH, stamped.join(""), "utf8");
  // Move-then-truncate: rename to a temp first so a crash can't lose events.
  await rename(INBOX_PATH, INBOX_PATH + ".draining").catch(() => {});
  await writeFile(INBOX_PATH, "", "utf8");
  await writeFile(INBOX_PATH + ".draining", "").catch(() => {});
  return events;
}
