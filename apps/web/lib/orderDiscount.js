/**
 * Order-level coupon helpers shared by bills, the account order page and admin.
 * Allocation mirrors allocate_order_discount in apps/api/app/services/erp_ops.py.
 */

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Coupon code the order was placed with (standard or Magic Checkout), or "". */
export function orderCouponCode(order) {
  const details =
    order?.transactionDetails && typeof order.transactionDetails === "object"
      ? order.transactionDetails
      : {};
  const code = order?.couponCode || details.magicPromotion?.code || "";
  return String(code).trim().toUpperCase();
}

/** Order-level discount in rupees. */
export function orderDiscountAmount(order) {
  return money(Math.max(0, Number(order?.discountAmount || order?.discount || 0)));
}

/** Label for a bill's discount row: "Coupon (SAVE80)" or plain "Discount". */
export function discountLabel(order, fallback = "Discount") {
  const code = orderCouponCode(order);
  return code ? `Coupon (${code})` : fallback;
}

/**
 * Spread a discount across line values by share, to the paise. Rounding drift
 * lands on the last priced line; the total is capped at the sum of lines.
 */
export function allocateDiscount(values, discount) {
  const vals = (values || []).map((v) => Math.max(0, Number(v) || 0));
  const gross = vals.reduce((s, v) => s + v, 0);
  const shares = vals.map(() => 0);
  const total = money(Math.min(Math.max(Number(discount) || 0, 0), gross));
  if (gross <= 0 || total <= 0) return shares;

  let last = -1;
  vals.forEach((v, i) => {
    if (v > 0) last = i;
  });
  let allocated = 0;
  for (let i = 0; i < last; i += 1) {
    shares[i] = money((total * vals[i]) / gross);
    allocated += shares[i];
  }
  shares[last] = money(total - allocated);
  return shares;
}
