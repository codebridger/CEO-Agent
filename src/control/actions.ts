/**
 * Control actions the agent can request via its chat directive (PRD §4.4–4.5).
 * Same pattern as message delivery: the agent only *asks*; the app enforces the
 * guardrails and performs the privileged work, then records the true outcome.
 *
 * Authority (enforced here, not trusted from the model):
 *  - webhook.register   → additive/safe → allowed from any chat.
 *  - webhook.unregister → destructive   → only from Navid's private DM.
 *  - restart            → disruptive     → only from Navid's private DM; deferred
 *                          (writes a request; the watcher restarts when idle).
 */

import { HEARTBEAT_TZ, IDENTITY, NAVID_DM_CHANNEL_ID } from "../config.js";
import { registerWebhook, unregisterWebhook } from "../webhooks/manage.js";
import { readWebhookState } from "../state/webhooks.js";
import { requestRestart } from "../ops/restart.js";
import { sendChatMessage } from "../clickup/rest.js";
import { proposeImprovement, type ProposeFile } from "../selfimprove/propose.js";
import { appendNote } from "../memory/notes.js";
import { isSafeCron } from "../rhythms/cron.js";
import { describeJob, removeJob, upsertJob } from "../rhythms/schedules.js";
import {
  describeWorkflow,
  removeWorkflow,
  upsertWorkflow,
  type ModelTier,
} from "../workflows/registry.js";
import type { Inbound } from "../wake/handle.js";

export type Action =
  | { type: "webhook.register" }
  | { type: "webhook.unregister"; id?: string }
  | { type: "restart"; at?: number; reason?: string }
  | { type: "self-improve"; topic: string; summary: string; files: ProposeFile[] }
  | { type: "remember"; text: string }
  | { type: "schedule"; id?: string; title: string; cron: string; task: string; tz?: string; enabled?: boolean; long?: boolean }
  | { type: "unschedule"; id: string }
  | {
      type: "workflow";
      id?: string;
      name: string;
      /** The playbook markdown (the workflow's rules). Required to create; optional to update. */
      playbook?: string;
      model?: ModelTier;
      allowBrowser?: boolean;
      listId?: string;
      cron?: string;
      tz?: string;
      generate?: string;
      enabled?: boolean;
    }
  | { type: "workflow.remove"; id: string };

/** Validate a loosely-typed array from the directive into Actions; drop junk. */
export function coerceActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return [];
  const out: Action[] = [];
  for (const a of raw) {
    const o = a as Record<string, unknown>;
    const type = String(o?.["type"] ?? "");
    if (type === "webhook.register") out.push({ type });
    else if (type === "webhook.unregister") out.push({ type, id: o["id"] ? String(o["id"]) : undefined });
    else if (type === "restart")
      out.push({ type, at: typeof o["at"] === "number" ? o["at"] : undefined, reason: o["reason"] ? String(o["reason"]) : undefined });
    else if (type === "self-improve") {
      const files = (Array.isArray(o["files"]) ? o["files"] : [])
        .map((f) => f as { path?: unknown; content?: unknown })
        .filter((f) => typeof f.path === "string" && typeof f.content === "string")
        .map((f) => ({ path: String(f.path), content: String(f.content) }));
      out.push({ type, topic: String(o["topic"] ?? "update"), summary: String(o["summary"] ?? ""), files });
    } else if (type === "remember") {
      const text = String(o["text"] ?? "").trim();
      if (text) out.push({ type, text });
    } else if (type === "schedule") {
      const title = String(o["title"] ?? "").trim();
      const cron = String(o["cron"] ?? "").trim();
      const task = String(o["task"] ?? "").trim();
      if (title && cron && task) {
        out.push({
          type,
          id: o["id"] ? String(o["id"]) : undefined,
          title,
          cron,
          task,
          tz: o["tz"] ? String(o["tz"]) : undefined,
          enabled: typeof o["enabled"] === "boolean" ? (o["enabled"] as boolean) : undefined,
          long: o["long"] === true,
        });
      }
    } else if (type === "unschedule") {
      const id = String(o["id"] ?? "").trim();
      if (id) out.push({ type, id });
    } else if (type === "workflow") {
      const name = String(o["name"] ?? "").trim();
      if (name) {
        const model = o["model"] === "opus" ? "opus" : "sonnet";
        const playbook = String(o["playbook"] ?? "").trim();
        out.push({
          type,
          id: o["id"] ? String(o["id"]) : undefined,
          name,
          playbook: playbook || undefined,
          model,
          allowBrowser: o["allowBrowser"] === true,
          listId: o["listId"] ? String(o["listId"]) : undefined,
          cron: o["cron"] ? String(o["cron"]).trim() : undefined,
          tz: o["tz"] ? String(o["tz"]) : undefined,
          generate: o["generate"] ? String(o["generate"]).trim() : undefined,
          enabled: typeof o["enabled"] === "boolean" ? (o["enabled"] as boolean) : undefined,
        });
      }
    } else if (type === "workflow.remove") {
      const id = String(o["id"] ?? "").trim();
      if (id) out.push({ type, id });
    } else if (type) out.push({ type } as Action); // unknown — executeActions rejects it explicitly
  }
  return out;
}

/** Is this message from Navid in his private DM? Required for destructive/disruptive actions. */
function fromNavidDM(inbound: Inbound): boolean {
  return inbound.authorUserId === IDENTITY.navidUserId && inbound.channelId === NAVID_DM_CHANNEL_ID;
}

