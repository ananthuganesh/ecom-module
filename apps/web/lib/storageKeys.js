/** Browser storage keys for Urban Aana. Migrates one-time from legacy brand keys. */

export const AUTH_STORAGE_KEY = "urban-aana-auth";
export const ADMIN_AUTH_STORAGE_KEY = "urban-aana-admin-auth";
export const CART_STORAGE_KEY = "urban-aana-cart";
export const WISHLIST_STORAGE_KEY = "urban-aana-wishlist";
export const BUY_NOW_STORAGE_KEY = "urban-aana-buy-now";
export const RECENTLY_VIEWED_STORAGE_KEY = "urban-aana-recently-viewed";
export const ATTRIBUTION_KEY = "urban-aana-attribution";
export const PURCHASE_EVENT_KEY = "urban-aana-purchase-event";
export const PURCHASE_FIRED_KEY = "urban-aana-purchase-fired";

const LEGACY_LOCAL = {
  [AUTH_STORAGE_KEY]: "siyara-auth",
  [CART_STORAGE_KEY]: "siyara-cart",
  [RECENTLY_VIEWED_STORAGE_KEY]: "siyara-recently-viewed",
  [ATTRIBUTION_KEY]: "siyara_attribution",
};

/** Migrate legacy localStorage key → new key (once). */
export function migrateStorageKey(newKey) {
  if (typeof window === "undefined") return newKey;
  const oldKey = LEGACY_LOCAL[newKey];
  if (!oldKey) return newKey;
  try {
    if (!localStorage.getItem(newKey)) {
      const legacy = localStorage.getItem(oldKey);
      if (legacy != null) {
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(oldKey);
      }
    } else {
      localStorage.removeItem(oldKey);
    }
  } catch {
    /* ignore */
  }
  return newKey;
}

export function ensureStorageKey(newKey) {
  return migrateStorageKey(newKey);
}
