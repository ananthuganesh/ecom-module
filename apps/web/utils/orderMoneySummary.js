import { allocateDiscount, discountLabel, orderCouponCode, orderDiscountAmount } from "@/lib/orderDiscount";
import { gstRateForLine, roundMoney, splitInclusiveGst } from "@/utils/gstRate";

function storedTax(order) {
  const details = order?.transactionDetails && typeof order.transactionDetails === "object"
    ? order.transactionDetails
    : {};
  const candidates = [
    order?.taxPrice,
    order?.taxAmount,
    details.taxAmount,
    details.tax,
    details.gstAmount,
    details.gst,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return roundMoney(n);
  }
  return 0;
}

/**
 * Tax-inclusive retail totals for storefront order summaries.
 *
 * subtotal is the item value at selling price; the coupon comes off that, and
 * GST is the part of what was actually charged (after the coupon) that is tax —
 * shown as "included", not added on top. Slabs follow the sale value per piece.
 */
export function orderMoneySummary(order) {
  const items = order?.orderItems || order?.items || [];
  const lines = items.map((item) => {
    const unit = Number(item?.price ?? item?.unitPrice ?? 0);
    const qty = Number(item?.qty ?? item?.quantity ?? 0);
    return { qty, value: unit > 0 && qty > 0 ? unit * qty : 0 };
  });
  const discount = orderDiscountAmount(order);
  const shares = allocateDiscount(
    lines.map((l) => l.value),
    discount
  );

  let taxable = 0;
  let gst = 0;
  let itemsGross = 0;
  lines.forEach((line, i) => {
    if (line.value <= 0) return;
    itemsGross += line.value;
    const saleValue = line.value - shares[i];
    const split = splitInclusiveGst(saleValue, gstRateForLine(saleValue, line.qty));
    taxable += split.taxable;
    gst += split.gst;
  });

  taxable = roundMoney(taxable);
  gst = roundMoney(gst);
  itemsGross = roundMoney(itemsGross);

  const shipping = roundMoney(order?.shippingPrice ?? order?.deliveryAmount ?? 0);
  const gift = order?.isGift ? roundMoney(order?.giftFee || 39) : 0;
  const total = roundMoney(
    order?.totalPrice ?? order?.finalPrice ?? order?.total ?? 0
  );
  const tax = storedTax(order) || gst;

  return {
    subtotal: itemsGross,
    discount,
    couponCode: orderCouponCode(order),
    discountLabel: discountLabel(order),
    taxable,
    tax,
    shipping,
    gift,
    total,
    itemsGross,
  };
}
