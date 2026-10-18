/** Same rule as the API's slugify, so the URL preview matches what gets saved. */
export function collectionSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function productDisplayName(product) {
  return String(product?.productName || product?.name || product?.product || "").trim();
}

/**
 * Products an admin can still add to a collection: not already in it, and
 * matching every word of the search across name, type and SKU-ish fields.
 */
export function pickableProducts(products = [], { query = "", excludeIds = [], limit = 50 } = {}) {
  const exclude = new Set(excludeIds.map(String));
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const product of products) {
    if (!product?._id || exclude.has(String(product._id))) continue;
    const haystack = [productDisplayName(product), product.type, product.category, product.slug]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (words.every((w) => haystack.includes(w))) out.push(product);
    if (out.length >= limit) break;
  }
  return out;
}
