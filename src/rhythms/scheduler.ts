/**
 * The rhythm scheduler: a 60s tick that fires the heartbeat (weekdays at
 * HEARTBEAT_HOUR in HEARTBEAT_TZ). State persists in data/schedule.json so a
 * restart doesn't double-fire and a missed heartbeat (downtime past 08:00) runs
 * once when the box returns. All runs go through the cross-process rhythm lock
 * so nothing overlaps.
 *
 * The PM check itself is no longer fired from here — it used to run on its own
 * fixed 5h clock (PM_CHECK_INTERVAL_MS), which ran independently of the
 * agent-owned "pm-check" job in the generic scheduler below (Navid's 10:00 +
 * 16:00 cron). The two overlapped and produced several PM-check-shaped runs a
 * day. The generic-scheduler job is the one Navid actually configured, so it's
 * now the only source of scheduled PM checks; rhythms/pmCheck.ts (runPmCheck)
 * stays as-is for manual triggers (CLI, chat/task "run pm-check" command).
 */

import { DATA_PUSH_HOUR, HEARTBEAT_HOUR, HEARTBEAT_TZ } from "../config.js";
import { commitHistory } from "../history/commit.js";
import { runHeartbeat } from "./heartbeat.js";
import { runExclusive } from "./lock.js";
import { readState, setLastDataPush } from "./state.js";
import { isWeekday, localParts } from "./time.js";
import { continuingJobs, dueJobs, runScheduledJob } from "./schedules.js";
import { dueWorkflows, runWorkflowGenerate } from "../workflows/registry.js";

const TICK_MS = 60_000;

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
  let stopped = false;
  let ticking = false;

  const tick = async (): Promise<void> => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      const now = new Date();
      if (await heartbeatDue(now)) {
        await runExclusive("heartbeat", runHeartbeat);
      }
      // Resume any job that checkpointed mid-flight last time, BEFORE starting fresh
      // cron-due ones — so a long, chunked task keeps making progress each tick. dueJobs
      // skips jobs with a live continuation, so a job is never both resumed and restarted.
      for (const job of await continuingJobs()) {
        await runExclusive(`schedule:${job.id}`, () => runScheduledJob(job, now));
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
    `[scheduler] started — heartbeat weekdays ${HEARTBEAT_HOUR}:00 ${HEARTBEAT_TZ}, ` +
      `daily data push ${DATA_PUSH_HOUR}:00 ${HEARTBEAT_TZ} (now ${hb.dateStr} ${hb.hour}:00 local)`,
  );

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
