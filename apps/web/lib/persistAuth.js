/** Persist auth profile without storing the JWT (HttpOnly cookie holds the session). */
import { AUTH_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";

export function stripAuthToken(userInfo) {
  if (!userInfo || typeof userInfo !== "object") return userInfo;
  const { token: _ignored, ...rest } = userInfo;
  return { ...rest, authenticated: true };
}

export function persistAuth(userInfo) {
  const key = ensureStorageKey(AUTH_STORAGE_KEY);
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : { state: {} };
    parsed.state = { ...(parsed.state || {}), userInfo: stripAuthToken(userInfo) };
    localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}
