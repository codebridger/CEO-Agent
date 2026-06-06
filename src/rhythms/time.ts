/** Local-time helpers for the heartbeat schedule, via Intl (no deps). */

export interface LocalParts {
  /** "YYYY-MM-DD" in the target timezone. */
  dateStr: string;
  /** Hour 0–23 in the target timezone. */
  hour: number;
  /** 0=Sun … 6=Sat in the target timezone. */
  weekday: number;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(tz: string, now: Date = new Date()): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some ICU builds report midnight as 24
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    weekday: WD[get("weekday")] ?? 0,
  };
}

export function isWeekday(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}
