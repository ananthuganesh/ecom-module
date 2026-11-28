/** Persist auth profile without storing the JWT (HttpOnly cookie holds the session). */
import {
  ADMIN_AUTH_STORAGE_KEY,
  AUTH_STORAGE_KEY,
  ensureStorageKey,
} from "./storageKeys.js";

export function stripAuthToken(userInfo) {
  if (!userInfo || typeof userInfo !== "object") return userInfo;
  const { token: _ignored, ...rest } = userInfo;
  return { ...rest, authenticated: true };
}

/**
 * The slice of a customer profile that may sit in localStorage. Email, phone and
 * addresses stay in memory only and are reloaded from the API on each visit, so
 * a shared computer or a malicious extension cannot read them from disk.
 */
const PERSISTED_CUSTOMER_FIELDS = ["_id", "name", "firstName", "lastName", "customerUrlId"];

export function persistableCustomer(userInfo) {
  if (!userInfo || typeof userInfo !== "object") return null;
  const out = { authenticated: true };
  for (const key of PERSISTED_CUSTOMER_FIELDS) {
    if (userInfo[key] != null) out[key] = userInfo[key];
  }
  return out;
}

function writePersisted(storageKey, userInfo, shape = stripAuthToken) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : { state: {} };
    parsed.state = { ...(parsed.state || {}), userInfo: shape(userInfo) };
    localStorage.setItem(storageKey, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export function persistAuth(userInfo) {
  writePersisted(ensureStorageKey(AUTH_STORAGE_KEY), userInfo, persistableCustomer);
}

export function persistAdminAuth(userInfo) {
  writePersisted(ADMIN_AUTH_STORAGE_KEY, userInfo);
}
