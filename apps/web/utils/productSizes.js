/**
 * Size-led catalog: each product variant is a size row (color optional/empty).
 * Falls back to legacy nested `variant.sizes` / `product.sizes` when present.
 * Standard size gaps (e.g. missing XL between L and XXL) stay visible as stock 0.
 */
const STANDARD_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"];

function fillStandardSizeGaps(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) return sizes;
  const byKey = new Map();
  for (const row of sizes) {
    const key = String(row?.size || "")
      .trim()
      .toUpperCase();
    if (!key) continue;
    byKey.set(key, { ...row, size: String(row.size).trim() });
  }
  const indices = [...byKey.keys()]
    .map((key) => STANDARD_SIZES.indexOf(key))
    .filter((i) => i >= 0);
  if (indices.length < 1) return sizes;

  const min = Math.min(...indices);
  const max = Math.max(...indices);
  return STANDARD_SIZES.slice(min, max + 1).map((size) => {
    const existing = byKey.get(size);
    if (existing) return existing;
    return {
      size,
      stock: 0,
      quantity: 0,
      sku: "",
      color: "",
      images: [],
    };
  });
}

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

  if (flat.length) return fillStandardSizeGaps(flat);

  const nested =
    selectedVariant?.sizes?.length
      ? selectedVariant.sizes
      : product?.sizes?.length
        ? product.sizes
        : [];

  const mapped = nested
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

  return fillStandardSizeGaps(mapped);
}
