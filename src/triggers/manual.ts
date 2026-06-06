/**
 * Manual trigger prompts. These are task-specific instructions appended to the
 * contract (loaded as system prompt). They name the Subturtle.app list so the
 * agent doesn't have to rediscover it.
 */

import { NAVID_DM_CHANNEL_ID, SUBTURTLE_APP_LIST_ID } from "../config.js";

export function readPrompt(): string {
  return [
    "This is a manual READ check. Do not create, edit, or comment on anything.",
    `Read the ClickUp list "Subturtle.app" (list id ${SUBTURTLE_APP_LIST_ID}).`,
    "Summarise, in plain English per your contract's style: what is actively in progress,",
    "what is blocked, and what is waiting in review. Keep it short and ranked by what matters to revenue.",
  ].join("\n");
}

export function dmNavidPrompt(): string {
  return [
    "Send a short PRIVATE chat message to Navid Shad (the founder) via ClickUp.",
    `Send it to chat channel id "${NAVID_DM_CHANNEL_ID}" — this is your direct-message channel`,
    "with Navid. Use the send-chat-message tool with that exact channel_id. Do NOT pick any other",
    "channel and do NOT post to your own notes channel.",
    "Navid just messaged you there ('Hey Aso Im Navid'), so reply naturally: introduce yourself,",
    "say you are now online under your own ClickUp account (Aso Dara), give one honest line on what",
    "you saw on the Subturtle.app board, and ask the single most useful question to move revenue next.",
    "Follow your contract's style: plain English, short, honest, no cheerleading.",
    "Then report back the exact message you sent.",
  ].join("\n");
}

export function commentPrompt(taskId: string): string {
  return [
    `This is a manual PM action on ClickUp task ${taskId}.`,
    "Read the task (status, assignee, recent comments).",
    "Then post exactly ONE short, useful comment per your contract:",
    "a status question, a named blocker, or a concrete next step — whichever fits.",
    "Comments are allowed freely by the contract; do not create or edit tasks.",
    "After posting, report back: the task name, and the exact comment you posted.",
  ].join("\n");
}
