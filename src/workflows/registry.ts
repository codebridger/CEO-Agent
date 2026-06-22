/**
 * Agent-owned workflows — the facility that lets Aso stand up a new repeatable,
 * human-in-the-loop process from chat (the `workflow` action), without a code change.
 *
 * A workflow is a richer scheduled job with three extra dimensions a plain `schedule`
 * job lacks:
 *   - a **playbook** (WORKFLOWS_DIR/<stem>.md) — the rules the runs follow, written by
 *     Aso when she sets up the workflow and saved in her own data (NOT the code repo),
 *     so it takes effect with no PR or restart;
 *   - a **model** tier (sonnet | opus) — so a workflow can reason on Opus;
 *   - a **ClickUp list binding** — so the two halves share one playbook + model:
 *       1. GENERATE (recurring, unattended): the cron fires and Aso drafts into the
 *          bound list (this module);
 *       2. ITERATE (interactive): a comment on a task in that list wakes Aso with the
 *          same playbook + model loaded (resolved by workflowForTask, used by the wake).
 *
 * State (the workflow defs + their last-run guards) lives in WORKFLOWS_DIR/registry.json,
 * alongside the playbook files — all under data/, version-controlled on the agent's data
 * branch. The *process* state — Draft → In Review → Approved — lives in ClickUp, not here.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { LONG_JOB_TIMEOUT_MS, MODEL, NAVID_DM_CHANNEL_ID, WORKFLOWS_DIR, WORKFLOWS_PATH } from "../config.js";
import { runAgent } from "../agent/runner.js";
import { BROWSER_TOOLS } from "../agent/policy.js";
import { getTaskListId, sendChatMessage } from "../clickup/rest.js";
import { occurrenceDue } from "../rhythms/cronDue.js";
import { minuteKey } from "../rhythms/time.js";

/** Hard cap, so a runaway can't register unbounded autonomous workflows. */
export const MAX_WORKFLOWS = 25;

/** Model tier a workflow runs on; resolved to the configured model string at run time. */
export type ModelTier = "sonnet" | "opus";

export interface Workflow {
  id: string;
  /** Human name, e.g. "weekly-digest". */
  name: string;
  /** Playbook stem under WORKFLOWS_DIR (the <stem>.md rules every run loads). */
  playbook: string;
  /** Which model tier the generate + iterate runs use. */
  model: ModelTier;
  /** May the (unattended) generate step drive the browser? Off by default. */
  allowBrowser: boolean;
  /** ClickUp list the workflow operates in — binds the interactive iterate step. */
  listId?: string;
  // --- generate step (optional: a workflow can be iterate-only) -----------
  /** Standard 5-field cron, evaluated in `tz`. Omit for an iterate-only workflow. */
  cron?: string;
  tz: string;
  /** What Aso drafts each time the cron fires. */
  generate?: string;
  enabled: boolean;
  createdAt: string;
  createdBy?: string;
  lastRunAt?: string;
  /** "YYYY-MM-DD HH:MM" (in tz) of the last fire — guards against double-firing in a minute. */
  lastRunMinute?: string;
}

interface Store {
  workflows: Workflow[];
}

