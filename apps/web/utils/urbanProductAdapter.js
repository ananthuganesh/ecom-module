const CARD_BADGE_LABELS = {
  sold_out: "Sold Out",
  low_stock: "Low Stock",
  new_arrival: "New Arrival",
  trending: "Trending",
  best_seller: "Best Seller",
};

const MANUAL_BADGES = new Set(["new_arrival", "trending", "best_seller"]);
const NEW_ARRIVAL_DAYS = 30;
const DEFAULT_LOW_STOCK = 10;

function firstVariantImages(product) {
  for (const variant of product?.variants || []) {
    if (variant?.isDeleted) continue;
    const imgs = (Array.isArray(variant?.images) ? variant.images : [])
      .filter(Boolean)
      .map(String);
    if (imgs.length) return imgs;
  }
  return [];
}

function collectCardImages(product) {
  const ordered = [
    ...firstVariantImages(product),
    ...(Array.isArray(product?.images) ? product.images : []),
    ...(Array.isArray(product?.thumbnails) ? product.thumbnails : []),
  ]
    .filter(Boolean)
    .map(String);

  const unique = [];
  for (const url of ordered) {
    if (!unique.includes(url)) unique.push(url);
  }
  return unique;
}

function normalizeBadgeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function productTotalStock(product) {
  if (product?.totalStock != null && Number.isFinite(Number(product.totalStock))) {
    return Math.max(0, Number(product.totalStock));
  }
  return (product?.variants || []).reduce((sum, variant) => {
    if (variant?.isDeleted) return sum;
    return sum + Math.max(0, Number(variant?.quantity ?? variant?.stock) || 0);
  }, 0);
}

export function resolveCardBadge(product) {
  const stock = productTotalStock(product);
  if (stock <= 0) {
    return { key: "sold_out", label: CARD_BADGE_LABELS.sold_out };
  }

  const threshold = Number(product?.lowStockThreshold);
  const lowAt = Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_LOW_STOCK;
  if (stock <= lowAt) {
    return { key: "low_stock", label: CARD_BADGE_LABELS.low_stock };
  }

  const manual = normalizeBadgeKey(product?.badge);
  if (MANUAL_BADGES.has(manual)) {
    return { key: manual, label: CARD_BADGE_LABELS[manual] };
  }

  const createdRaw = product?.createdAt || product?.created_at;
  if (createdRaw) {
    const created = new Date(createdRaw);
    if (!Number.isNaN(created.getTime())) {
      const ageDays = (Date.now() - created.getTime()) / 86400000;
      if (ageDays <= NEW_ARRIVAL_DAYS) {
        return { key: "new_arrival", label: CARD_BADGE_LABELS.new_arrival };
      }
    }
  }

  return null;
}

export function adaptProductForCard(product) {
  const selling = Number(product.pricing?.sellingPrice ?? product.price ?? 0);
  const mrp = Number(product.pricing?.mrp ?? 0);
  const compareAt = mrp > selling ? mrp : null;
  const discountPercent =
    compareAt && selling > 0
      ? Math.round(((compareAt - selling) / compareAt) * 100)
      : null;

  const uniqueImages = collectCardImages(product);

  const productType = String(
    product.type || product.productType || product.subcategory || ""
  ).trim();

  return {
    id: product._id,
    title: product.productName || product.name || product.product || "Product",
    productType,
    price: selling,
    compareAt,
    discountPercent,
    badge: resolveCardBadge(product),
    image: uniqueImages[0] || "",
    hoverImage: uniqueImages[1] || "",
    href: `/product/${product.slug || product._id}`,
    product,
  };
}

export const PRODUCT_CARD_BADGE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "new_arrival", label: "New Arrival" },
  { value: "trending", label: "Trending" },
  { value: "best_seller", label: "Best Seller" },
];
