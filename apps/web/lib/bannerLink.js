/**
 * Where a homepage banner goes when tapped.
 *
 * The link is typed by an admin but rendered on the public storefront, so it
 * is treated as untrusted: only site paths and http(s) URLs survive. Anything
 * else — javascript:, data:, protocol-relative //host — is dropped rather than
 * rendered, since an executable href here would run for every shopper.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP = /^https?:\/\//i;

/** Hostnames that count as this store, so a pasted full URL stays in-app. */
function siteHosts(siteUrl) {
  try {
    const host = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
    return new Set([host, `www.${host}`]);
  } catch {
    return new Set();
  }
}

/**
 * Normalise an admin-entered banner link.
 *
 * Returns `{ href, external }`, or null when there is no usable link.
 *   "/shop"                        -> { href: "/shop", external: false }
 *   "shop"                         -> { href: "/shop", external: false }
 *   "https://urbanaana.com/shop"   -> { href: "/shop", external: false }
 *   "https://instagram.com/x"      -> { href: "https://instagram.com/x", external: true }
 *   "www.instagram.com/x"          -> { href: "https://www.instagram.com/x", external: true }
 *   "javascript:alert(1)"          -> null
 */
export function resolveBannerLink(raw, { siteUrl = "https://urbanaana.com" } = {}) {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  // Protocol-relative URLs inherit the page's scheme and can point anywhere.
  if (value.startsWith("//")) return null;

  if (HTTP.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (siteHosts(siteUrl).has(url.hostname.toLowerCase())) {
      const path = `${url.pathname || "/"}${url.search}${url.hash}`;
      return { href: path, external: false };
    }
    return { href: url.toString(), external: true };
  }

  if (value.startsWith("/")) return { href: value, external: false };

  // Any other scheme (javascript:, data:, mailto:, …) is refused.
  if (SCHEME.test(value)) return null;

  if (/^www\./i.test(value)) {
    return resolveBannerLink(`https://${value}`, { siteUrl });
  }

  // A bare path like "shop" or "category/tees".
  return { href: `/${value.replace(/^\/+/, "")}`, external: false };
}
