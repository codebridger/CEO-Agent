/**
 * ClickUp webhook signature verification (PRD §4.1). ClickUp signs each request
 * with `X-Signature` = HMAC-SHA256(raw request body, webhook secret), hex. We
 * recompute it over the EXACT raw bytes (not re-serialized JSON) and compare in
 * constant time.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function computeSignature(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** True iff the header matches HMAC-SHA256(rawBody, secret). Defensive on every input. */
export function verifySignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const expected = computeSignature(rawBody, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
