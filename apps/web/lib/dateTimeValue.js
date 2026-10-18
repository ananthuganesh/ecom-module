/**
 * Helpers for the admin DateTimePicker. Values are the same local
 * "YYYY-MM-DDTHH:mm" strings an <input type="datetime-local"> uses, so callers
 * keep converting with lib/saleSchedule's fromDateTimeLocal / toDateTimeLocal.
 */

const pad = (n) => String(n).padStart(2, "0");

/** "2026-11-01T22:05" → { date, hour12: 10, minute: 5, meridiem: "PM" }, or null. */
export function parseLocalValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date,
    hour12: h % 12 || 12,
    minute: mi,
    meridiem: h >= 12 ? "PM" : "AM",
  };
}

/** Day + 12h clock → "YYYY-MM-DDTHH:mm". */
export function buildLocalValue(date, hour12, minute, meridiem) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const h12 = Math.min(12, Math.max(1, Number(hour12) || 12));
  const hours = (h12 % 12) + (meridiem === "PM" ? 12 : 0);
  const mins = Math.min(59, Math.max(0, Number(minute) || 0));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    hours
  )}:${pad(mins)}`;
}

/** The current minute as a picker value. */
export function nowLocalValue(now = new Date()) {
  return buildLocalValue(now, now.getHours() % 12 || 12, now.getMinutes(), now.getHours() >= 12 ? "PM" : "AM");
}

/** "Sun, 1 Nov, 2026 · 10:05 PM" for the picker button. */
export function formatLocalValue(value) {
  const parts = parseLocalValue(value);
  if (!parts) return "";
  const day = parts.date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${day} · ${parts.hour12}:${pad(parts.minute)} ${parts.meridiem}`;
}

/** Minute choices in 5s, keeping an off-step minute that is already set. */
export function minuteOptions(current) {
  const steps = Array.from({ length: 12 }, (_, i) => i * 5);
  const n = Number(current);
  if (Number.isInteger(n) && n >= 0 && n < 60 && !steps.includes(n)) {
    steps.push(n);
    steps.sort((a, b) => a - b);
  }
  return steps;
}
