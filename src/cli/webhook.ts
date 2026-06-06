/**
 * Webhook management CLI (PRD §4.4) — the human-run operations:
 *   register            create the ClickUp subscription (scoped to Subturtle.app)
 *   list                show ClickUp's webhooks + reconcile with local state
 *   unregister <id>     delete a subscription
 *
 * The actual work lives in src/webhooks/manage.ts (shared with the boot reconcile
 * and the agent's directives). This file is just the human-facing wrapper + output.
 */

import { listWebhooks } from "../clickup/rest.js";
import { registerWebhook, unregisterWebhook } from "../webhooks/manage.js";
import { readWebhookState } from "../state/webhooks.js";

function mask(secret: string): string {
  return secret ? `${secret.slice(0, 4)}…${secret.slice(-3)} (${secret.length} chars)` : "(none)";
}

async function register(): Promise<void> {
  const existing = await readWebhookState();
  if (existing && existing.id) {
    console.error(
      `A webhook is already registered locally (${existing.id} → ${existing.endpoint}).\n` +
        "Run `unregister " + existing.id + "` first if you want to re-create it.",
    );
    return;
  }
  const w = await registerWebhook();
  console.log(`Registered webhook ${w.id}`);
  console.log(`  endpoint: ${w.endpoint}`);
  console.log(`  events:   ${w.events.join(", ")}`);
  console.log(`  secret:   ${mask(w.secret)} → saved to data/webhooks.json`);
}

async function list(): Promise<void> {
  const remote = await listWebhooks();
  const local = await readWebhookState();
  console.log(`ClickUp reports ${remote.length} webhook(s):`);
  for (const w of remote) {
    const mine = local && local.id === w.id ? " (this app)" : "";
    console.log(`  ${w.id} → ${w.endpoint}${mine}`);
    console.log(`     events: ${w.events.join(", ")}`);
    if (w.health) console.log(`     health: ${JSON.stringify(w.health)}`);
  }
  if (local && local.id && !remote.some((w) => w.id === local.id)) {
    console.warn(`\n⚠ local state has ${local.id} but ClickUp doesn't — re-register.`);
  }
  if (!local || !local.id) console.log("\nNo local registration (data/webhooks.json missing).");
}

async function unregister(id: string | undefined): Promise<void> {
  if (!id) throw new Error("unregister requires a webhook <id>");
  await unregisterWebhook(id);
  console.log(`Deleted webhook ${id}.`);
}

function usage(): never {
  console.error(
    [
      "Usage: npm run webhook -- <command>",
      "",
      "  register            Create the ClickUp webhook (scoped to Subturtle.app).",
      "  list                Show ClickUp's webhooks and reconcile with local state.",
      "  unregister <id>     Delete a webhook subscription.",
    ].join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "register":
      await register();
      break;
    case "list":
      await list();
      break;
    case "unregister":
      await unregister(rest[0]);
      break;
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
