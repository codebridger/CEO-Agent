/**
 * Agent-owned recurring jobs — the generic scheduler Aso manages herself via the
 * `schedule` / `unschedule` chat actions. Each job is a cron expression + a task
 * prompt she runs unattended on that cadence (e.g. "top up the LinkedIn idea
 * backlog every Monday"). Persisted in data/schedules.json so jobs survive restarts.
 *
 * Acting stays inside the agent run, which goes through the same unattended policy as
 * the heartbeat/PM check: the browser is disallowed (no driving Navid's screen on a
 * timer). Publishing to external surfaces is intentionally NOT part of this — that's a
 * separate browser/credential decision.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { MODEL, SCHEDULES_PATH } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { BROWSER_TOOLS } from "../agent/policy.js";
import { cronMatches } from "./cron.js";
import { cronFields, minuteKey } from "./time.js";

/** Hard cap on the number of jobs, so a runaway can't schedule unbounded autonomous runs. */
export const MAX_JOBS = 25;

export interface Job {
  id: string;
  title: string;
  /** Standard 5-field cron, evaluated in `tz`. */
  cron: string;
  tz: string;
  /** The instructions the agent runs each time the job fires. */
  task: string;
  enabled: boolean;
  createdAt: string;
  createdBy?: string;
  lastRunAt?: string;
  /** "YYYY-MM-DD HH:MM" (in tz) of the last fire — guards against double-firing in a minute. */
  lastRunMinute?: string;
}

interface Store {
  jobs: Job[];
}

async function read(): Promise<Store> {
  try {
    const raw = await readFile(SCHEDULES_PATH, "utf8");
    const s = JSON.parse(raw) as Store;
    return { jobs: Array.isArray(s.jobs) ? s.jobs : [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { jobs: [] };
    throw err;
  }
}

async function write(store: Store): Promise<void> {
  await mkdir(dirname(SCHEDULES_PATH), { recursive: true });
  await writeFile(SCHEDULES_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function listJobs(): Promise<Job[]> {
  return (await read()).jobs;
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "job"
  );
}

export interface UpsertInput {
  id?: string;
  title: string;
  cron: string;
  tz: string;
  task: string;
  enabled?: boolean;
  createdBy?: string;
}

/**
 * Create or update a job. Returns `{ job }` on success or `{ error }` if the cap is hit
 * (cron validity/safety is checked by the caller). Update matches on `id`.
 */
export async function upsertJob(input: UpsertInput): Promise<{ job?: Job; error?: string }> {
  const store = await read();
  const existing = input.id ? store.jobs.find((j) => j.id === input.id) : undefined;

  if (!existing && store.jobs.length >= MAX_JOBS) {
    return { error: `at the ${MAX_JOBS}-job limit — remove one before adding another` };
  }

  if (existing) {
    existing.title = input.title;
    existing.cron = input.cron;
    existing.tz = input.tz;
    existing.task = input.task;
    if (input.enabled !== undefined) existing.enabled = input.enabled;
    await write(store);
    return { job: existing };
  }

  const id = `job-${slug(input.title)}-${Date.now().toString(36)}`;
  const job: Job = {
    id,
    title: input.title,
    cron: input.cron,
    tz: input.tz,
    task: input.task,
    enabled: input.enabled ?? true,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  store.jobs.push(job);
  await write(store);
  return { job };
}

/** Remove a job by id. Returns the removed job's title, or null if no such id. */
export async function removeJob(id: string): Promise<string | null> {
  const store = await read();
  const job = store.jobs.find((j) => j.id === id);
  if (!job) return null;
  store.jobs = store.jobs.filter((j) => j.id !== id);
  await write(store);
  return job.title;
}

/**
 * How far back to catch up a missed occurrence. If the box was down (or restarting)
 * across a job's scheduled minute, the next tick still fires it — as long as the
 * occurrence was within this window. Misses older than this are dropped (don't run a
 * stale morning job in the evening), and multiple misses collapse to a single run.
 */
export const MAX_CATCHUP_MS = 6 * 60 * 60 * 1000;
const MAX_CATCHUP_MIN = Math.floor(MAX_CATCHUP_MS / 60_000);

/** The most recent cron occurrence at or before `now`, within the catch-up window (else null). */
function prevOccurrence(cron: string, tz: string, now: Date): Date | null {
  for (let i = 0; i <= MAX_CATCHUP_MIN; i++) {
    const t = new Date(now.getTime() - i * 60_000);
    let m = false;
    try {
      m = cronMatches(cron, cronFields(tz, t));
    } catch (err) {
      console.error(`[schedule] bad cron "${cron}":`, (err as Error).message);
      return null;
    }
    if (m) return new Date(Math.floor(t.getTime() / 60_000) * 60_000); // floored to the minute
  }
  return null;
}

/**
 * Enabled jobs that are due now, INCLUDING a single catch-up for an occurrence missed
 * while the app was down. A job is due if its most-recent scheduled occurrence (within
 * the catch-up window) is newer than the later of its last run and its creation time —
 * so it never double-fires, and never retro-fires for occurrences before it existed.
 */
export async function dueJobs(now: Date): Promise<Job[]> {
  const store = await read();
  const due: Job[] = [];
  for (const job of store.jobs) {
    if (!job.enabled) continue;
    if (job.lastRunMinute === minuteKey(job.tz, now)) continue; // already fired this minute
    const occ = prevOccurrence(job.cron, job.tz, now);
    if (!occ) continue; // no scheduled occurrence inside the look-back window
    const lastRun = job.lastRunAt ? new Date(job.lastRunAt).getTime() : 0;
    const baseline = Math.max(lastRun, new Date(job.createdAt).getTime());
    if (baseline >= occ.getTime()) continue; // this occurrence already ran (or predates the job)
    due.push(job);
  }
  return due;
}

/** Record that a job fired at `now` (sets lastRunAt + the minute guard). */
async function markRan(id: string, now: Date): Promise<void> {
  const store = await read();
  const job = store.jobs.find((j) => j.id === id);
  if (!job) return;
  job.lastRunAt = now.toISOString();
  job.lastRunMinute = minuteKey(job.tz, now);
  await write(store);
}

/**
 * Run one scheduled job: stamp it (so a crash mid-run doesn't re-fire it next tick),
 * then run the agent unattended (browser disallowed) with the job's task as the prompt.
 */
export async function runScheduledJob(job: Job, now: Date = new Date()): Promise<void> {
  await markRan(job.id, now);
  const task = [
    `This is your scheduled job "${job.title}" (id ${job.id}, cron "${job.cron}" ${job.tz}).`,
    "Run it now, following your contract. You are unattended: do not use the browser, and do not",
    "claim to have posted anywhere you cannot actually reach. If there is nothing to do, say so briefly.",
    "",
    "The job:",
    job.task,
  ].join("\n");
  const res = await runAgent({ task, model: MODEL.pm, disallowTools: BROWSER_TOOLS });
  console.log(
    `[schedule] ran ${job.id} (${job.title}): ${res.ok ? "ok" : `FAILED ${res.error}`}` +
      (res.ok && res.text ? ` — ${res.text.slice(0, 160)}` : ""),
  );
}

/** One-line human description of a job, for the agent's context and outcome strings. */
export function describeJob(j: Job): string {
  return `${j.id} — "${j.title}" — cron "${j.cron}" ${j.tz}${j.enabled ? "" : " (disabled)"}`;
}
