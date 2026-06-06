import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root (one level up from src/). */
export const REPO_ROOT = resolve(__dirname, "..");

/** The contract is loaded fresh into every agent run (contract's one hard demand). */
export const CONTRACT_PATH = resolve(REPO_ROOT, "CONTRACT.md");

/** Git-ignored runtime dir for events, threads, memory. */
export const DATA_DIR = resolve(REPO_ROOT, "data");

// --- env helpers ---------------------------------------------------------

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var ${key}. Copy .env.example to .env and fill it in.`);
  }
  return v.trim();
}

function requireIntEnv(key: string): number {
  const v = requireEnv(key);
  const n = Number(v);
  if (!Number.isInteger(n)) {
    throw new Error(`Env var ${key} must be an integer, got "${v}".`);
  }
  return n;
}

function optionalEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

function optionalIntEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) {
    throw new Error(`Env var ${key} must be an integer, got "${v}".`);
  }
  return n;
}

/** First env var that is set wins; throws if none are. Used for renamed vars. */
function requireIntEnvAny(keys: string[]): number {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim() !== "") return requireIntEnv(k);
  }
  throw new Error(`Missing required env var (one of: ${keys.join(", ")}).`);
}

// --- configuration (sourced from .env) -----------------------------------

/** ClickUp workspace ("team") id. */
export const WORKSPACE_ID = requireEnv("CLICKUP_WORKSPACE_ID");

/**
 * The agent's display name. This is just the persona this instance runs as — the
 * real identity (voice, account, rules) is defined in CONTRACT.md. Another
 * instance loads a different contract and sets a different AGENT_NAME. Used for
 * @mention detection and for labelling the agent's turns in thread files.
 */
export const AGENT_NAME = optionalEnv("AGENT_NAME", "Aso Dara");

/**
 * Known ClickUp identities. `agentUserId` is the account the agent speaks as; the
 * loop guard ignores events authored by it. (AGENT_USER_ID; ASO_USER_ID accepted
 * for backward compatibility.)
 */
export const IDENTITY = {
  agentUserId: requireIntEnvAny(["AGENT_USER_ID", "ASO_USER_ID"]),
  navidUserId: requireIntEnv("NAVID_USER_ID"), // founder, final word
  somiUserId: requireIntEnv("SOMI_USER_ID"), // teammate
} as const;

/** Private chat with Navid (PRD §6.2). Pinned so the agent never misroutes a DM. */
export const NAVID_DM_CHANNEL_ID = requireEnv("NAVID_DM_CHANNEL_ID");

/** The Subturtle.app public group chat channel (contract's public discussion channel). */
export const PUBLIC_CHANNEL_ID = requireEnv("PUBLIC_CHANNEL_ID");

/** The Subturtle.app task list. */
export const SUBTURTLE_APP_LIST_ID = requireEnv("SUBTURTLE_APP_LIST_ID");

/**
 * Mixpanel projects the heartbeat reads (PRD §8 action item — pinned so the agent
 * never guesses). Prod = the live app with real users; dev = staging. The
 * heartbeat reads both and reports them separately. MCP access is enabled at the
 * Mixpanel org level (Settings → Organization → Overview).
 */
export const MIXPANEL_PROD_PROJECT_ID = optionalEnv("MIXPANEL_PROD_PROJECT_ID", "2795069");
export const MIXPANEL_DEV_PROJECT_ID = optionalEnv("MIXPANEL_DEV_PROJECT_ID", "3785672");

/**
 * Model per run kind. Sonnet for frequent PM/manual work; Opus reserved for
 * heartbeats and self-improvement (PRD §3). Overridable via env.
 */
export const MODEL = {
  pm: optionalEnv("MODEL_PM", "sonnet"),
  heartbeat: optionalEnv("MODEL_HEARTBEAT", "opus"),
} as const;

// --- M2: webhook listener + chat poller ----------------------------------

/**
 * ClickUp personal API token (the agent's account). The claude.ai connector has NO
 * webhook tool, so registering/listing webhooks and the cheap chat poll go
 * through the REST API with this token. Acting (comments/chat replies) still
 * happens via the claude.ai connector inside agent runs — this token is for
 * the plumbing only. Optional at import time so the M1 manual triggers still
 * load without it; the REST client throws a clear error if it's actually used.
 */
export const CLICKUP_API_TOKEN = optionalEnv("CLICKUP_API_TOKEN", "");

/** The public HTTPS URL ClickUp POSTs events to (used by `webhook register`). */
export const WEBHOOK_PUBLIC_URL = optionalEnv("WEBHOOK_PUBLIC_URL", "");

/** Path the listener serves; ClickUp posts here. Must match WEBHOOK_PUBLIC_URL's path. */
export const WEBHOOK_PATH = optionalEnv("WEBHOOK_PATH", "/clickup/webhook");

/** Port the HTTPS listener binds. 443 in prod (needs cap_net_bind_service). */
export const PORT = optionalIntEnv("PORT", 443);

/**
 * Whether the origin serves TLS itself. True for direct-to-origin (Cloudflare
 * "Full" → self-signed cert on :443). False behind a Cloudflare Tunnel, where
 * cloudflared terminates public TLS and reaches a plain-HTTP loopback listener
 * (no cert, no privileged port).
 */
export const SERVER_TLS = optionalEnv("SERVER_TLS", "true") !== "false";

/** Self-signed origin cert (only used when SERVER_TLS is true). */
export const TLS_CERT_PATH = resolve(REPO_ROOT, optionalEnv("TLS_CERT_PATH", "data/tls/origin.crt"));
export const TLS_KEY_PATH = resolve(REPO_ROOT, optionalEnv("TLS_KEY_PATH", "data/tls/origin.key"));

/** Chat poll cadence — ClickUp has no chat webhook, so DMs are polled (PRD §4.1). */
export const POLL_INTERVAL_MS = optionalIntEnv("POLL_INTERVAL_MS", 90_000);

/** Compact a thread file once it grows past this many bytes (PRD §4.2.4). */
export const THREAD_COMPACT_BYTES = optionalIntEnv("THREAD_COMPACT_BYTES", 24_000);

/**
 * Task events we subscribe to. Comments are classified A (mention of the agent, wake
 * now) vs B (activity, inbox) at dispatch time; the rest are Category-B activity.
 * Scoped to the Subturtle.app list on registration (PRD §6.3 — minimal default).
 */
export const WEBHOOK_EVENTS = [
  "taskCommentPosted",
  "taskCreated",
  "taskUpdated",
  "taskStatusUpdated",
  "taskMoved",
  "taskAssigneeUpdated",
] as const;

// --- runtime data paths (all under the git-ignored data/ dir) ------------

export const THREADS_DIR = resolve(DATA_DIR, "threads");
export const THREAD_INDEX_PATH = resolve(THREADS_DIR, "INDEX.md");
export const EVENTS_DIR = resolve(DATA_DIR, "events");
export const INBOX_PATH = resolve(EVENTS_DIR, "inbox.jsonl");
export const PROCESSED_PATH = resolve(EVENTS_DIR, "processed.jsonl");
export const POLLER_DIR = resolve(DATA_DIR, "poller");
export const POLLER_CURSORS_PATH = resolve(POLLER_DIR, "cursors.json");
export const TLS_DIR = resolve(DATA_DIR, "tls");

/** Webhook registration state (id + signing secret) written by `webhook register`. */
export const WEBHOOKS_STATE_PATH = resolve(DATA_DIR, "webhooks.json");

// --- M4: self-management (restart + crash-loop guard) --------------------

/** A pending restart request {at, reason} (PRD §4.5.1) — picked up by the restart watcher. */
export const RESTART_REQUEST_PATH = resolve(DATA_DIR, "restart.json");

/**
 * Clean/crash exit flag. Written {clean:false} as the first I/O each boot, flipped
 * to {clean:true} only on a graceful shutdown. If a boot finds the previous flag
 * still false (or missing), the prior process crashed (PRD §4.5.4).
 */
export const LAST_EXIT_PATH = resolve(DATA_DIR, "last-exit.json");

/** Rolling record of recent crash timestamps (+ lastNotified) for the crash-loop guard. */
export const CRASH_HISTORY_PATH = resolve(DATA_DIR, "crash-history.json");

/** Crashes within CRASH_WINDOW_MS that trip the guard and DM Navid (PRD §4.5.4). */
export const CRASH_LOOP_THRESHOLD = optionalIntEnv("CRASH_LOOP_THRESHOLD", 5);
export const CRASH_WINDOW_MS = optionalIntEnv("CRASH_WINDOW_MS", 60 * 60 * 1000);

/** How often the restart watcher checks for a due, idle-safe restart. */
export const RESTART_WATCH_MS = optionalIntEnv("RESTART_WATCH_MS", 30_000);

// --- M3: rhythms (PM check + heartbeat) ----------------------------------

/** PM check cadence — every 5 hours by default (PRD §4.1.3). */
export const PM_CHECK_INTERVAL_MS = optionalIntEnv("PM_CHECK_INTERVAL_MS", 5 * 60 * 60 * 1000);

/** Heartbeat runs on weekdays (Mon–Fri) at this local hour in HEARTBEAT_TZ (PRD §4.1.4). */
export const HEARTBEAT_HOUR = optionalIntEnv("HEARTBEAT_HOUR", 8);
export const HEARTBEAT_TZ = optionalEnv("HEARTBEAT_TZ", "Europe/Vilnius");

/** Council repo — read-only context for the heartbeat. Cloned fresh, never pushed to. */
export const COUNCIL_REPO = optionalEnv("COUNCIL_REPO", "codebridger/subturtle-docs");
export const COUNCIL_DIR = resolve(DATA_DIR, "council/subturtle-docs"); // git-ignored under /data/*

/** The agent's own beat-log history — version-controlled in this repo. */
export const HEARTBEATS_DIR = resolve(DATA_DIR, "heartbeats");

/** Scheduler state (last PM/heartbeat run), so rhythms survive restarts. */
export const SCHEDULE_STATE_PATH = resolve(DATA_DIR, "schedule.json");

/** Git author email for the agent's history commits (name = AGENT_NAME). */
export const AGENT_GIT_EMAIL = optionalEnv("AGENT_GIT_EMAIL", "info@codebridger.co.uk");
