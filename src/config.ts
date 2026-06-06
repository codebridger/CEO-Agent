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

// --- configuration (sourced from .env) -----------------------------------

/** ClickUp workspace ("team") id. */
export const WORKSPACE_ID = requireEnv("CLICKUP_WORKSPACE_ID");

/**
 * Known ClickUp identities. The agent acts as Aso Dara; the loop guard ignores
 * events authored by Aso's own account.
 */
export const IDENTITY = {
  asoUserId: requireIntEnv("ASO_USER_ID"), // Aso Dara — the agent speaks as this
  navidUserId: requireIntEnv("NAVID_USER_ID"), // Navid Shad (founder, final word)
  somiUserId: requireIntEnv("SOMI_USER_ID"), // Somayeh Roohani (full-stack)
} as const;

/** Private chat with Navid (PRD §6.2). Pinned so the agent never misroutes a DM. */
export const NAVID_DM_CHANNEL_ID = requireEnv("NAVID_DM_CHANNEL_ID");

/** The Subturtle.app public group chat channel (contract's public discussion channel). */
export const PUBLIC_CHANNEL_ID = requireEnv("PUBLIC_CHANNEL_ID");

/** The Subturtle.app task list. */
export const SUBTURTLE_APP_LIST_ID = requireEnv("SUBTURTLE_APP_LIST_ID");

/**
 * Model per run kind. Sonnet for frequent PM/manual work; Opus reserved for
 * heartbeats and self-improvement (PRD §3). Overridable via env.
 */
export const MODEL = {
  pm: optionalEnv("MODEL_PM", "sonnet"),
  heartbeat: optionalEnv("MODEL_HEARTBEAT", "opus"),
} as const;
