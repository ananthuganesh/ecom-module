/**
 * India apparel GST slabs (sale price per piece, tax-inclusive retail):
 * - up to ₹2,500 → 5%
 * - above ₹2,500 → 18%
 */
export const GST_SLAB_THRESHOLD = 2500;
export const GST_RATE_LOW = 5;
export const GST_RATE_HIGH = 18;

export function gstRateForUnitPrice(unitPrice) {
  const price = Number(unitPrice) || 0;
  if (price <= 0) return GST_RATE_LOW;
  return price > GST_SLAB_THRESHOLD ? GST_RATE_HIGH : GST_RATE_LOW;
}

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * GST % from MRP using apparel slabs (automatic).
 */
export function resolveProductTaxRate({ mrp } = {}) {
  return gstRateForUnitPrice(mrp);
}

/** Split a tax-inclusive amount into taxable + GST. */
export function splitInclusiveGst(amount, rate) {
  const gross = Number(amount) || 0;
  const r = Number(rate) || 0;
  if (gross <= 0) return { taxable: 0, gst: 0, rate: r };
  if (r <= 0) return { taxable: roundMoney(gross), gst: 0, rate: 0 };
  const taxable = roundMoney(gross / (1 + r / 100));
  const gst = roundMoney(gross - taxable);
  return { taxable, gst, rate: r };
}
