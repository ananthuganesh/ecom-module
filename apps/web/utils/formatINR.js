/** Always show INR with two decimals, e.g. ₹1,234.00 */
export function formatINR(value, { signed = false } = {}) {
  const n = Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(amount);
  const body = abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (signed) {
    if (amount < 0) return `-₹${body}`;
    if (amount > 0) return `+₹${body}`;
  }
  return `₹${body}`;
}
