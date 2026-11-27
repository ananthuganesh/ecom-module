/** Cart / buy-now lines → the `orderItems` shape /api/payments/magic/start expects. */
export function toMagicOrderItems(items = []) {
  return items.map((item) => ({
    name: item.name || item.productName,
    qty: item.qty || 1,
    image: item.image || item.thumbnails?.[0] || item.variants?.[0]?.images?.[0],
    price: Number(item.price) || 0,
    product: item._id,
    size: item.size,
    color: item.color || "",
  }));
}

/** Browser-scoped guest id: lets a retry reuse the same pending order. */
export function ensureGuestId(storage = globalThis.localStorage) {
  if (!storage) return null;
  let id = storage.getItem("abandoned_guest_id");
  if (!id) {
    id = `guest_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    storage.setItem("abandoned_guest_id", id);
  }
  return id;
}
