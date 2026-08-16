/** Store timezone — admin and storefront clocks should match India, not the browser/server. */
export const ADMIN_TIME_ZONE = "Asia/Kolkata";

/**
 * API datetimes are stored with datetime.utcnow() and often serialized without a
 * timezone (`2026-08-16T09:06:00`). JS treats that as local time, so India sees
 * UTC clock time (~5h 30m behind). Naive strings are UTC.
 */
export function parseAdminDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(" ", "T");
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasZone) s = `${s}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Admin list date+time: `20 Apr at 11:02 am` (Asia/Kolkata) */
export function formatAdminDateTime(iso) {
  const d = parseAdminDate(iso);
  if (!d) return "";
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: ADMIN_TIME_ZONE,
  }).format(d);
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: ADMIN_TIME_ZONE,
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  })
    .format(d)
    .replace(/\u202f/g, " ")
    .toLowerCase();
  return `${day} ${month} at ${time}`;
}

/** Order detail: `August 16, 2026 at 2:36 pm` (Asia/Kolkata) */
export function formatAdminLongDateTime(iso) {
  const d = parseAdminDate(iso);
  if (!d) return "—";
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: ADMIN_TIME_ZONE,
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  })
    .format(d)
    .replace(/\u202f/g, " ")
    .toLowerCase();
  return `${datePart} at ${timePart}`;
}
