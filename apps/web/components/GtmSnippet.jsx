/**
 * GTM helpers. Head script + noscript are injected by middleware
 * (not React) to avoid hydration / script-tag console errors.
 */

export const DEFAULT_GTM_ID = "GTM-WVQMZLZF";

function normalizeGtmId(gtmId) {
  const id = String(gtmId || DEFAULT_GTM_ID)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  return id.startsWith("GTM-") ? id : "";
}

/** @deprecated Middleware injects head snippet. */
export function GtmHead() {
  return null;
}

/** @deprecated Middleware injects noscript. */
export function GtmBody() {
  return null;
}

export default function GtmSnippet() {
  return null;
}

export { normalizeGtmId };
