/**
 * App entrypoint (the process pm2 runs). Starts the webhook listener, the chat
 * poller, and the rhythm scheduler (PM check + heartbeat); reconciles the webhook
 * registration; arms the crash-loop guard; watches for self-restart requests; and
 * shuts down gracefully on SIGTERM/SIGINT (PRD §4.4–4.5).
 */

import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { EVENTS_DIR, HEARTBEATS_DIR, POLLER_DIR, THREADS_DIR, WEBHOOK_PATH } from "./config.js";
import { startServer } from "./server/http.js";
import { startPoller } from "./poller/chat.js";
import { startScheduler } from "./rhythms/scheduler.js";
import { readWebhookState } from "./state/webhooks.js";
import { reconcileWebhooks } from "./webhooks/manage.js";
import { recordBootAndMaybeAlert } from "./ops/crashGuard.js";
import { gracefulShutdown, startRestartWatcher } from "./ops/restart.js";

async function main(): Promise<void> {
  // FIRST I/O: arm the crash flag (and alert if we've been crash-looping) before
  // anything that can throw during startup, so a startup-phase crash is counted.
  await recordBootAndMaybeAlert();

  await Promise.all([
    mkdir(THREADS_DIR, { recursive: true }),
    mkdir(EVENTS_DIR, { recursive: true }),
    mkdir(POLLER_DIR, { recursive: true }),
    mkdir(HEARTBEATS_DIR, { recursive: true }),
  ]);

  // Reconcile the webhook with ClickUp (re-create if missing, report unknowns).
  // Non-fatal: a ClickUp hiccup at boot must not crash the app and feed the guard.
  try {
    const r = await reconcileWebhooks();
    if (r.action === "recreated") console.log("[main] webhook missing on ClickUp — re-created it");
    if (r.action === "warn-no-state") {
      console.warn(
        "[main] no webhook registered yet — run `npm run webhook -- register`. " +
          "The listener will reject all events (bad signature) until then.",
      );
    }
    if (r.unknown.length > 0) {
      console.warn(`[main] ClickUp has webhook(s) on our endpoint we don't own: ${r.unknown.join(", ")} (not deleting)`);
    }
    const state = await readWebhookState();
    if (state && state.id) console.log(`[main] webhook ${state.id} → ${state.endpoint} (${state.events.length} events)`);
  } catch (err) {
    console.error("[main] webhook reconcile failed (continuing):", (err as Error).message);
  }

  const server: Server = startServer();
  const stopPoller = await startPoller();
  const stopScheduler = await startScheduler();

  const shutdown = (reason: string): void =>
    gracefulShutdown(reason, server, [stopPoller, stopScheduler, stopWatcher]);
  const stopWatcher = startRestartWatcher((reason) => shutdown(reason));

  console.log(`[main] CEO-Agent up. Webhook path ${WEBHOOK_PATH}.`);

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[main] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
