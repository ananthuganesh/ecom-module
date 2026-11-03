const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const plain = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Card text for a product-page offer from GET /coupons/product/:id.
 * `title` is where it applies, `subtitle` the reward. The minimum order and
 * discount cap are deliberately not shown in the store.
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
    };
  }

  const percent = (offer.discountType || "percentage") === "percentage";
  return {
    title: kind === "products" ? "On this product" : "On your order",
    subtitle: `Get ${percent ? `${plain(offer.discountValue)}%` : rupees(offer.discountValue)} off`,
  };
}