async function read(): Promise<Store> {
  try {
    const raw = await readFile(WORKFLOWS_PATH, "utf8");
    const s = JSON.parse(raw) as Store;
    return { workflows: Array.isArray(s.workflows) ? s.workflows : [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { workflows: [] };
    throw err;
  }
}

async function write(store: Store): Promise<void> {
  await mkdir(dirname(WORKFLOWS_PATH), { recursive: true });
  await writeFile(WORKFLOWS_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function listWorkflows(): Promise<Workflow[]> {
  return (await read()).workflows;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "workflow"
  );
}

/** Resolve a workflow's model tier to the actual model string (respects env overrides). */
export function modelFor(w: Workflow): string {
  return w.model === "opus" ? MODEL.heartbeat : MODEL.pm;
}

export interface UpsertWorkflowInput {
  id?: string;
  name: string;
  /** The playbook markdown (the rules). Required to create; optional on update (keeps the existing file). */
  playbookContent?: string;
  model: ModelTier;
  allowBrowser: boolean;
  listId?: string;
  cron?: string;
  tz: string;
  generate?: string;
  enabled?: boolean;
  createdBy?: string;
}

/** Write a playbook markdown file under WORKFLOWS_DIR. */
async function writePlaybook(stem: string, content: string): Promise<void> {
  await mkdir(WORKFLOWS_DIR, { recursive: true });
  await writeFile(resolve(WORKFLOWS_DIR, `${stem}.md`), content.trim() + "\n", "utf8");
}

/**
 * Create or update a workflow. Returns `{ workflow }` on success or `{ error }` if the
 * cap is hit / a new workflow has no playbook (cron validity/safety + authority are
 * checked by the caller). Match on `id`. The playbook markdown is stored in Aso's data
 * (WORKFLOWS_DIR/<stem>.md), not the code repo.
 */
export async function upsertWorkflow(
  input: UpsertWorkflowInput,
): Promise<{ workflow?: Workflow; error?: string }> {
  const store = await read();
  const existing = input.id ? store.workflows.find((w) => w.id === input.id) : undefined;

  if (!existing && store.workflows.length >= MAX_WORKFLOWS) {
    return { error: `at the ${MAX_WORKFLOWS}-workflow limit — remove one before adding another` };
  }

  if (existing) {
    // Keep the existing playbook file/stem; rewrite it only if new content was given.
    if (input.playbookContent !== undefined) await writePlaybook(existing.playbook, input.playbookContent);
    existing.name = input.name;
    existing.model = input.model;
    existing.allowBrowser = input.allowBrowser;
    existing.listId = input.listId;
    existing.cron = input.cron;
    existing.tz = input.tz;
    existing.generate = input.generate;
    if (input.enabled !== undefined) existing.enabled = input.enabled;
    await write(store);
    return { workflow: existing };
  }

  if (!input.playbookContent || !input.playbookContent.trim()) {
    return { error: "a new workflow needs a playbook (its rules)" };
  }
  const stem = slug(input.name);
  await writePlaybook(stem, input.playbookContent);
  const id = `wf-${stem}-${Date.now().toString(36)}`;
  const workflow: Workflow = {
    id,
    name: input.name,
    playbook: stem,
    model: input.model,
    allowBrowser: input.allowBrowser,
    listId: input.listId,
    cron: input.cron,
    tz: input.tz,
    generate: input.generate,
    enabled: input.enabled ?? true,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  store.workflows.push(workflow);
  await write(store);
  return { workflow };
}

/** Remove a workflow by id. Returns the removed workflow's name, or null if no such id. */
export async function removeWorkflow(id: string): Promise<string | null> {
  const store = await read();
  const w = store.workflows.find((x) => x.id === id);
  if (!w) return null;
  store.workflows = store.workflows.filter((x) => x.id !== id);
  await write(store);
  return w.name;
}

/** Load a workflow's playbook text from Aso's data (empty string if the file is missing). */
export async function loadPlaybook(w: Workflow): Promise<string> {
  if (!w.playbook) return "";
  try {
    return (await readFile(resolve(WORKFLOWS_DIR, `${w.playbook}.md`), "utf8")).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

/**
 * Enabled workflows whose generate step is due now (cron + generate text present),
 * with the same catch-up semantics as scheduled jobs (see cronDue.ts).
 */
export async function dueWorkflows(now: Date): Promise<Workflow[]> {
  const store = await read();
  const due: Workflow[] = [];
  for (const w of store.workflows) {
    if (!w.enabled || !w.cron || !w.generate) continue; // iterate-only / disabled
    if (w.lastRunMinute === minuteKey(w.tz, now)) continue; // already fired this minute
    const lastRun = w.lastRunAt ? new Date(w.lastRunAt).getTime() : 0;
    const baseline = Math.max(lastRun, new Date(w.createdAt).getTime());
    if (occurrenceDue(w.cron, w.tz, now, baseline)) due.push(w);
  }
  return due;
}

/** The enabled workflow bound to a given task's list, if any (else undefined). */
export async function workflowForTask(taskId: string): Promise<Workflow | undefined> {
  const bound = (await read()).workflows.filter((w) => w.enabled && w.listId);
  if (bound.length === 0) return undefined; // skip the REST lookup when nothing is bound
  let listId: string | undefined;
  try {
    listId = await getTaskListId(taskId);
  } catch (err) {
    console.error(`[workflow] could not resolve list for task ${taskId}:`, (err as Error).message);
    return undefined;
  }
  return listId ? bound.find((w) => w.listId === listId) : undefined;
}

/** Record that a workflow's generate step fired at `now` (sets lastRunAt + the minute guard). */
async function markRan(id: string, now: Date): Promise<void> {
  const store = await read();
  const w = store.workflows.find((x) => x.id === id);
  if (!w) return;
  w.lastRunAt = now.toISOString();
  w.lastRunMinute = minuteKey(w.tz, now);
  await write(store);
}

/**
 * Run a workflow's GENERATE step: stamp it (so a crash mid-run doesn't re-fire it next
 * tick), load its playbook, then run the agent on the workflow's model. The browser is
 * disallowed unless the workflow opted in (allowBrowser) — that opt-in is gated to
 * Navid at registration time (see control/actions.ts).
 */
export async function runWorkflowGenerate(w: Workflow, now: Date = new Date()): Promise<void> {
  await markRan(w.id, now);
  const playbook = await loadPlaybook(w);
  const task = [
    `This is your workflow "${w.name}" (id ${w.id}) — the recurring GENERATE step (cron "${w.cron}" ${w.tz}).`,
    w.allowBrowser
      ? "You may use the browser for this workflow if the playbook calls for it."
      : "You are unattended: do NOT use the browser, and do not claim to have posted anywhere you cannot reach.",
    w.listId
      ? `Put your output in ClickUp list ${w.listId} (the workflow's list) so Navid can review and iterate on it there.`
      : "Put your output where the playbook says so Navid can review it.",
    "",
    playbook ? "Workflow playbook (the rules for this workflow):\n---\n" + playbook + "\n---\n" : "",
    "What to generate now:",
    w.generate ?? "(no generate instructions — nothing to do)",
  ].join("\n");
  const res = await runAgent({
    task,
    model: modelFor(w),
    // The generate step is unattended and can be a real (browser) job, so it gets the
    // long-job budget rather than the 5-min interactive default — otherwise a workflow
    // that drives the browser would be SIGKILL'd mid-task on a timer.
    timeoutMs: LONG_JOB_TIMEOUT_MS,
    disallowTools: w.allowBrowser ? [] : BROWSER_TOOLS,
  });
  console.log(
    `[workflow] ran ${w.id} (${w.name}): ${res.ok ? "ok" : `FAILED ${res.error}`}` +
      (res.ok && res.text ? ` — ${res.text.slice(0, 160)}` : ""),
  );
  // A browser-enabled generate step is an unattended LONG job with no thread to show a
  // placeholder in — so it would otherwise run (and fail) invisibly. Give Navid a short
  // finish/fail note in his DM so it isn't blind. Read-only/Canva-only workflows stay quiet.
  if (w.allowBrowser) {
    const note = res.ok
      ? `Workflow "${w.name}" ran${res.text ? ` — ${res.text.slice(0, 200)}` : "."}`
      : `❌ Workflow "${w.name}" failed: ${res.error ?? "no output"}`;
    await sendChatMessage(NAVID_DM_CHANNEL_ID, note).catch((e) =>
      console.error(`[workflow] could not DM Navid the ${w.name} note:`, (e as Error).message),
    );
  }
}

/** One-line human description of a workflow, for the agent's context and outcome strings. */
export function describeWorkflow(w: Workflow): string {
  const sched = w.cron ? `cron "${w.cron}" ${w.tz}` : "iterate-only (no cron)";
  const list = w.listId ? ` · list ${w.listId}` : "";
  return `${w.id} — "${w.name}" — ${w.model}${w.allowBrowser ? "+browser" : ""} · playbook ${w.playbook} · ${sched}${list}${w.enabled ? "" : " (disabled)"}`;
}
