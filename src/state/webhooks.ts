/**
 * Webhook registration state (PRD §4.4): the active subscription's id + signing
 * secret, written by `webhook register`, read by the listener (to verify
 * signatures) and `webhook list` (to reconcile against ClickUp). Lives in
 * data/webhooks.json (git-ignored) — the secret never touches the repo or .env.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { WEBHOOKS_STATE_PATH } from "../config.js";

export interface WebhookState {
  id: string;
  secret: string;
  endpoint: string;
  events: string[];
  scope?: string; // e.g. the list id the webhook is scoped to
  created: string; // ISO
}

export async function readWebhookState(): Promise<WebhookState | null> {
  try {
    return JSON.parse(await readFile(WEBHOOKS_STATE_PATH, "utf8")) as WebhookState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeWebhookState(s: WebhookState): Promise<void> {
  await mkdir(dirname(WEBHOOKS_STATE_PATH), { recursive: true });
  await writeFile(WEBHOOKS_STATE_PATH, JSON.stringify(s, null, 2) + "\n", "utf8");
}

/** The signing secret for the active webhook ("" if not registered yet). */
export async function getWebhookSecret(): Promise<string> {
  return (await readWebhookState())?.secret ?? "";
}
