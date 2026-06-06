/**
 * Webhook management CLI (PRD §4.4). M2 covers the human-run operations:
 *   register            create the ClickUp subscription (scoped to Subturtle.app)
 *   list                show ClickUp's webhooks + reconcile with local state
 *   unregister <id>     delete a subscription (manual; agent self-unregister is M4)
 *
 * Registration uses the REST token (no MCP tool exists). The returned signing
 * secret is stored in data/webhooks.json — never printed in full, never committed.
 */

import { SUBTURTLE_APP_LIST_ID, WEBHOOK_EVENTS, WEBHOOK_PUBLIC_URL } from "../config.js";
import { createWebhook, deleteWebhook, listWebhooks } from "../clickup/rest.js";
import { readWebhookState, writeWebhookState } from "../state/webhooks.js";

function mask(secret: string): string {
  return secret ? `${secret.slice(0, 4)}…${secret.slice(-3)} (${secret.length} chars)` : "(none)";
}

async function register(): Promise<void> {
  if (!WEBHOOK_PUBLIC_URL) {
    throw new Error("WEBHOOK_PUBLIC_URL is not set in .env (e.g. https://aso.<host>/clickup/webhook).");
  }
  const existing = await readWebhookState();
  if (existing) {
    console.error(
      `A webhook is already registered locally (${existing.id} → ${existing.endpoint}).\n` +
        "Run `unregister " + existing.id + "` first if you want to re-create it.",
    );
    return;
  }
  const w = await createWebhook({
    endpoint: WEBHOOK_PUBLIC_URL,
    events: WEBHOOK_EVENTS,
    listId: SUBTURTLE_APP_LIST_ID,
  });
  await writeWebhookState({
    id: w.id,
    secret: w.secret,
    endpoint: w.endpoint,
    events: w.events,
    scope: `list:${SUBTURTLE_APP_LIST_ID}`,
    created: new Date().toISOString(),
  });
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
  if (local && !remote.some((w) => w.id === local.id)) {
    console.warn(`\n⚠ local state has ${local.id} but ClickUp doesn't — re-register.`);
  }
  if (!local) console.log("\nNo local registration (data/webhooks.json missing).");
}

async function unregister(id: string | undefined): Promise<void> {
  if (!id) throw new Error("unregister requires a webhook <id>");
  await deleteWebhook(id);
  const local = await readWebhookState();
  if (local && local.id === id) {
    // Clear local state by writing an empty marker file would be confusing; just note it.
    await writeWebhookState({ ...local, id: "", secret: "", endpoint: local.endpoint, events: [], created: local.created });
  }
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
