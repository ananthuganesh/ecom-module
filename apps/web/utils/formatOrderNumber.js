/**
 * Display order number as #UA1000 (human-facing).
 * Orders get their number on payment, so an unpaid checkout has none yet:
 * label it plainly instead of a # code that looks like a real order number.
 */
export function formatOrderNumber(order, fallbackLen = 6) {
  const raw = order?.orderNumber != null ? String(order.orderNumber).trim() : "";
  if (raw) {
    const cleaned = raw.replace(/^#+/, "");
    return cleaned ? `#${cleaned}` : null;
  }
  const id = order?._id != null ? String(order._id) : "";
  if (!id) return null;
  return `Unpaid · ${id.slice(-fallbackLen).toUpperCase()}`;
}

/**
 * Admin URL path key: 12-digit orderUrlId (not the display UA number).
 * Falls back to Mongo id when orderUrlId is missing.
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
