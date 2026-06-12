/**
 * The rhythm scheduler: a 60s tick that fires the PM check (every 5h) and the
 * heartbeat (weekdays at HEARTBEAT_HOUR in HEARTBEAT_TZ). State persists in
 * data/schedule.json so a restart doesn't double-fire and a missed heartbeat
 * (downtime past 08:00) runs once when the box returns. All runs go through the
 * cross-process rhythm lock so nothing overlaps.
 */

import { DATA_PUSH_HOUR, HEARTBEAT_HOUR, HEARTBEAT_TZ, PM_CHECK_INTERVAL_MS } from "../config.js";
import { commitHistory } from "../history/commit.js";
import { runHeartbeat } from "./heartbeat.js";
import { runExclusive } from "./lock.js";
import { runPmCheck } from "./pmCheck.js";
import { readState, setLastDataPush, setLastPmCheck } from "./state.js";
import { isWeekday, localParts } from "./time.js";
import { dueJobs, runScheduledJob } from "./schedules.js";
import { dueWorkflows, runWorkflowGenerate } from "../workflows/registry.js";

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

async function dataPushDue(now: Date): Promise<boolean> {
  const { dateStr, hour } = localParts(HEARTBEAT_TZ, now);
  if (hour < DATA_PUSH_HOUR) return false; // not yet end of day
  const { lastDataPushDate } = await readState();
  return lastDataPushDate !== dateStr; // once per day, every day (incl. weekends)
}

/** Commit + push the agent's history once a day; mark the day done only when in sync. */
async function pushDailyData(now: Date): Promise<void> {
  const { dateStr } = localParts(HEARTBEAT_TZ, now);
  const inSync = await commitHistory(`data ${dateStr}`);
  if (inSync) await setLastDataPush(dateStr);
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
      // Agent-owned recurring jobs (the generic scheduler). Each runs under the same
      // exclusive lock so it never overlaps a rhythm or another job.
      for (const job of await dueJobs(now)) {
        await runExclusive(`schedule:${job.id}`, () => runScheduledJob(job, now));
      }
      // Workflow generate-steps (the workflow facility). Same lock, same catch-up.
      for (const wf of await dueWorkflows(now)) {
        await runExclusive(`workflow:${wf.id}`, () => runWorkflowGenerate(wf, now));
      }
      // Independent of the rhythms: push the day's history once, at end of day.
      if (await dataPushDue(now)) await pushDailyData(now);
    } catch (err) {
      console.error("[scheduler] tick error:", (err as Error).message);
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  // Run one tick right away (setInterval waits a full TICK_MS first) so a restart that
  // straddled a scheduled minute catches up promptly instead of after the first interval.
  void tick();
  const hb = localParts(HEARTBEAT_TZ);
  console.log(
    `[scheduler] started — PM check every ${Math.round(PM_CHECK_INTERVAL_MS / 3_600_000)}h, ` +
      `heartbeat weekdays ${HEARTBEAT_HOUR}:00 ${HEARTBEAT_TZ}, ` +
      `daily data push ${DATA_PUSH_HOUR}:00 ${HEARTBEAT_TZ} (now ${hb.dateStr} ${hb.hour}:00 local)`,
  );

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
