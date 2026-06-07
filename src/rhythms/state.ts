/** Scheduler state (data/schedule.json) so rhythms survive restarts. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SCHEDULE_STATE_PATH } from "../config.js";

export interface ScheduleState {
  /** ISO timestamp of the last PM check. */
  lastPmCheckAt?: string;
  /** "YYYY-MM-DD" (in HEARTBEAT_TZ) of the last heartbeat. */
  lastHeartbeatDate?: string;
  /** "YYYY-MM-DD" (in HEARTBEAT_TZ) of the last successful daily data push. */
  lastDataPushDate?: string;
}

export async function readState(): Promise<ScheduleState> {
  try {
    return JSON.parse(await readFile(SCHEDULE_STATE_PATH, "utf8")) as ScheduleState;
  } catch {
    return {};
  }
}

async function writeState(s: ScheduleState): Promise<void> {
  await mkdir(dirname(SCHEDULE_STATE_PATH), { recursive: true });
  await writeFile(SCHEDULE_STATE_PATH, JSON.stringify(s, null, 2) + "\n", "utf8");
}

export async function setLastPmCheck(iso: string): Promise<void> {
  await writeState({ ...(await readState()), lastPmCheckAt: iso });
}

export async function setLastHeartbeat(dateStr: string): Promise<void> {
  await writeState({ ...(await readState()), lastHeartbeatDate: dateStr });
}

export async function setLastDataPush(dateStr: string): Promise<void> {
  await writeState({ ...(await readState()), lastDataPushDate: dateStr });
}
