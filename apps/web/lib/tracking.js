/**
 * GA4-style ecommerce DataLayer helper for GTM.
 * Meta Pixel / GA tags are configured in GTM — not hardcoded here.
 */

export const TRACKING_CURRENCY = "INR";

function ensureDataLayer() {
  if (typeof window === "undefined") return null;
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

export function toTrackingItem(raw, qty = 1) {
  if (!raw) return null;
  const price = Number(
    raw.price ?? raw.pricing?.sellingPrice ?? 0
  );
  const quantity = Math.max(1, Number(raw.quantity ?? raw.qty ?? qty) || 1);
  return {
    item_id: String(raw.item_id || raw.productId || raw._id || raw.id || ""),
    item_name: String(raw.item_name || raw.productName || raw.name || "Product"),
    price,
    quantity,
    item_category: raw.item_category || raw.category || undefined,
    item_brand: raw.item_brand || raw.brand || "Urban Aana",
  };
}

export function itemsValue(items = []) {
  return items.reduce(
    (sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 1),
    0
  );
}

/**
 * @param {string} event - view_item | add_to_cart | begin_checkout | purchase
 * @param {{ currency?: string, value?: number, transaction_id?: string, items?: object[] }} ecommerce
 */
export function pushEcommerceEvent(event, ecommerce = {}) {
  const dl = ensureDataLayer();
  if (!dl || !event) return;

  const items = (ecommerce.items || []).map((i) => toTrackingItem(i)).filter(Boolean);
  const value =
    ecommerce.value != null
      ? Number(ecommerce.value)
      : Number(itemsValue(items).toFixed(2));

  const payload = {
    currency: ecommerce.currency || TRACKING_CURRENCY,
    value: Number(value.toFixed(2)),
    items,
  };
  if (ecommerce.transaction_id) {
    payload.transaction_id = String(ecommerce.transaction_id);
  }

  // Clear previous ecommerce object (GA4 / GTM best practice)
  dl.push({ ecommerce: null });
  dl.push({
    event,
    ecommerce: payload,
  });
}

export function trackViewItem(product) {
  const item = toTrackingItem(product, 1);
  if (!item?.item_id) return;
  pushEcommerceEvent("view_item", {
    value: item.price,
    items: [item],
  });
}

export function trackAddToCart(product, qty = 1) {
  const item = toTrackingItem(product, qty);
  if (!item?.item_id) return;
  pushEcommerceEvent("add_to_cart", {
    value: item.price * item.quantity,
    items: [item],
  });
}

export function trackBeginCheckout(cartItems = []) {
  const items = cartItems.map((i) => toTrackingItem(i)).filter(Boolean);
  if (!items.length) return;
  pushEcommerceEvent("begin_checkout", {
    value: itemsValue(items),
    items,
  });
}

export function trackPurchase({ transactionId, value, items = [] }) {
  const mapped = items.map((i) => toTrackingItem(i)).filter(Boolean);
  if (!transactionId) return;
  pushEcommerceEvent("purchase", {
    transaction_id: transactionId,
    value: value != null ? value : itemsValue(mapped),
    items: mapped,
  });
}

import {
  PURCHASE_EVENT_KEY,
  PURCHASE_FIRED_KEY,
} from "@/lib/storageKeys";

export function stashPurchaseEvent(payload) {
  if (typeof window === "undefined" || !payload?.transactionId) return;
  try {
    sessionStorage.setItem(PURCHASE_EVENT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Fire purchase once from success page (deduped). Returns true if fired from stash. */
export function flushStashedPurchase() {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(PURCHASE_EVENT_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(PURCHASE_EVENT_KEY);
    const data = JSON.parse(raw);
    const firedId = sessionStorage.getItem(PURCHASE_FIRED_KEY);
    if (firedId && firedId === String(data.transactionId)) return true;
    trackPurchase(data);
    sessionStorage.setItem(PURCHASE_FIRED_KEY, String(data.transactionId));
    return true;
  } catch {
    return false;
  }
}

export function trackPurchaseOnce(payload) {
  if (typeof window === "undefined" || !payload?.transactionId) return;
  try {
    const firedId = sessionStorage.getItem(PURCHASE_FIRED_KEY);
    if (firedId && firedId === String(payload.transactionId)) return;
    trackPurchase(payload);
    sessionStorage.setItem(PURCHASE_FIRED_KEY, String(payload.transactionId));
  } catch {
    trackPurchase(payload);
  }
}
