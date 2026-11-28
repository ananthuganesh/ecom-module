/**
 * "Similar products" for a product page: same product group, then category,
 * then newest — de-duplicated, never the product itself. Shared by the server
 * render (so the links are in the HTML) and the client fallback.
 */
export function mergeRelated(currentId, lists, limit = 12) {
  const out = [];
  const seen = new Set([String(currentId || "")]);
  for (const list of lists) {
    for (const item of list || []) {
      const id = String(item?._id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** The queries to try, in order, for this product. */
export function relatedQueries(product) {
  const category =
    typeof product?.category === "object" ? product.category?.name || product.category?.slug : product?.category;
  const queries = [];
  if (product?.product) queries.push({ product: product.product, pageSize: 12 });
  if (category) queries.push({ category, pageSize: 12 });
  queries.push({ pageSize: 12 });
  return queries;
}
