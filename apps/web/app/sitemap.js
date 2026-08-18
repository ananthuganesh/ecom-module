import { absoluteUrl, getInternalApiBase, getSiteUrl } from "@/lib/siteUrl";
import { fetchStoreFilters } from "@/lib/fetchProducts";
import { PRODUCT_CATEGORIES } from "@/utils/productForm";

export const revalidate = 3600;

function categorySlug(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function productImage(product) {
  const img =
    product?.thumbnails?.[0] ||
    product?.images?.[0] ||
    product?.variants?.[0]?.images?.[0] ||
    "";
  if (!img) return null;
  const src = String(img);
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  return absoluteUrl(src.startsWith("/") ? src : `/${src}`);
}

async function fetchAllLiveProducts() {
  const base = getInternalApiBase();
  const products = [];
  let page = 1;
  const pageSize = 100;

  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(
        `${base}/api/products?pageNum=${page}&pageSize=${pageSize}&sort=newest`,
        {
          next: { revalidate: 3600, tags: ["store-catalog"] },
          headers: { Accept: "application/json" },
        }
      );
      if (!res.ok) break;
      const data = await res.json();
      const batch = Array.isArray(data?.products) ? data.products : [];
      products.push(...batch);
      const pages = Number(data?.pages || 1);
      if (page >= pages || batch.length === 0) break;
      page += 1;
    } catch {
      break;
    }
  }
  return products;
}

export default async function sitemap() {
  const site = getSiteUrl();
  const now = new Date();

  const staticRoutes = [
    { path: "", changefreq: "daily", priority: 1 },
    { path: "/all-products", changefreq: "daily", priority: 0.9 },
    { path: "/about", changefreq: "monthly", priority: 0.4 },
    { path: "/contact", changefreq: "monthly", priority: 0.4 },
    { path: "/privacy-policy", changefreq: "yearly", priority: 0.2 },
    { path: "/terms-and-conditions", changefreq: "yearly", priority: 0.2 },
    { path: "/return-refund", changefreq: "yearly", priority: 0.3 },
  ].map((row) => ({
    url: absoluteUrl(row.path || "/"),
    lastModified: now,
    changeFrequency: row.changefreq,
    priority: row.priority,
  }));

  const facets = await fetchStoreFilters({ revalidate: 3600 });
  const categoryNames = [
    ...new Set(
      [...(facets.categories || []), ...PRODUCT_CATEGORIES]
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    ),
  ];
  const categoryRoutes = categoryNames
    .map((name) => categorySlug(name))
    .filter(Boolean)
    .map((slug) => ({
      url: absoluteUrl(`/category/${slug}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  const products = await fetchAllLiveProducts();
  const seen = new Set();
  const productRoutes = [];
  for (const product of products) {
    if (String(product?.status || "active").toLowerCase() === "draft") continue;
    const slug = product.slug || product._id || product.id;
    if (!slug) continue;
    const path = `/product/${slug}`;
    if (seen.has(path)) continue;
    seen.add(path);
    const image = productImage(product);
    productRoutes.push({
      url: `${site}${path}`,
      lastModified: parseDate(product.updatedAt) || parseDate(product.createdAt) || now,
      changeFrequency: "weekly",
      priority: 0.7,
      ...(image ? { images: [image] } : {}),
    });
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