/** Execute the requested actions with guardrails. Returns a human-readable outcome per action. */
export async function executeActions(actions: Action[], inbound: Inbound): Promise<string[]> {
  const outcomes: string[] = [];
  for (const action of actions) {
    try {
      if (action.type === "webhook.register") {
        const existing = await readWebhookState();
        if (existing && existing.id) {
          outcomes.push(`webhook.register: already registered (${existing.id}) — no change`);
        } else {
          const w = await registerWebhook();
          outcomes.push(`webhook.register: created ${w.id} → ${w.endpoint}`);
        }
        continue;
      }

      if (action.type === "webhook.unregister") {
        if (!fromNavidDM(inbound)) {
          outcomes.push("webhook.unregister DENIED — only from Navid's private DM");
          continue;
        }
        const id = action.id || (await readWebhookState())?.id;
        if (!id) {
          outcomes.push("webhook.unregister: nothing to remove (no id / no local registration)");
          continue;
        }
        await unregisterWebhook(id);
        outcomes.push(`webhook.unregister: deleted ${id}`);
        continue;
      }

      if (action.type === "restart") {
        if (!fromNavidDM(inbound)) {
          outcomes.push("restart DENIED — only from Navid's private DM");
          continue;
        }
        await requestRestart({ at: action.at, reason: action.reason || "agent request" });
        outcomes.push(
          action.at && action.at > Date.now()
            ? `restart scheduled for ${new Date(action.at).toISOString()}`
            : "restart queued — will happen at the next idle moment",
        );
        continue;
      }

      if (action.type === "remember") {
        // Additive and personal to the agent — allowed from any chat.
        const stored = await appendNote(action.text, inbound.author);
        outcomes.push(`remember: noted "${stored}"`);
        continue;
      }

      if (action.type === "schedule") {
        // Additive and reversible (the agent manages its own jobs) — allowed from any chat,
        // but capped: the cron must pin at least a minute so it can't run away.
        const safe = isSafeCron(action.cron);
        if (!safe.ok) {
          outcomes.push(`schedule REJECTED — ${safe.reason}: "${action.cron}"`);
          continue;
        }
        // A "long" job runs unattended with the browser + a 20-min budget — the same
        // sensitive capability a browser workflow has, so it needs Navid's authority.
        if (action.long && !fromNavidDM(inbound)) {
          outcomes.push("schedule DENIED — a long (browser-enabled) job can only be set up from Navid's private DM");
          continue;
        }
        const { job, error } = await upsertJob({
          id: action.id,
          title: action.title,
          cron: action.cron,
          task: action.task,
          tz: action.tz || HEARTBEAT_TZ,
          enabled: action.enabled,
          long: action.long,
          // Remember where this was asked from so a long job can post its progress back here.
          origin: {
            source: inbound.source,
            channelId: inbound.channelId,
            replyToMessageId: inbound.replyToMessageId,
            taskId: inbound.taskId,
            commentId: inbound.commentId,
            author: inbound.author,
            authorUserId: inbound.authorUserId,
          },
          createdBy: inbound.author,
        });
        outcomes.push(job ? `schedule: ${action.id ? "updated" : "created"} ${describeJob(job)}` : `schedule FAILED — ${error}`);
        continue;
      }

      if (action.type === "unschedule") {
        const title = await removeJob(action.id);
        outcomes.push(title ? `unschedule: removed "${title}" (${action.id})` : `unschedule: no job with id ${action.id}`);
        continue;
      }

      if (action.type === "workflow") {
        // A workflow that drives the browser (its unattended generate step can reach
        // external surfaces / publish) is a sensitive capability — only Navid may grant
        // it. A read-only / Canva-only workflow is additive, allowed from any chat.
        if (action.allowBrowser && !fromNavidDM(inbound)) {
          outcomes.push("workflow DENIED — a browser-enabled workflow can only be set up from Navid's private DM");
          continue;
        }
        // A recurring generate step needs both a safe cron and something to generate.
        if (action.cron) {
          const safe = isSafeCron(action.cron);
          if (!safe.ok) {
            outcomes.push(`workflow REJECTED — ${safe.reason}: "${action.cron}"`);
            continue;
          }
          if (!action.generate) {
            outcomes.push('workflow REJECTED — a cron is set but no "generate" instructions were given');
            continue;
          }
        }
        const { workflow, error } = await upsertWorkflow({
          id: action.id,
          name: action.name,
          playbookContent: action.playbook,
          model: action.model ?? "sonnet",
          allowBrowser: action.allowBrowser ?? false,
          listId: action.listId,
          cron: action.cron,
          tz: action.tz || HEARTBEAT_TZ,
          generate: action.generate,
          enabled: action.enabled,
          createdBy: inbound.author,
        });
        outcomes.push(
          workflow
            ? `workflow: ${action.id ? "updated" : "created"} ${describeWorkflow(workflow)}`
            : `workflow FAILED — ${error}`,
        );
        continue;
      }

      if (action.type === "workflow.remove") {
        const name = await removeWorkflow(action.id);
        outcomes.push(name ? `workflow.remove: removed "${name}" (${action.id})` : `workflow.remove: no workflow with id ${action.id}`);
        continue;
      }

      if (action.type === "self-improve") {
        // Additive: it only opens a PR for Navid to review/merge — allowed from any chat.
        const { prUrl } = await proposeImprovement(action);
        await sendChatMessage(
          NAVID_DM_CHANNEL_ID,
          `I opened a self-improvement PR for "${action.topic}": ${prUrl}\nPlease review — it takes effect after you merge and I restart.`,
        ).catch((e) => console.error("[actions] could not DM Navid the PR link:", (e as Error).message));
        outcomes.push(`self-improve: opened PR ${prUrl}`);
        continue;
      }

      outcomes.push(`ignored unknown action "${(action as { type: string }).type}"`);
    } catch (err) {
      outcomes.push(`${(action as Action).type} FAILED: ${(err as Error).message}`);
    }
  }
  return outcomes;
}
