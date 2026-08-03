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
  const price = Number(raw.price ?? raw.pricing?.sellingPrice ?? 0);
  const quantity = Math.max(1, Number(raw.quantity ?? raw.qty ?? qty) || 1);
  const item = {
    item_id: String(raw.item_id || raw.productId || raw._id || raw.id || ""),
    item_name: String(raw.item_name || raw.productName || raw.name || "Product"),
    price,
    quantity,
    item_category: raw.item_category || raw.category?.name || raw.category || undefined,
    item_brand: raw.item_brand || raw.brand || "Urban Aana",
    item_variant: raw.item_variant || [raw.size, raw.color].filter(Boolean).join(" / ") || undefined,
  };
  if (raw.index != null && Number.isFinite(Number(raw.index))) {
    item.index = Number(raw.index);
  }
  return item;
}

export function itemsValue(items = []) {
  return items.reduce(
    (sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 1),
    0
  );
}

/**
 * @param {string} event
 * @param {{ currency?: string, value?: number, transaction_id?: string, coupon?: string, items?: object[], item_list_name?: string, item_list_id?: string }} ecommerce
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
  if (ecommerce.coupon) {
    payload.coupon = String(ecommerce.coupon);
  }
  if (ecommerce.item_list_name) {
    payload.item_list_name = String(ecommerce.item_list_name);
  }
  if (ecommerce.item_list_id) {
    payload.item_list_id = String(ecommerce.item_list_id);
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

export function trackViewItemList(products = [], listName = "Catalog", listId = "catalog") {
  const items = products
    .slice(0, 40)
    .map((p, index) => {
      const item = toTrackingItem(p, 1);
      if (!item) return null;
      return { ...item, index };
    })
    .filter(Boolean);
  if (!items.length) return;
  pushEcommerceEvent("view_item_list", {
    value: itemsValue(items),
    items,
    item_list_name: listName,
    item_list_id: listId,
  });
}

export function trackSelectItem(product, listName = "Catalog", listId = "catalog") {
  const item = toTrackingItem(product, 1);
  if (!item?.item_id) return;
  pushEcommerceEvent("select_item", {
    value: item.price,
    items: [item],
    item_list_name: listName,
    item_list_id: listId,
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

export function trackRemoveFromCart(product, qty = 1) {
  const item = toTrackingItem(product, qty);
  if (!item?.item_id) return;
  pushEcommerceEvent("remove_from_cart", {
    value: item.price * item.quantity,
    items: [item],
  });
}

export function trackViewCart(cartItems = []) {
  const items = cartItems.map((i) => toTrackingItem(i)).filter(Boolean);
  if (!items.length) return;
  pushEcommerceEvent("view_cart", {
    value: itemsValue(items),
    items,
  });
}

export function trackBeginCheckout(cartItems = [], coupon = "") {
  const items = cartItems.map((i) => toTrackingItem(i)).filter(Boolean);
  if (!items.length) return;
  pushEcommerceEvent("begin_checkout", {
    value: itemsValue(items),
    items,
    coupon: coupon || undefined,
  });
}

/** Site search — Meta Search / GA4 search. */
export function trackSearch(searchTerm, products = []) {
  const dl = ensureDataLayer();
  const term = String(searchTerm || "").trim();
  if (!dl || !term) return;
  const items = products.map((p) => toTrackingItem(p, 1)).filter(Boolean);
  dl.push({ ecommerce: null });
  dl.push({
    event: "search",
    search_term: term,
    search_string: term,
    ecommerce: {
      currency: TRACKING_CURRENCY,
      value: Number(itemsValue(items).toFixed(2)),
      items,
    },
  });
}

/** Wishlist — call when a wishlist UI exists and user saves an item. */
export function trackAddToWishlist(product) {
  const item = toTrackingItem(product, 1);
  if (!item?.item_id) return;
  pushEcommerceEvent("add_to_wishlist", {
    value: item.price,
    items: [item],
  });
}

export function trackAddShippingInfo(cartItems = [], shippingTier = "standard") {
  const items = cartItems.map((i) => toTrackingItem(i)).filter(Boolean);
  if (!items.length) return;
  const dl = ensureDataLayer();
  if (!dl) return;
  dl.push({ ecommerce: null });
  dl.push({
    event: "add_shipping_info",
    ecommerce: {
      currency: TRACKING_CURRENCY,
      value: Number(itemsValue(items).toFixed(2)),
      shipping_tier: shippingTier,
      items,
    },
  });
}

export function trackAddPaymentInfo(cartItems = [], paymentType = "razorpay") {
  const items = cartItems.map((i) => toTrackingItem(i)).filter(Boolean);
  if (!items.length) return;
  const dl = ensureDataLayer();
  if (!dl) return;
  dl.push({ ecommerce: null });
  dl.push({
    event: "add_payment_info",
    ecommerce: {
      currency: TRACKING_CURRENCY,
      value: Number(itemsValue(items).toFixed(2)),
      payment_type: paymentType,
      items,
    },
  });
}

export function trackSelectPromotion({
  promotionId,
  promotionName,
  creativeName,
  discount = 0,
} = {}) {
  const dl = ensureDataLayer();
  if (!dl || !promotionId) return;
  dl.push({ ecommerce: null });
  dl.push({
    event: "select_promotion",
    ecommerce: {
      currency: TRACKING_CURRENCY,
      value: Number(Number(discount || 0).toFixed(2)),
      items: [],
      creative_name: creativeName || promotionName || String(promotionId),
      promotion_id: String(promotionId),
      promotion_name: String(promotionName || promotionId),
    },
  });
}

export function trackPurchase({ transactionId, value, items = [], coupon = "" }) {
  const mapped = items.map((i) => toTrackingItem(i)).filter(Boolean);
  if (!transactionId) return;
  pushEcommerceEvent("purchase", {
    transaction_id: transactionId,
    value: value != null ? value : itemsValue(mapped),
    items: mapped,
    coupon: coupon || undefined,
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
