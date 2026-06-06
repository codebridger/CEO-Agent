import { spawn } from "node:child_process";
import { z } from "zod";
import { CONTRACT_PATH, MODEL } from "../config.js";
import { DISALLOWED_TOOLS } from "./policy.js";

export interface RunOptions {
  /** The task-specific prompt (the contract is loaded separately as system prompt). */
  task: string;
  /** Which model tier to use. */
  model?: (typeof MODEL)[keyof typeof MODEL];
  /** Hard wall-clock limit; the child is killed past this. */
  timeoutMs?: number;
  /** Extra tools to block for this run only (merged with the standing denials). */
  disallowTools?: string[];
}

export interface RunResult {
  ok: boolean;
  text: string;
  sessionId?: string;
  costUsd?: number;
  error?: string;
}

/** Shape of `claude --print --output-format json` (loose — we only read a few fields). */
const ClaudeJson = z
  .object({
    result: z.string().optional(),
    session_id: z.string().optional(),
    total_cost_usd: z.number().optional(),
    is_error: z.boolean().optional(),
    subtype: z.string().optional(),
  })
  .passthrough();

/**
 * Run one headless Claude Code session with the contract loaded. The agent
 * inherits the claude.ai connectors (ClickUp authed as the agent's account, Stripe/Mixpanel
 * read). This is the reusable core every trigger (manual now; webhook/heartbeat
 * later) goes through.
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const { task, model = MODEL.pm, timeoutMs = 300_000, disallowTools = [] } = opts;

  const args = [
    "--print",
    task,
    "--output-format",
    "json",
    "--append-system-prompt-file",
    CONTRACT_PATH,
    "--model",
    model,
    "--dangerously-skip-permissions",
  ];
  const disallowed = [...DISALLOWED_TOOLS, ...disallowTools];
  if (disallowed.length > 0) {
    args.push("--disallowedTools", ...disallowed);
  }

  return await new Promise<RunResult>((resolvePromise) => {
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise({ ok: false, text: "", error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, text: "", error: `spawn failed: ${err.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolvePromise({
          ok: false,
          text: "",
          error: `claude exited ${code}: ${stderr.trim() || stdout.trim()}`,
        });
        return;
      }
      const parsed = ClaudeJson.safeParse(JSON.parse(stdout || "{}"));
      if (!parsed.success) {
        resolvePromise({ ok: false, text: stdout, error: "could not parse claude json" });
        return;
      }
      const j = parsed.data;
      resolvePromise({
        ok: j.is_error !== true,
        text: j.result ?? "",
        sessionId: j.session_id,
        costUsd: j.total_cost_usd,
        error: j.is_error ? j.subtype ?? "agent reported error" : undefined,
      });
    });
  });
}
