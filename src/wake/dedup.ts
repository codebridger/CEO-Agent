/**
 * Idempotency guard for wakes. The same comment or chat message can reach
 * handleWake more than once:
 *   - ClickUp re-delivers a webhook (the tunnel/Cloudflare hiccups, or it just
 *     does), and we re-process it;
 *   - categorize() always resolves the *latest* non-agent comment on the task,
 *     so any second taskCommentPosted-class event re-wakes on the same comment;
 *   - in theory the poller and a webhook could both surface the same activity.
 * withLock() only serializes these — it still runs both, so the agent answers
 * twice (and on the second pass sees its own first reply and says "this is the
 * same message again"). Dedup on a stable id (comment id / chat message id)
 * kills the repeat before any work happens.
 *
 * In-memory only on purpose: on restart the poller baselines its cursors to the
 * latest message and ClickUp won't re-deliver already-acked events, so there is
 * nothing to replay — a fresh empty set is correct.
 */

const TTL_MS = 60 * 60 * 1000; // remember an event for an hour
const MAX = 5000; // hard cap so the map can't grow unbounded

const seen = new Map<string, number>(); // eventId -> first-seen epoch ms

function prune(now: number): void {
  for (const [k, t] of seen) {
    if (now - t > TTL_MS) seen.delete(k);
  }
  // If still over cap (a burst within the TTL), drop oldest insertions first.
  if (seen.size > MAX) {
    const overflow = seen.size - MAX;
    let i = 0;
    for (const k of seen.keys()) {
      seen.delete(k);
      if (++i >= overflow) break;
    }
  }
}

/**
 * Record an event as handled. Returns true the first time a given id is seen,
 * false on any repeat within the TTL window. Synchronous so two near-simultaneous
 * calls can't both pass: the first marks, the second sees it.
 */
export function markEventSeen(eventId: string): boolean {
  const now = Date.now();
  const last = seen.get(eventId);
  if (last !== undefined && now - last <= TTL_MS) return false;
  seen.set(eventId, now);
  if (seen.size > MAX) prune(now);
  return true;
}
