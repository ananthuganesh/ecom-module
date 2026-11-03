const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const plain = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Card text for a product-page offer from GET /coupons/product/:id.
 * `title` is the condition, `subtitle` the reward, `note` an optional cap.
 */
export function offerLines(offer) {
  if (!offer) return null;
  const kind = offer.kind || "order";

  if (kind === "bxgy") {
    const pct = Number(offer.getDiscountPercent ?? 100);
    const get = Number(offer.getQuantity || 1);
    return {
      title: `Buy ${Number(offer.buyQuantity || 1)}`,
      subtitle: pct >= 100 ? `Get ${get} free` : `Get ${get} at ${plain(pct)}% off`,
      note: null,
    };
  }

  const percent = (offer.discountType || "percentage") === "percentage";
  const min = Number(offer.minOrderAmount || 0);
  const cap = Number(offer.maxDiscount || 0);
  return {
    title:
      min > 0
        ? `Orders above ${rupees(min)}`
        : kind === "products"
          ? "On this product"
          : "On your order",
    subtitle: `Get ${percent ? `${plain(offer.discountValue)}%` : rupees(offer.discountValue)} off`,
    note: percent && cap > 0 ? `Up to ${rupees(cap)}` : null,
  };
}
