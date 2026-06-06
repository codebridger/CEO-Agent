/**
 * The rhythm scheduler: a 60s tick that fires the PM check (every 5h) and the
 * heartbeat (weekdays at HEARTBEAT_HOUR in HEARTBEAT_TZ). State persists in
 * data/schedule.json so a restart doesn't double-fire and a missed heartbeat
 * (downtime past 08:00) runs once when the box returns. All runs go through the
 * cross-process rhythm lock so nothing overlaps.
 */

import { HEARTBEAT_HOUR, HEARTBEAT_TZ, PM_CHECK_INTERVAL_MS } from "../config.js";
import { runHeartbeat } from "./heartbeat.js";
import { runExclusive } from "./lock.js";
import { runPmCheck } from "./pmCheck.js";
import { readState, setLastPmCheck } from "./state.js";
import { isWeekday, localParts } from "./time.js";

const TICK_MS = 60_000;

async function pmCheckDue(now: Date): Promise<boolean> {
  const { lastPmCheckAt } = await readState();
  if (!lastPmCheckAt) return false; // baselined on first start
  return now.getTime() - new Date(lastPmCheckAt).getTime() >= PM_CHECK_INTERVAL_MS;
}

async function heartbeatDue(now: Date): Promise<boolean> {
  const { dateStr, hour, weekday } = localParts(HEARTBEAT_TZ, now);
  if (!isWeekday(weekday) || hour < HEARTBEAT_HOUR) return false;
  const { lastHeartbeatDate } = await readState();
  return lastHeartbeatDate !== dateStr; // once per day
}

/** Start the scheduler loop. Returns a stop function. */
export async function startScheduler(): Promise<() => void> {
  // Baseline the PM clock on first ever start so it doesn't fire immediately.
  const s = await readState();
  if (!s.lastPmCheckAt) await setLastPmCheck(new Date().toISOString());

  let stopped = false;
  let ticking = false;

  const tick = async (): Promise<void> => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      const now = new Date();
      if (await heartbeatDue(now)) {
        await runExclusive("heartbeat", runHeartbeat);
      } else if (await pmCheckDue(now)) {
        await runExclusive("pm-check", runPmCheck);
      }
    } catch (err) {
      console.error("[scheduler] tick error:", (err as Error).message);
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  const hb = localParts(HEARTBEAT_TZ);
  console.log(
    `[scheduler] started — PM check every ${Math.round(PM_CHECK_INTERVAL_MS / 3_600_000)}h, ` +
      `heartbeat weekdays ${HEARTBEAT_HOUR}:00 ${HEARTBEAT_TZ} (now ${hb.dateStr} ${hb.hour}:00 local)`,
  );

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
