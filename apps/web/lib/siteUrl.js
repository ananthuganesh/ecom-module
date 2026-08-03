/**
 * Public site origin for SEO, sitemap, and absolute OG URLs.
 */
export function getSiteUrl() {
  const raw = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_WEB_URL ||
    process.env.NEXT_PUBLIC_WEB_URL ||
    "https://urbanaana.com"
  ).trim();
  return raw.replace(/\/$/, "") || "https://urbanaana.com";
}

export function absoluteUrl(path = "/") {
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Server-side API base (Docker / local) without trailing slash. */
export function getInternalApiBase() {
  const fromEnv = (
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000"
  )
    .trim()
    .replace(/\/$/, "");
  if (fromEnv.endsWith("/api")) return fromEnv.slice(0, -4);
  return fromEnv || "http://127.0.0.1:8000";
}

export async function fetchProductForSeo(idOrSlug) {
  const key = String(idOrSlug || "").trim();
  if (!key) return null;
  const base = getInternalApiBase();
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(key);
  const urls = isObjectId
    ? [`${base}/api/products/${key}`, `${base}/api/products/slug/${encodeURIComponent(key)}`]
    : [`${base}/api/products/slug/${encodeURIComponent(key)}`];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 300 },
        headers: { Accept: "application/json" },
      });
      if (res.ok) return await res.json();
    } catch {
      /* try next */
    }
  }
  return null;
}

export function productCanonicalPath(product) {
  const slug = product?.slug || product?._id || product?.id;
  return slug ? `/product/${slug}` : "/all-products";
}

export function productOgImage(product) {
  const img =
    product?.thumbnails?.[0] ||
    product?.images?.[0] ||
    product?.variants?.[0]?.images?.[0] ||
    "";
  if (!img) return absoluteUrl("/urban/about-1.jpg");
  if (String(img).startsWith("http")) return String(img);
  return absoluteUrl(img.startsWith("/") ? img : `/${img}`);
}
