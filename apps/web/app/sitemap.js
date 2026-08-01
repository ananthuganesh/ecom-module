import { absoluteUrl, getInternalApiBase, getSiteUrl } from "@/lib/siteUrl";

export const revalidate = 3600;

async function fetchAllProductPaths() {
  const base = getInternalApiBase();
  const paths = [];
  let page = 1;
  const pageSize = 100;

  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${base}/api/products?pageNum=${page}&pageSize=${pageSize}`, {
        next: { revalidate: 3600 },
        headers: { Accept: "application/json" },
      });
      if (!res.ok) break;
      const data = await res.json();
      const products = Array.isArray(data?.products) ? data.products : [];
      for (const p of products) {
        const slug = p.slug || p._id || p.id;
        if (slug) paths.push(`/product/${slug}`);
      }
      const pages = Number(data?.pages || 1);
      if (page >= pages || products.length === 0) break;
      page += 1;
    } catch {
      break;
    }
  }
  return paths;
}

export default async function sitemap() {
  const site = getSiteUrl();
  const now = new Date();
  const staticRoutes = [
    "",
    "/all-products",
    "/about",
    "/contact",
    "/wishlist",
    "/cart",
  ].map((path) => ({
    url: absoluteUrl(path || "/"),
    lastModified: now,
    changeFrequency: path === "" || path === "/all-products" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/all-products" ? 0.9 : 0.6,
  }));

  const productPaths = await fetchAllProductPaths();
  const productRoutes = productPaths.map((path) => ({
    url: `${site}${path}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticRoutes, ...productRoutes];
}
