import { spawn } from "node:child_process";
import { z } from "zod";
import { CONTRACT_PATH, MODEL } from "../config.js";
import { DISALLOWED_TOOLS } from "./policy.js";
import { readStandingMemory } from "../memory/notes.js";

export interface RunOptions {
  /** The task-specific prompt (the contract is loaded separately as system prompt). */
  task: string;
  /** Which model tier to use. */
  model?: (typeof MODEL)[keyof typeof MODEL];
  /** Hard wall-clock limit; the child is killed past this. */
  timeoutMs?: number;
  /** Extra tools to block for this run only (merged with the standing denials). */
  disallowTools?: string[];
  /** Prepend the agent's standing memory to the task (default true; off for internal runs like compaction). */
  includeMemory?: boolean;
  /**
   * When set, the run streams its progress and this is called for each step (a tool the
   * agent invoked, or a chunk of its own text) as it happens — used to leave footprints for
   * an unattended long job. Providing it switches the run to stream-json output.
   */
  onEvent?: (ev: StepEvent) => void;
}

/** One observable step of a streaming run. */
export interface StepEvent {
  kind: "tool" | "text";
  /** Tool name, or a short excerpt of the agent's text. */
  label: string;
  /** Optional extra detail (e.g. a brief summary of the tool input). */
  detail?: string;
}

export interface RunResult {
  ok: boolean;
  text: string;
  sessionId?: string;
  costUsd?: number;
  error?: string;
}

/**
 * Environment for the spawned agent, with the app's privileged secrets stripped.
 * The agent acts on ClickUp through the claude.ai connector (its own auth), so it
 * never needs the app's REST token — and leaving CLICKUP_API_TOKEN in its env would
 * let a run bypass every app-side guardrail by calling the ClickUp API directly via
 * Bash. (The agent still has Bash + network; full sandboxing is a separate task.)
 */
const SECRET_ENV_KEYS = ["CLICKUP_API_TOKEN"];
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of SECRET_ENV_KEYS) delete env[k];
  return env;
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
/** Briefly summarize a tool's input for the step log (one short line, never huge). */
function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  // Prefer the few fields that say what the call is actually doing.
  for (const k of ["url", "command", "query", "path", "file_path", "channelId", "taskId", "prompt"]) {
    if (typeof o[k] === "string" && o[k]) return `${k}=${String(o[k]).slice(0, 100)}`;
  }
  try {
    return JSON.stringify(o).slice(0, 100);
  } catch {
    return "";
  }
}

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const { task, model = MODEL.pm, timeoutMs = 300_000, disallowTools = [], onEvent } = opts;
  const streaming = Boolean(onEvent);

  // Prepend standing memory so durable facts are in front of the agent on every run.
  const memory = opts.includeMemory === false ? "" : (await readStandingMemory()).trim();
  const fullTask = memory
    ? "Standing memory — durable facts you've chosen to remember. Treat these as current truth " +
      "about the team, the product, and your situation unless this conversation overrides them:\n" +
      `---\n${memory}\n---\n\n${task}`
    : task;

  const args = [
    "--print",
    fullTask,
    "--output-format",
    streaming ? "stream-json" : "json",
    ...(streaming ? ["--verbose"] : []),
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
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"], env: childEnv() });
    let stdout = "";
    let stderr = "";
    let lineBuf = ""; // streaming: holds a partial NDJSON line across data chunks
    let streamed: RunResult | null = null; // streaming: the final "result" event, mapped

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise({ ok: false, text: "", error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    // stream-json emits one JSON object per line; surface tool calls / agent text as they land.
    const handleStreamLine = (line: string): void => {
      let ev: { type?: string; message?: { content?: unknown }; result?: string; is_error?: boolean; subtype?: string; session_id?: string; total_cost_usd?: number };
      try {
        ev = JSON.parse(line);
      } catch {
        return; // ignore non-JSON / partial noise
      }
      if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
        for (const c of ev.message!.content as Array<Record<string, unknown>>) {
          if (c.type === "tool_use" && typeof c.name === "string") {
            onEvent!({ kind: "tool", label: c.name, detail: summarizeToolInput(c.input) });
          } else if (c.type === "text" && typeof c.text === "string" && c.text.trim()) {
            onEvent!({ kind: "text", label: c.text.trim().slice(0, 200) });
          }
        }
      } else if (ev.type === "result") {
        streamed = {
          ok: ev.is_error !== true,
          text: ev.result ?? "",
          sessionId: ev.session_id,
          costUsd: ev.total_cost_usd,
          error: ev.is_error ? ev.subtype ?? "agent reported error" : undefined,
        };
      }
    };

    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      if (!streaming) return;
      lineBuf += s;
      let nl: number;
      while ((nl = lineBuf.indexOf("\n")) >= 0) {
        const line = lineBuf.slice(0, nl).trim();
        lineBuf = lineBuf.slice(nl + 1);
        if (line) handleStreamLine(line);
      }
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, text: "", error: `spawn failed: ${err.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (streaming) {
        // The final "result" event carries the same payload the non-streaming path parses.
        if (streamed) return resolvePromise(streamed);
        return resolvePromise({
          ok: false,
          text: "",
          error: code !== 0 ? `claude exited ${code}: ${stderr.trim() || stdout.trim()}` : "no result event in stream",
        });
      }
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
