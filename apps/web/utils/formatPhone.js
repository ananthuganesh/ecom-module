/**
 * Format phone for display, e.g. "+91 90727 17181".
 * Assumes Indian mobiles when given 10 digits (or 12 starting with 91).
 */
export function formatPhone(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;

  let national = digits;
  if (digits.length === 12 && digits.startsWith("91")) {
    national = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    national = digits.slice(1);
  }

  if (national.length === 10) {
    return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
  }

  if (digits.length > 10 && digits.startsWith("91")) {
    const rest = digits.slice(2);
    if (rest.length >= 10) {
      return `+91 ${rest.slice(0, 5)} ${rest.slice(5, 10)}${rest.length > 10 ? ` ${rest.slice(10)}` : ""}`;
    }
  }

  return raw.startsWith("+") ? raw : raw;
}
