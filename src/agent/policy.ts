/**
 * Tool-level guardrails — the backstop for the contract's "must never do" list.
 * The contract text is the primary control (the model follows it); these denials
 * are defense in depth so a single bad step cannot do irreversible or forbidden harm.
 *
 * Tool names are the claude.ai connector names (the agent inherits these connectors;
 * the ClickUp one is authed as Aso Dara).
 */

/**
 * Hard denials, enforced via `--disallowedTools` on every run:
 * - Stripe execute: the contract forbids spending money or touching billing.
 * - ClickUp delete_task: deletion is destructive and needs Navid's OK (contract).
 *
 * Note: ClickUp `remove_*` relationship tools (tags, links, dependencies) are
 * reversible and governed by the contract's behavioural rules, not blocked here.
 */
export const DISALLOWED_TOOLS: string[] = [
  "mcp__claude_ai_Stripe__stripe_api_execute",
  "mcp__claude_ai_ClickUp__clickup_delete_task",
];
