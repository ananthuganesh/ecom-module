/**
 * Scheduled sale price helpers shared by the admin product form and storefront.
 * The API stores sale times in UTC; the admin edits them as local (IST) times.
 */

export function parseApiDate(value) {
  if (!value) return null;
  const text = String(value);
  // Naive API datetimes are UTC.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** API datetime → value for <input type="datetime-local"> in the viewer's timezone. */
export function toDateTimeLocal(value) {
  const date = parseApiDate(value);
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) → ISO UTC string, or null. */
export function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function saleFormFromProduct(product) {
  const sale = product?.sale;
  return {
    price: sale?.price != null ? String(sale.price) : "",
    startsAt: toDateTimeLocal(sale?.startsAt),
    endsAt: toDateTimeLocal(sale?.endsAt),
  };
}

/** What the admin form sends; null clears the sale. */
export function salePayload(form) {
  const price = Number(String(form?.price ?? "").replace(/[^\d.]/g, ""));
  if (!form?.price || !Number.isFinite(price) || price <= 0) return null;
  return {
    price: Math.round(price * 100) / 100,
    startsAt: fromDateTimeLocal(form.startsAt),
    endsAt: fromDateTimeLocal(form.endsAt),
    // The admin no longer sets daily flash hours; null clears any older window.
    dailyStart: null,
    dailyEnd: null,
  };
}

/** When the running stretch of a live sale stops — today's window close or the sale end. */
export function saleCountdownTarget(sale) {
  return sale?.liveUntil || sale?.endsAt || null;
}

/** Status of a saved sale: "live" | "scheduled" | "ended" | null. */
export function saleStatus(sale, now = new Date()) {
  if (!sale?.price) return null;
  if (sale.live) return "live";
  const endsAt = parseApiDate(sale.endsAt);
  if (endsAt && endsAt <= now) return "ended";
  return "scheduled";
}

export function percentOff(fullPrice, price) {
  const full = Number(fullPrice);
  const now = Number(price);
  if (!(full > 0) || !(now > 0) || now >= full) return 0;
  return Math.round(((full - now) / full) * 100);
}

/** Time left until ``endsAt`` as { days, hours, minutes, seconds, ms }, or null once it has passed. */
export function countdownParts(endsAt, now = Date.now()) {
  const end = parseApiDate(endsAt);
  if (!end) return null;
  const ms = end.getTime() - Number(now);
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    ms,
  };
}

/** The live hrs/min/sec timer only appears in a sale's final stretch. */
export const LIVE_COUNTDOWN_HOURS = 24;

export function showLiveCountdown(left, hours = LIVE_COUNTDOWN_HOURS) {
  // Strictly under, so the Hrs box never needs a Days box beside it.
  return Boolean(left) && left.ms < hours * 3600 * 1000;
}
