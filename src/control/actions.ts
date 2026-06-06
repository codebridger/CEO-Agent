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

import { IDENTITY, NAVID_DM_CHANNEL_ID } from "../config.js";
import { registerWebhook, unregisterWebhook } from "../webhooks/manage.js";
import { readWebhookState } from "../state/webhooks.js";
import { requestRestart } from "../ops/restart.js";
import type { Inbound } from "../wake/handle.js";

export type Action =
  | { type: "webhook.register" }
  | { type: "webhook.unregister"; id?: string }
  | { type: "restart"; at?: number; reason?: string };

const KNOWN_TYPES = new Set(["webhook.register", "webhook.unregister", "restart"]);

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
    else if (type) out.push({ type } as Action); // unknown — executeActions rejects it explicitly
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

      outcomes.push(`ignored unknown action "${(action as { type: string }).type}"`);
    } catch (err) {
      outcomes.push(`${(action as Action).type} FAILED: ${(err as Error).message}`);
    }
  }
  return outcomes;
}
