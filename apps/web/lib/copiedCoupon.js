import { COPIED_COUPON_KEY } from "./storageKeys.js";

/** A code copied from a product page is pre-applied at checkout for this long. */
export const COPIED_COUPON_TTL_MS = 24 * 60 * 60 * 1000;

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function rememberCopiedCoupon(code, { storage = browserStorage(), now = Date.now() } = {}) {
  const clean = String(code || "").trim().toUpperCase();
  if (!storage || !clean) return;
  try {
    storage.setItem(COPIED_COUPON_KEY, JSON.stringify({ code: clean, at: now }));
  } catch {
    // Storage full or blocked: the shopper can still paste the code.
  }
}

/** The copied code, or null when there is none or it is older than the TTL. */
export function readCopiedCoupon({ storage = browserStorage(), now = Date.now() } = {}) {
  if (!storage) return null;
  try {
    const saved = JSON.parse(storage.getItem(COPIED_COUPON_KEY) || "null");
    if (!saved?.code || !(now - Number(saved.at) < COPIED_COUPON_TTL_MS)) return null;
    return String(saved.code);
  } catch {
    return null;
  }
}

export function clearCopiedCoupon({ storage = browserStorage() } = {}) {
  try {
    storage?.removeItem(COPIED_COUPON_KEY);
  } catch {
    // Nothing to do.
  }
}
