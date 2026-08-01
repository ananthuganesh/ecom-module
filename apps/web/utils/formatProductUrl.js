/** Admin URL path key: 12-digit productUrlId (falls back to Mongo id). */
export function productUrlKey(product) {
  const urlId = product?.productUrlId != null ? String(product.productUrlId).trim() : "";
  if (urlId) return urlId;
  return product?._id != null ? String(product._id) : "";
}

export function adminProductHref(product) {
  const key = productUrlKey(product);
  return key ? `/admin/products/${encodeURIComponent(key)}` : "/admin/products";
}
