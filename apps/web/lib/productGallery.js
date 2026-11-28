/**
 * Product photo order, shared by the product page gallery (client) and the
 * server's LCP preload so both agree on which photo is shown first.
 */

/** All product photos, de-duplicated; the first of `leadPhotos` moves to the front. */
export function orderProductImages(product, leadPhotos = []) {
  if (!product) return [];
  const ordered = [];
  const pushUnique = (url) => {
    const src = String(url || "").trim();
    if (!src || ordered.includes(src)) return;
    ordered.push(src);
  };
  for (const url of product.thumbnails || []) pushUnique(url);
  for (const url of product.images || []) pushUnique(url);
  for (const variant of product.variants || []) {
    if (variant?.isDeleted) continue;
    for (const url of variant.images || []) pushUnique(url);
  }
  const lead = (leadPhotos || []).map((u) => String(u || "").trim()).filter(Boolean)[0];
  if (!lead || !ordered.includes(lead)) return ordered;
  return [lead, ...ordered.filter((url) => url !== lead)];
}

/** What the gallery shows on first render, before a size is picked. */
export function initialGalleryImages(product) {
  return orderProductImages(product, product?.variants?.[0]?.images);
}

const OPTIMIZED_HOSTS = new Set(["images.urbanaana.com", "images.unsplash.com"]);

/** Mirrors SafeImage: which URLs go through the Next image optimizer. */
export function isOptimizedImageUrl(url) {
  const src = String(url || "");
  if (!/^https?:\/\//.test(src)) return src.startsWith("/");
  try {
    const host = new URL(src).hostname;
    return (
      OPTIMIZED_HOSTS.has(host) ||
      host.endsWith(".r2.dev") ||
      host.endsWith(".cloudflarestorage.com") ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

// File-name hints → how the photo is described ("Indian-Elephant-Back-…webp").
const VIEW_HINTS = [
  [/close[-_ ]?up|detail|zoom/i, "close-up"],
  [/embroider/i, "embroidery detail"],
  [/neck|label|tag/i, "neck label"],
  [/sleeve/i, "sleeve detail"],
  [/back|rear/i, "back view"],
  [/side/i, "side view"],
  [/front/i, "front view"],
  [/flat[-_ ]?lay|flatlay/i, "flat lay"],
  [/model|lifestyle|look/i, "on model"],
];

/**
 * Alt text for a product photo: name, type, and the view taken from the file
 * name when it says one ("front", "back", "closeup"), else the photo number.
 */
export function productImageAlt({ title, productType, url, index }) {
  const name = [title, productType].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
  const file = decodeURIComponent(String(url || "").split("?")[0].split("/").pop() || "");
  const view = VIEW_HINTS.find(([re]) => re.test(file))?.[1];
  return `${name || "Product"} – ${view || `photo ${index + 1}`}`;
}
