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
import { LONG_JOB_TIMEOUT_MS, MODEL, SCHEDULES_PATH } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { BROWSER_TOOLS } from "../agent/policy.js";
import { occurrenceDue } from "./cronDue.js";
import { minuteKey } from "./time.js";

/** Hard cap on the number of jobs, so a runaway can't schedule unbounded autonomous runs. */
export const MAX_JOBS = 25;

/**
 * Hard cap on how many chunks a single multi-run (checkpointed) task may take before the
 * scheduler stops resuming it — a backstop so a job that never reports "done" can't loop
 * forever. The agent is warned on its last allowed chunk so it can wrap up cleanly.
 */
export const MAX_CONTINUATIONS = 20;

/**
 * How many times a resume may fail/time out in a row before the scheduler gives up on a
 * mid-flight job (clears its checkpoint) instead of retrying the same stuck chunk forever.
 */
export const MAX_CHUNK_FAILURES = 3;

export interface Job {
  id: string;
  title: string;
  /** Standard 5-field cron, evaluated in `tz`. */
  cron: string;
  tz: string;
  /** The instructions the agent runs each time the job fires. */
  task: string;
  enabled: boolean;
  /**
   * "Long" job: gets the 20-min budget (LONG_JOB_TIMEOUT_MS) and the browser, for heavy
   * tasks that can't finish in the default 5 min / need to drive Chrome. Browser-enabled,
   * so it's gated to Navid's authority at the action layer. Defaults to false (short, no
   * browser) for normal unattended jobs.
   */
  long?: boolean;
  /**
   * Checkpoint state for a job that didn't finish in one run. When the agent decides the
   * work is too big for a single bounded run, it saves what it has done / what is left
   * here, and the scheduler re-runs the job (resuming from this state) on later ticks until
   * it reports done. Absent = the job is not mid-flight. See runScheduledJob.
   */
  continuation?: {
    /** Free-form note the agent wrote for its future self: progress so far + what remains. */
    state: string;
    /** How many chunks have run for the current multi-run task — capped at MAX_CONTINUATIONS. */
    iterations: number;
    /** Consecutive failed/timed-out resumes since the last good chunk — capped at MAX_CHUNK_FAILURES. */
    failures?: number;
    /** ISO time the current multi-run task started (for logging / staleness). */
    startedAt: string;
  };
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
  long?: boolean;
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
    if (input.long !== undefined) existing.long = input.long;
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
    long: input.long ?? false,
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
 * Enabled jobs that are due now, INCLUDING a single catch-up for an occurrence missed
 * while the app was down (see cronDue.ts for the shared catch-up semantics).
 */
export async function dueJobs(now: Date): Promise<Job[]> {
  const store = await read();
  const due: Job[] = [];
  for (const job of store.jobs) {
    if (!job.enabled) continue;
    if (job.continuation) continue; // mid-flight — resumed by continuingJobs(), not restarted from cron
    if (job.lastRunMinute === minuteKey(job.tz, now)) continue; // already fired this minute
    const lastRun = job.lastRunAt ? new Date(job.lastRunAt).getTime() : 0;
    const baseline = Math.max(lastRun, new Date(job.createdAt).getTime());
    if (occurrenceDue(job.cron, job.tz, now, baseline)) due.push(job);
  }
  return due;
}

/**
 * Enabled jobs that are mid-flight (have saved continuation state) and so should be
 * resumed this tick regardless of their cron. Run BEFORE dueJobs so in-progress work
 * makes steady progress; dueJobs skips these so cron never restarts them from scratch.
 */
export async function continuingJobs(): Promise<Job[]> {
  const store = await read();
  return store.jobs.filter((j) => j.enabled && j.continuation);
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

/** Persist (or clear, with null) a job's checkpoint state after a chunk runs. */
async function setContinuation(id: string, continuation: Job["continuation"] | null): Promise<void> {
  const store = await read();
  const job = store.jobs.find((j) => j.id === id);
  if (!job) return;
  if (continuation) job.continuation = continuation;
  else delete job.continuation;
  await write(store);
}

interface JobStep {
  status: "continue" | "done";
  /** The state to carry into the next run — only meaningful when status === "continue". */
  state: string;
  summary: string;
}

/**
 * Detect a checkpoint directive in a scheduled run's output:
 *   {"continue": {"state": "...", "summary": "..."}}  → more work to do, resume next tick
 *   {"done": {"summary": "..."}}                       → finished
 * Anything that doesn't parse is treated by the caller as a normal one-shot completion.
 * Tries the whole string, a fenced block, then the first {...} span (mirrors parseLongJob).
 */
function parseJobStep(raw: string): JobStep | null {
  const tryParse = (s: string): JobStep | null => {
    try {
      const o = JSON.parse(s) as {
        continue?: { state?: unknown; summary?: unknown };
        done?: { summary?: unknown };
      };
      if (o?.continue) {
        const state = String(o.continue.state ?? "").trim();
        return state ? { status: "continue", state, summary: String(o.continue.summary ?? "").trim() } : null;
      }
      if (o?.done) return { status: "done", state: "", summary: String(o.done.summary ?? "").trim() };
      return null;
    } catch {
      return null;
    }
  };
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const brace = raw.match(/\{[\s\S]*\}/);
  return (
    tryParse(raw.trim()) ||
    (fence?.[1] ? tryParse(fence[1].trim()) : null) ||
    (brace?.[0] ? tryParse(brace[0]) : null)
  );
}

/** Build the prompt for one chunk of a scheduled job (fresh start or a resume). */
function buildScheduledPrompt(job: Job, budgetLabel: string, lastChunk: boolean): string {
  const resuming = job.continuation;
  return [
    `This is your scheduled job "${job.title}" (id ${job.id}, cron "${job.cron}" ${job.tz}).`,
    "Run it now, following your contract. You are unattended:",
    job.long
      ? "this is a LONG job — you may use the browser if the task needs it."
      : "do not use the browser.",
    "Do not claim to have posted anywhere you cannot actually reach.",
    "",
    resuming
      ? [
          "You are RESUMING this job — you already did part of it on an earlier run. The state you saved last time:",
          "---",
          job.continuation!.state,
          "---",
          `This is run ${job.continuation!.iterations + 1}. Pick up exactly from that state` +
            (job.long ? " (your browser session from last time is still open)." : "."),
        ].join("\n")
      : "",
    "",
    `You have about ${budgetLabel} for THIS run — it may not be enough to finish the whole job, and that is fine.`,
    "Work in chunks and CHECKPOINT before you run out of time. When you stop, output ONLY one of these JSON objects,",
    "nothing else (no prose):",
    '  - More work remains: {"continue": {"state": "<everything your next run needs: what you finished, what is left,',
    '    exactly where you are>", "summary": "<one line of progress>"}}',
    '  - The whole job is finished (or there was nothing to do): {"done": {"summary": "<what you accomplished>"}}',
    lastChunk
      ? `NOTE: this is your LAST allowed run for this task (the ${MAX_CONTINUATIONS}-chunk cap). Finish what you can and` +
        ' report {"done"} — you will NOT get another run, so do not return {"continue"}.'
      : "Write the state so a future you with no other memory could resume cleanly.",
    "",
    "The job:",
    job.task,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Run one chunk of a scheduled job: stamp it (so a crash mid-run doesn't re-fire it next
 * tick), run the agent with the job's task (resuming from saved state if this is a
 * continuation), then read the agent's checkpoint directive:
 *
 *  - {"continue": {state}} → work remains; save the state so the next tick resumes it.
 *  - {"done"} / plain text  → finished; clear any continuation.
 *
 * Each chunk is BOUNDED (default 5 min; 20 min for a `long` job, which also gets the
 * browser). Big work spans many bounded chunks instead of one open-ended run, so a chunk
 * never freezes the rhythm system and progress survives a restart. A hard MAX_CONTINUATIONS
 * cap stops a job that never reports done. Nobody is watching, so the prompt still forbids
 * claiming a post it can't actually make.
 */
export async function runScheduledJob(job: Job, now: Date = new Date()): Promise<void> {
  await markRan(job.id, now);

  const iterations = job.continuation?.iterations ?? 0;
  const lastChunk = iterations >= MAX_CONTINUATIONS - 1;
  const timeoutMs = job.long ? LONG_JOB_TIMEOUT_MS : undefined;
  const budgetLabel = job.long ? `${Math.round((timeoutMs ?? 0) / 60_000)} minutes` : "5 minutes";

  const res = await runAgent({
    task: buildScheduledPrompt(job, budgetLabel, lastChunk),
    model: MODEL.pm,
    timeoutMs,
    disallowTools: job.long ? [] : BROWSER_TOOLS,
  });

  const tag = `${job.id} (${job.title})${job.long ? " [long]" : ""}${job.continuation ? ` [resume ${iterations}]` : ""}`;
  if (!res.ok) {
    // A fresh job that fails just waits for its next cron occurrence. A mid-flight job
    // retries from its checkpoint next tick — but only up to MAX_CHUNK_FAILURES in a row,
    // so a permanently-stuck chunk can't loop forever.
    if (job.continuation) {
      const failures = (job.continuation.failures ?? 0) + 1;
      if (failures >= MAX_CHUNK_FAILURES) {
        await setContinuation(job.id, null);
        console.log(`[schedule] ran ${tag}: GAVE UP after ${failures} failed resumes — ${res.error}`);
      } else {
        await setContinuation(job.id, { ...job.continuation, failures });
        console.log(`[schedule] ran ${tag}: FAILED ${res.error} (resume ${failures}/${MAX_CHUNK_FAILURES})`);
      }
    } else {
      console.log(`[schedule] ran ${tag}: FAILED ${res.error}`);
    }
    return;
  }

  const step = parseJobStep(res.text);
  if (step?.status === "continue" && !lastChunk) {
    await setContinuation(job.id, {
      state: step.state,
      iterations: iterations + 1,
      failures: 0, // a good chunk resets the consecutive-failure count
      startedAt: job.continuation?.startedAt ?? now.toISOString(),
    });
    console.log(`[schedule] ran ${tag}: CONTINUE (${iterations + 1}/${MAX_CONTINUATIONS}) — ${step.summary || "…"}`);
    return;
  }

  // done, plain completion, or the cap was hit — clear the checkpoint either way.
  await setContinuation(job.id, null);
  const why = step?.status === "continue" && lastChunk ? "DONE (continuation cap hit)" : "DONE";
  console.log(`[schedule] ran ${tag}: ${why} — ${step?.summary || res.text.slice(0, 160) || "ok"}`);
}

/** One-line human description of a job, for the agent's context and outcome strings. */
export function describeJob(j: Job): string {
  return `${j.id} — "${j.title}" — cron "${j.cron}" ${j.tz}${j.long ? " [long]" : ""}${j.enabled ? "" : " (disabled)"}`;
}
