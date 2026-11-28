import { ATTRIBUTION_KEY as STORAGE_ATTRIBUTION_KEY, ensureStorageKey } from "./storageKeys.js";

export const ATTRIBUTION_KEY = STORAGE_ATTRIBUTION_KEY;
export const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PARAM_MAP = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_content: "content",
  utm_term: "term",
  gclid: "gclid",
  fbclid: "fbclid",
};
const ATTRIBUTION_QUERY_PARAMS = new Set(Object.keys(PARAM_MAP));

function truncate(s, n = 200) {
  return String(s).slice(0, n);
}

/** Pure: parse touch from location-like object. */
export function parseTouchFromLocation({ search = "", pathname = "/", nowIso, referrer } = {}) {
  const q = new URLSearchParams(
    typeof search === "string" && search.startsWith("?") ? search.slice(1) : search || ""
  );
  const touch = {};
  const landingQuery = new URLSearchParams();
  for (const [param, key] of Object.entries(PARAM_MAP)) {
    const v = q.get(param);
    if (v && String(v).trim()) {
      const cleaned = truncate(String(v).trim());
      touch[key] = cleaned;
    }
  }
  for (const [param, value] of q.entries()) {
    if (!ATTRIBUTION_QUERY_PARAMS.has(param)) continue;
    if (!String(value).trim()) continue;
    landingQuery.append(param, truncate(String(value).trim()));
  }
  if (!Object.keys(touch).length) return null;
  const qs = landingQuery.toString();
  touch.landingPath = truncate(qs ? `${pathname}?${qs}` : pathname || "/");
  touch.landedAt = nowIso || new Date().toISOString();
  const ref = truncate(String(referrer || "").trim());
  if (ref) touch.referrer = ref;
  return touch;
}

/** Pure: merge incoming touch into stored state. */
export function applyTouchToState(prev, touch, nowMs = Date.now()) {
  if (!touch) return prev || { firstTouch: null, lastTouch: null };
  const prevFirst = prev?.firstTouch || null;
  let firstTouch = prevFirst;
  const firstAge =
    prevFirst?.landedAt != null ? nowMs - Date.parse(prevFirst.landedAt) : Infinity;
  if (!prevFirst || Number.isNaN(firstAge) || firstAge > FIRST_TOUCH_TTL_MS) {
    firstTouch = touch;
  }
  return { firstTouch, lastTouch: touch };
}

export function readStoredAttribution() {
  if (typeof window === "undefined") return { firstTouch: null, lastTouch: null };
  try {
    const raw = localStorage.getItem(ensureStorageKey(ATTRIBUTION_KEY));
    if (!raw) return { firstTouch: null, lastTouch: null };
    const parsed = JSON.parse(raw);
    return {
      firstTouch: parsed?.firstTouch || null,
      lastTouch: parsed?.lastTouch || null,
    };
  } catch {
    return { firstTouch: null, lastTouch: null };
  }
}

function writeStoredAttribution(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ensureStorageKey(ATTRIBUTION_KEY), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function captureAttributionFromLocation(loc) {
  if (typeof window === "undefined") return;
  const touch = parseTouchFromLocation({
    search: loc?.search ?? window.location.search,
    pathname: loc?.pathname ?? window.location.pathname,
    referrer: typeof document !== "undefined" ? document.referrer : "",
  });
  if (!touch) return;
  const prev = readStoredAttribution();
  const next = applyTouchToState(prev, touch, Date.now());
  writeStoredAttribution(next);
}

/** Snapshot for order create body. */
export function getAttributionSnapshot() {
  const { firstTouch, lastTouch } = readStoredAttribution();
  if (!firstTouch && !lastTouch) return null;
  return { firstTouch, lastTouch };
}
