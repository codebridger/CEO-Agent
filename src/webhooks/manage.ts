/**
 * Shared webhook management (PRD §4.4) — the logic behind the human CLI
 * (src/cli/webhook.ts), the boot-time reconcile (src/main.ts), and the agent's
 * register/unregister directives (src/control/actions.ts). Keeping it here means
 * all three paths register/unregister the same way and against the same state.
 *
 * Registration uses the REST token (no MCP tool exists). The signing secret is
 * stored in data/webhooks.json — never printed in full, never committed.
 */

import { WEBHOOK_EVENTS, WEBHOOK_PUBLIC_URL } from "../config.js";
import { createWebhook, deleteWebhook, listWebhooks } from "../clickup/rest.js";
import {
  clearWebhookState,
  readWebhookState,
  writeWebhookState,
  type WebhookState,
} from "../state/webhooks.js";

/**
 * Create the ClickUp subscription and persist its state. Scoped to the whole
 * workspace (no list_id), so the agent receives events from every list — she works
 * across more than one (e.g. Subturtle.app and the LinkedIn Content list, which live
 * in different spaces). The categorizer decides what actually warrants a wake; an
 * unrelated list just adds inbox activity, never an unsolicited reply.
 */
export async function registerWebhook(): Promise<WebhookState> {
  if (!WEBHOOK_PUBLIC_URL) {
    throw new Error("WEBHOOK_PUBLIC_URL is not set in .env (e.g. https://aso.<host>/clickup/webhook).");
  }
  const w = await createWebhook({
    endpoint: WEBHOOK_PUBLIC_URL,
    events: WEBHOOK_EVENTS,
  });
  const state: WebhookState = {
    id: w.id,
    secret: w.secret,
    endpoint: w.endpoint,
    events: w.events,
    scope: "workspace",
    created: new Date().toISOString(),
  };
  await writeWebhookState(state);
  return state;
}

/** Delete a ClickUp subscription and clear local state if it was the active one. */
export async function unregisterWebhook(id: string): Promise<void> {
  if (!id) throw new Error("unregisterWebhook requires a webhook id");
  await deleteWebhook(id);
  const local = await readWebhookState();
  if (local && local.id === id) await clearWebhookState();
}

export interface ReconcileResult {
  action: "ok" | "recreated" | "warn-no-state";
  /** Webhooks ClickUp reports on our endpoint that we don't own — logged, never deleted. */
  unknown: string[];
}

/**
 * Bring local state and ClickUp into agreement on boot (PRD §4.4.3):
 *  - local id missing on ClickUp → re-create it (additive, safe) and rewrite state,
 *  - ClickUp webhooks on OUR endpoint that aren't our id → report as unknown (never delete;
 *    removal is destructive and needs Navid's OK),
 *  - no local state → warn (the operator/agent must register first).
 */
export async function reconcileWebhooks(): Promise<ReconcileResult> {
  const local = await readWebhookState();
  const remote = await listWebhooks();

  if (!local || !local.id) {
    const unknown = remote.filter((w) => w.endpoint === WEBHOOK_PUBLIC_URL).map((w) => w.id);
    return { action: "warn-no-state", unknown };
  }

  const ours = remote.find((w) => w.id === local.id);
  const unknown = remote
    .filter((w) => w.id !== local.id && w.endpoint === WEBHOOK_PUBLIC_URL)
    .map((w) => w.id);

  if (!ours) {
    await registerWebhook(); // re-create the missing subscription, rewrites state
    return { action: "recreated", unknown };
  }
  return { action: "ok", unknown };
}
