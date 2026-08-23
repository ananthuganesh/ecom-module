import { gstRateForUnitPrice, roundMoney, splitInclusiveGst } from "@/utils/gstRate";

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

/** Tax-inclusive retail totals for storefront order summaries. */
export function orderMoneySummary(order) {
  const items = order?.orderItems || order?.items || [];
  let taxable = 0;
  let gst = 0;
  let itemsGross = 0;

  for (const item of items) {
    const unit = Number(item?.price ?? item?.unitPrice ?? 0);
    const qty = Number(item?.qty ?? item?.quantity ?? 0);
    if (unit <= 0 || qty <= 0) continue;
    const gross = unit * qty;
    itemsGross += gross;
    const split = splitInclusiveGst(gross, gstRateForUnitPrice(unit));
    taxable += split.taxable;
    gst += split.gst;
  }

  taxable = roundMoney(taxable);
  gst = roundMoney(gst);
  itemsGross = roundMoney(itemsGross);

  const shipping = roundMoney(order?.shippingPrice ?? order?.deliveryAmount ?? 0);
  const discount = roundMoney(order?.discountAmount ?? order?.discount ?? 0);
  const gift = order?.isGift ? roundMoney(order?.giftFee || 39) : 0;
  const total = roundMoney(
    order?.totalPrice ?? order?.finalPrice ?? order?.total ?? 0
  );
  const tax = storedTax(order) || gst;
  const subtotal = tax > 0 ? taxable : itemsGross;

  return { subtotal, shipping, tax, gift, discount, total, itemsGross };
}
