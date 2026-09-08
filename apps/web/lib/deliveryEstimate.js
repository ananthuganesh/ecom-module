/**
 * Expected-delivery window shown on the product page.
 *
 * Counts calendar days from when the page is opened: +3 at the earliest,
 * +6 at the latest, matching the 3–6 day promise in the shipping copy.
 */

export const DELIVERY_MIN_DAYS = 3;
export const DELIVERY_MAX_DAYS = 6;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** 1st, 2nd, 3rd, 4th … 11th/12th/13th are the exceptions, not 1st/2nd/3rd. */
export function ordinal(day) {
  const n = Number(day);
  if (!Number.isFinite(n)) return "";
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** e.g. "Thu, Sep 10th" */
export function formatDeliveryDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}`;
}

function addDays(from, days) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

/** e.g. "Thu, Sep 10th - Sun, Sep 13th" */
export function estimateDeliveryWindow(from = new Date()) {
  const base = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(base.getTime())) return "";
  const start = formatDeliveryDate(addDays(base, DELIVERY_MIN_DAYS));
  const end = formatDeliveryDate(addDays(base, DELIVERY_MAX_DAYS));
  return `${start} - ${end}`;
}

/** Full line as shown under the pincode box. */
export function expectedDeliveryLabel(from = new Date()) {
  const window = estimateDeliveryWindow(from);
  return window ? `Expected Delivery: ${window}` : "";
}
