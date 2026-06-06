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

/** ClickUp workspace ("team") id — not secret. */
export const WORKSPACE_ID = "9018800487";

/**
 * Known ClickUp identities. The agent acts as Aso Dara via the claude.ai ClickUp
 * connector (re-authed to Aso's account); the loop guard ignores events authored
 * by Aso's own account.
 */
export const IDENTITY = {
  asoUserId: 113552267, // Aso Dara (info@codebridger.co.uk) — the agent speaks as this
  navidUserId: 78238611, // Navid Shad (founder, final word)
  somiUserId: 78238620, // Somayeh Roohani (full-stack)
} as const;

/**
 * Canonical ClickUp DM channel for "private chat with Navid" (PRD §6.2). The
 * connector can't map a DM channel to its members, so we pin the id explicitly to
 * stop the agent guessing (it once posted to its own notes channel by mistake).
 */
export const NAVID_DM_CHANNEL_ID = "8crzyb7-1458";

/** The Subturtle.app public group chat channel (contract's public discussion channel). */
export const PUBLIC_CHANNEL_ID = "6-901805492347-8";

/**
 * Model per run kind. Sonnet for frequent PM/manual work; Opus reserved for
 * heartbeats and self-improvement (PRD §3).
 */
export const MODEL = {
  pm: "sonnet",
  heartbeat: "opus",
} as const;
