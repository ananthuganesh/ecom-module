const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const plain = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Card text for a product-page offer from GET /coupons/product/:id.
 * `title` is where it applies, `subtitle` the reward, `footer` how to get it
 * (copy a code, or nothing to do for an automatic discount). The minimum order
 * and discount cap are deliberately not shown in the store.
 */
export function offerLines(offer) {
  if (!offer) return null;
  const kind = offer.kind || "order";
  const footer = offer.automatic ? "Applied at checkout" : offer.code ? `Code: ${offer.code}` : "";

  if (kind === "shipping") {
    return {
      title: offer.automatic && offer.title ? offer.title : "On your order",
      subtitle: "Free shipping",
      footer,
    };
  }

  if (kind === "bxgy") {
    const get = Number(offer.getQuantity || 1);
    const valueType =
      offer.getValueType && offer.getValueType !== "percentage"
        ? offer.getValueType
        : Number(offer.getDiscountPercent ?? 100) >= 100
          ? "free"
          : "percentage";
    const reward =
      valueType === "free"
        ? `Get ${get} free`
        : valueType === "amount"
          ? `Get ${get} at ${rupees(offer.getAmountOff)} off`
          : `Get ${get} at ${plain(offer.getDiscountPercent)}% off`;
    const buy =
      offer.buyRequirement === "amount"
        ? `Spend ${rupees(offer.buyAmount)}`
        : `Buy ${Number(offer.buyQuantity || 1)}`;
    return { title: buy, subtitle: reward, footer };
  }

  const percent = (offer.discountType || "percentage") === "percentage";
  const each = !percent && kind === "products" && offer.oncePerOrder === false ? " each" : "";
  return {
    title: kind === "products" ? "On this product" : "On your order",
    // A percentage can be capped (and the minimum isn't shown), so say "Upto".
    subtitle: percent
      ? `Get Upto ${plain(offer.discountValue)}% off`
      : `Get ${rupees(offer.discountValue)} off${each}`,
    footer,
  };
}
