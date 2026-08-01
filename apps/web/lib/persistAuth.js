/** Sync auth into zustand persist storage so axios picks up the token immediately. */
import { AUTH_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";

export function persistAuth(userInfo) {
  const key = ensureStorageKey(AUTH_STORAGE_KEY);
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : { state: {} };
    parsed.state = { ...(parsed.state || {}), userInfo };
    localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}
