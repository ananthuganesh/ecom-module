/**
 * Rate-limit helpers for forms. The API answers 429 with a Retry-After header
 * (seconds until the limit resets; apps/api/app/services/rate_limit.py).
 */

/** Seconds the API asked us to wait, or 0 when the error isn't a rate limit. */
export function retryAfterSeconds(err) {
  if (err?.response?.status !== 429) return 0;
  const header = Number(err.response.headers?.["retry-after"]);
  return Number.isFinite(header) && header > 0 ? Math.ceil(header) : 60;
}

/** 45 → "45s", 760 → "12:40". */
export function formatWait(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
