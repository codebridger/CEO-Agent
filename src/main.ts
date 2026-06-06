/**
 * App entrypoint (the process pm2 runs). Starts the HTTPS webhook listener and
 * the chat poller, ensures the data dirs exist, and shuts down gracefully on
 * SIGTERM/SIGINT (stop accepting, let in-flight wakes finish, exit).
 */

import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { EVENTS_DIR, POLLER_DIR, THREADS_DIR, WEBHOOK_PATH } from "./config.js";
import { startServer } from "./server/http.js";
import { startPoller } from "./poller/chat.js";
import { readWebhookState } from "./state/webhooks.js";

async function main(): Promise<void> {
  await Promise.all([
    mkdir(THREADS_DIR, { recursive: true }),
    mkdir(EVENTS_DIR, { recursive: true }),
    mkdir(POLLER_DIR, { recursive: true }),
  ]);

  const state = await readWebhookState();
  if (!state) {
    console.warn(
      "[main] no webhook registered yet — run `npm run webhook -- register`. " +
        "The listener will reject all events (bad signature) until then.",
    );
  } else {
    console.log(`[main] webhook ${state.id} → ${state.endpoint} (${state.events.length} events)`);
  }

  const server: Server = startServer();
  const stopPoller = await startPoller();
  console.log(`[main] CEO-Agent up. Webhook path ${WEBHOOK_PATH}.`);

  let shuttingDown = false;
  const shutdown = (sig: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[main] ${sig} — shutting down gracefully`);
    stopPoller();
    server.close(() => {
      console.log("[main] server closed; exiting");
      process.exit(0);
    });
    // Hard stop if connections linger (in-flight wakes still complete via their own promises).
    setTimeout(() => process.exit(0), 15_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[main] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
