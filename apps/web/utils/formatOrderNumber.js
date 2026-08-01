/** Display order number as #UA1000 (human-facing). */
export function formatOrderNumber(order, fallbackLen = 6) {
  const raw = order?.orderNumber != null ? String(order.orderNumber).trim() : "";
  if (raw) {
    const cleaned = raw.replace(/^#+/, "");
    return cleaned ? `#${cleaned}` : null;
  }
  const id = order?._id != null ? String(order._id) : "";
  if (!id) return null;
  return `#${id.slice(-fallbackLen).toUpperCase()}`;
}

/**
 * Admin URL path key: 12-digit orderUrlId (not the display UA number).
 * Falls back to Mongo id for drafts without a url id yet.
 */
export function orderUrlKey(order) {
  const urlId = order?.orderUrlId != null ? String(order.orderUrlId).trim() : "";
  if (urlId) return urlId;
  return order?._id != null ? String(order._id) : "";
}

export function adminOrderHref(order) {
  const key = orderUrlKey(order);
  return key ? `/admin/orders/${encodeURIComponent(key)}` : "/admin/orders";
}
