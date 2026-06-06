/**
 * Detect a manual rhythm command in a chat/comment message (PRD §6 Q4). Requires
 * an explicit action verb so casual mentions ("the heartbeat looked good") don't
 * fire. Only honored from Navid's account (enforced by the caller).
 */

export type RhythmCommand = "heartbeat" | "pm-check";

export function matchCommand(text: string): RhythmCommand | null {
  const t = text.toLowerCase();
  const hasVerb = /\b(run|start|do|trigger|kick\s?off)\b/.test(t);
  if (!hasVerb) return null;
  if (/\bheart\s?beat\b/.test(t)) return "heartbeat";
  if (/\bpm[\s-]?check\b/.test(t) || /\bpm\b/.test(t)) return "pm-check";
  return null;
}
