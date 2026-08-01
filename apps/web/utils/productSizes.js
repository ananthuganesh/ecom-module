/**
 * Size-led catalog: each product variant is a size row (color optional/empty).
 * Falls back to legacy nested `variant.sizes` / `product.sizes` when present.
 */
export function getProductSizeOptions(product, selectedVariant = null) {
  const variants = (product?.variants || []).filter((v) => v && !v.isDeleted);

  const flat = variants
    .filter((v) => String(v.size || "").trim())
    .map((v) => ({
      size: String(v.size).trim(),
      stock: Number(v.quantity ?? v.stock ?? 0),
      quantity: Number(v.quantity ?? v.stock ?? 0),
      sku: v.sku || "",
      color: String(v.color || "").trim(),
      images: Array.isArray(v.images) ? v.images : [],
    }));

  if (flat.length) return flat;

  const nested =
    selectedVariant?.sizes?.length
      ? selectedVariant.sizes
      : product?.sizes?.length
        ? product.sizes
        : [];

  return nested
    .map((s) => (typeof s === "string" ? { size: s } : s))
    .filter((s) => s?.size)
    .map((s) => ({
      size: String(s.size).trim(),
      stock: Number(s.quantity ?? s.stock ?? 0),
      quantity: Number(s.quantity ?? s.stock ?? 0),
      sku: s.sku || "",
      color: String(selectedVariant?.color || "").trim(),
      images: [],
    }));
}
