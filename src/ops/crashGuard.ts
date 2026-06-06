/**
 * Crash-loop guard (PRD §4.5.4). pm2 already spaces and caps restarts
 * (min_uptime/max_restarts/backoff); this adds the missing signal: when the app
 * crashes repeatedly in a short window, DM Navid instead of failing silently.
 *
 * Clean vs crash is detected with a flag file (LAST_EXIT_PATH): a graceful
 * shutdown writes {clean:true}; this module rewrites {clean:false} as the first
 * I/O each boot. So if a boot finds the previous flag still false (or missing),
 * the prior process died without a graceful shutdown — count it as a crash.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  CRASH_HISTORY_PATH,
  CRASH_LOOP_THRESHOLD,
  CRASH_WINDOW_MS,
  LAST_EXIT_PATH,
  NAVID_DM_CHANNEL_ID,
} from "../config.js";
import { sendChatMessage } from "../clickup/rest.js";

interface CrashHistory {
  crashes: number[]; // epoch ms of recent crash-boots
  lastNotifiedAt?: number; // epoch ms of the last Navid alert (to notify once per crossing)
}

async function readHistory(): Promise<CrashHistory> {
  try {
    const h = JSON.parse(await readFile(CRASH_HISTORY_PATH, "utf8")) as Partial<CrashHistory>;
    return { crashes: Array.isArray(h.crashes) ? h.crashes : [], lastNotifiedAt: h.lastNotifiedAt };
  } catch {
    return { crashes: [] };
  }
}

async function priorExitWasCrash(): Promise<boolean> {
  try {
    const flag = JSON.parse(await readFile(LAST_EXIT_PATH, "utf8")) as { clean?: boolean };
    return flag.clean !== true;
  } catch {
    return true; // missing/unreadable flag → treat as a non-graceful exit (crash)
  }
}

/**
 * Run as the FIRST I/O at boot. Records a crash if the prior exit wasn't clean,
 * alerts Navid once when the rate trips the threshold, then arms the flag so this
 * boot is treated as a crash unless it shuts down gracefully.
 */
export async function recordBootAndMaybeAlert(): Promise<void> {
  const now = Date.now();
  const crashed = await priorExitWasCrash();
  const hist = await readHistory();

  if (crashed) {
    hist.crashes.push(now);
    // Keep only crashes within the window.
    hist.crashes = hist.crashes.filter((t) => now - t < CRASH_WINDOW_MS);

    const recent = hist.crashes.length;
    const alreadyNotified = hist.lastNotifiedAt != null && now - hist.lastNotifiedAt < CRASH_WINDOW_MS;
    if (recent >= CRASH_LOOP_THRESHOLD && !alreadyNotified) {
      const mins = Math.round(CRASH_WINDOW_MS / 60000);
      const msg =
        `⚠ Crash-loop alert: I've restarted ${recent} times in the last ${mins} min ` +
        `(not graceful restarts — crashes). Something is wrong at startup or runtime. ` +
        `pm2 will stop retrying after its cap; please check the logs.`;
      try {
        await sendChatMessage(NAVID_DM_CHANNEL_ID, msg);
        hist.lastNotifiedAt = now;
        console.error(`[crashGuard] crash loop (${recent}/${CRASH_LOOP_THRESHOLD}) — alerted Navid`);
      } catch (err) {
        console.error("[crashGuard] crash loop detected but DM to Navid failed:", (err as Error).message);
      }
    } else {
      console.warn(`[crashGuard] prior exit was a crash (${recent} in window)`);
    }
    await writeFile(CRASH_HISTORY_PATH, JSON.stringify(hist, null, 2) + "\n", "utf8").catch(() => {});
  }

  // Arm the flag: if THIS process dies without a graceful shutdown, next boot sees a crash.
  await writeFile(
    LAST_EXIT_PATH,
    JSON.stringify({ clean: false, pid: process.pid, bootAt: now }) + "\n",
    "utf8",
  ).catch(() => {});
}
