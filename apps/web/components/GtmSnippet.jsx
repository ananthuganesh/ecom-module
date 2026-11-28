/**
 * GTM helpers kept for compatibility. Injection is handled by GtmClient.
 * No hardcoded container IDs — use NEXT_PUBLIC_GTM_ID / GTM_ID.
 */

export function normalizeGtmId(gtmId) {
  const id = String(gtmId || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  return id.startsWith("GTM-") ? id : "";
}

/** @deprecated Use GtmClient */
export function GtmHead() {
  return null;
}

/** @deprecated Use GtmClient */
export function GtmBody() {
  return null;
}

export default function GtmSnippet() {
  return null;
}
