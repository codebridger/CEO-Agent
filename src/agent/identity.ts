/**
 * Agent identity helpers. The persona's name comes from config (AGENT_NAME) so
 * the codebase is instance-agnostic — a differently-named instance detects its
 * own @mentions without code changes.
 */

import { AGENT_NAME } from "../config.js";

const full = AGENT_NAME.toLowerCase().trim();
const first = full.split(/\s+/)[0] ?? full;

/** True if free text mentions the agent — its full name, or "@<first name>". */
export function textMentionsAgent(text: string): boolean {
  const t = text.toLowerCase();
  if (full && t.includes(full)) return true;
  return new RegExp(`@\\s*${first}\\b`).test(t);
}
