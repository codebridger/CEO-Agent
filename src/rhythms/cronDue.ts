/**
 * Shared "is this cron occurrence due?" logic for the agent's recurring work
 * (scheduled jobs and workflow generate-steps). Extracted so both schedulers use
 * the same catch-up semantics rather than drifting apart.
 *
 * If the box was down across a scheduled minute, the next tick still fires the
 * occurrence — as long as it was within MAX_CATCHUP_MS. Older misses are dropped
 * (don't run a stale morning job in the evening), and multiple misses collapse to
 * a single run because we only look at the most-recent occurrence.
 */

import { cronMatches } from "./cron.js";
import { cronFields } from "./time.js";

export const MAX_CATCHUP_MS = 6 * 60 * 60 * 1000;
const MAX_CATCHUP_MIN = Math.floor(MAX_CATCHUP_MS / 60_000);

/** The most recent cron occurrence at or before `now`, within the catch-up window (else null). */
export function prevOccurrence(cron: string, tz: string, now: Date): Date | null {
  for (let i = 0; i <= MAX_CATCHUP_MIN; i++) {
    const t = new Date(now.getTime() - i * 60_000);
    let m = false;
    try {
      m = cronMatches(cron, cronFields(tz, t));
    } catch (err) {
      console.error(`[cron] bad cron "${cron}":`, (err as Error).message);
      return null;
    }
    if (m) return new Date(Math.floor(t.getTime() / 60_000) * 60_000); // floored to the minute
  }
  return null;
}

/**
 * Is an occurrence due now? True when the most-recent scheduled occurrence (within
 * the catch-up window) is newer than `baselineMs` — the later of the item's last run
 * and its creation time — so it never double-fires and never retro-fires for
 * occurrences from before it existed.
 */
export function occurrenceDue(cron: string, tz: string, now: Date, baselineMs: number): boolean {
  const occ = prevOccurrence(cron, tz, now);
  if (!occ) return false;
  return baselineMs < occ.getTime();
}
