/**
 * Minimal HTML sanitizer for storefront product descriptions.
 * Strips scripts, iframes, event handlers, and javascript: URLs.
 */
export function sanitizeProductHtml(html) {
  const raw = String(html || "");
  if (!raw) return "";
  if (typeof window === "undefined") {
    return raw
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript:/gi, "");
  }
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstChild;
  if (!root) return "";

  root.querySelectorAll("script, iframe, object, embed, link, meta").forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "");
      if (name.startsWith("on") || value.trim().toLowerCase().startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return root.innerHTML;
}
