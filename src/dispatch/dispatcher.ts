/**
 * Route a categorized ClickUp event: drop (C), append to the inbox (B), or wake
 * the agent now (A). Called off the HTTP request path (after the 200 ack) so the
 * listener stays fast.
 */

import { appendEvent } from "../memory/inbox.js";
import { handleWake } from "../wake/handle.js";
import { categorize, type ClickUpWebhookEvent } from "./categorize.js";

export async function dispatch(ev: ClickUpWebhookEvent): Promise<void> {
  const c = await categorize(ev);

  if (c.category === "C") {
    console.log(`[dispatch] drop — ${c.reason}`);
    return;
  }

  if (c.category === "B") {
    await appendEvent({
      ts: new Date().toISOString(),
      event: c.event,
      taskId: c.taskId,
      threadId: c.threadId,
      author: c.author,
      summary: c.summary,
    });
    console.log(`[dispatch] inbox — ${c.event} ${c.taskId ?? ""}`);
    return;
  }

  console.log(`[dispatch] wake — ${c.inbound.threadId}`);
  await handleWake(c.inbound);
}
