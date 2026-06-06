/**
 * In-flight wake counter, in its own module so the restart watcher can read it
 * without importing handle.ts (which would create an import cycle through the
 * control actions → restart). The restart watcher waits for this to reach 0 so a
 * wake (and its claude child) is never killed mid-run.
 */

let inFlight = 0;

export function enterWake(): void {
  inFlight++;
}

export function exitWake(): void {
  inFlight--;
}

export function inFlightWakes(): number {
  return inFlight;
}
