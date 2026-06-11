/**
 * A small standard-5-field cron matcher — `minute hour day-of-month month day-of-week`.
 * No dependency: the scheduler ticks every 60s and asks "does this cron match the
 * current minute (in the job's timezone)?". Supports per field: `*`, a number, a
 * `a-b` range, an `a,b,c` list, and `*`/`a-b` with a `/step`. day-of-week is 0–6
 * (Sun–Sat); 7 is also accepted as Sunday.
 *
 * Semantics: all five fields are AND-ed (including day-of-month AND day-of-week —
 * we do NOT use the classic OR-quirk, because the agent writes these and predictable
 * AND is clearer; real schedules constrain one of dom/dow anyway).
 */

export interface CronFields {
  minute: number; // 0–59
  hour: number; // 0–23
  dom: number; // 1–31
  month: number; // 1–12
  dow: number; // 0–6 (Sun–Sat)
}

interface Range {
  min: number;
  max: number;
}

const RANGES: Record<keyof CronFields, Range> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dow: { min: 0, max: 6 },
};

/** Expand one cron field token into the explicit set of values it matches. Throws on malformed input. */
function matchValues(token: string, range: Range): Set<number> {
  const out = new Set<number>();
  for (const part of token.split(",")) {
    const [body, stepRaw] = part.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${part}"`);

    let lo: number;
    let hi: number;
    if (body === "*" || body === undefined || body === "") {
      lo = range.min;
      hi = range.max;
    } else if (body.includes("-")) {
      const [a, b] = body.split("-").map(Number);
      lo = a as number;
      hi = b as number;
    } else {
      lo = Number(body);
      hi = lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) throw new Error(`bad range in "${part}"`);
    if (lo < range.min || hi > range.max) throw new Error(`"${part}" out of bounds ${range.min}-${range.max}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse a 5-field cron string into per-field value sets. Throws with a clear message if invalid. */
export function parseCron(expr: string): Record<keyof CronFields, Set<number>> {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron must have 5 fields (got ${fields.length}): "${expr}"`);
  const keys: (keyof CronFields)[] = ["minute", "hour", "dom", "month", "dow"];
  const parsed = {} as Record<keyof CronFields, Set<number>>;
  keys.forEach((key, i) => {
    let token = fields[i] as string;
    if (key === "dow") token = token.replace(/\b7\b/g, "0"); // 7 == Sunday
    parsed[key] = matchValues(token, RANGES[key]);
  });
  return parsed;
}

/** True if `expr` is a well-formed 5-field cron. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

/** Does `expr` match the given moment (already broken into the job's local fields)? */
export function cronMatches(expr: string, at: CronFields): boolean {
  const p = parseCron(expr);
  return (
    p.minute.has(at.minute) &&
    p.hour.has(at.hour) &&
    p.dom.has(at.dom) &&
    p.month.has(at.month) &&
    p.dow.has(at.dow)
  );
}

/**
 * Reject crons that would fire too often to be a safe autonomous agent run. The minute
 * field must pin a specific minute (or list/range/step) — a bare star (every minute) or
 * a star-step minute is refused, capping the practical floor near hourly.
 */
export function isSafeCron(expr: string): { ok: boolean; reason?: string } {
  if (!isValidCron(expr)) return { ok: false, reason: "not a valid 5-field cron" };
  const minuteField = expr.trim().split(/\s+/)[0] as string;
  if (minuteField === "*" || /^\*\//.test(minuteField)) {
    return { ok: false, reason: "minute field cannot be '*' or '*/n' (would run too frequently)" };
  }
  return { ok: true };
}
