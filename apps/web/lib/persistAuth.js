/** Persist auth profile without storing the JWT (HttpOnly cookie holds the session). */
import {
  ADMIN_AUTH_STORAGE_KEY,
  AUTH_STORAGE_KEY,
  ensureStorageKey,
} from "@/lib/storageKeys";

export function stripAuthToken(userInfo) {
  if (!userInfo || typeof userInfo !== "object") return userInfo;
  const { token: _ignored, ...rest } = userInfo;
  return { ...rest, authenticated: true };
}

function writePersisted(storageKey, userInfo) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : { state: {} };
    parsed.state = { ...(parsed.state || {}), userInfo: stripAuthToken(userInfo) };
    localStorage.setItem(storageKey, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export function persistAuth(userInfo) {
  writePersisted(ensureStorageKey(AUTH_STORAGE_KEY), userInfo);
}

export function persistAdminAuth(userInfo) {
  writePersisted(ADMIN_AUTH_STORAGE_KEY, userInfo);
}
