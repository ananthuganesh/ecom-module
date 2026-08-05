import { getInternalApiBase } from "@/lib/siteUrl";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { normalizeProductPage } from "@/utils/normalizeProductPage";

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "" || value === "All") return;
    const serialized = Array.isArray(value) ? value.join(",") : String(value);
    if (serialized) searchParams.set(key, serialized);
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

/**
 * Server-side product list fetch (RSC / sitemap-style).
 * Uses INTERNAL_BACKEND_URL so first paint can include cards.
 * Returns products array only (home / category callers).
 */
export async function fetchStoreProducts(params = {}, options = {}) {
  const page = await fetchStoreProductsPage(params, options);
  return page.products;
}

/**
 * Same as fetchStoreProducts but keeps page / pages / total / hasMore for infinite scroll.
 */
export async function fetchStoreProductsPage(params = {}, options = {}) {
  const { revalidate: defaultRevalidate, catalogPageSize } = getCatalogConfig();
  const revalidate =
    options.revalidate != null ? options.revalidate : defaultRevalidate;
  const pageSize = Number(params.pageSize) || catalogPageSize;
  const pageNum = Number(params.pageNum) || 1;
  const empty = normalizeProductPage(null, { pageSize, pageNum });
  const base = getInternalApiBase();
  const url = `${base}/api/products${buildQuery(params)}`;
  try {
    const res = await fetch(url, {
      next: { revalidate, tags: ["store-catalog"] },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return empty;
    return normalizeProductPage(await res.json(), { pageSize, pageNum });
  } catch (err) {
    console.error("fetchStoreProductsPage failed", err);
    return empty;
  }
}

export async function fetchStoreFilters(options = {}) {
  const { filtersRevalidate } = getCatalogConfig();
  const revalidate =
    options.revalidate != null ? options.revalidate : filtersRevalidate;
  const base = getInternalApiBase();
  try {
    const res = await fetch(`${base}/api/products/filters`, {
      next: { revalidate, tags: ["store-filters"] },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        sizes: [],
        colors: [],
        categories: [],
        fits: [],
        fabrics: [],
        badges: [],
        priceRanges: [],
      };
    }
    const data = await res.json();
    return {
      sizes: Array.isArray(data?.sizes) ? data.sizes : [],
      colors: Array.isArray(data?.colors) ? data.colors : [],
      categories: Array.isArray(data?.categories) ? data.categories : [],
      fits: Array.isArray(data?.fits) ? data.fits : [],
      fabrics: Array.isArray(data?.fabrics) ? data.fabrics : [],
      badges: Array.isArray(data?.badges) ? data.badges : [],
      priceRanges: Array.isArray(data?.priceRanges) ? data.priceRanges : [],
    };
  } catch (err) {
    console.error("fetchStoreFilters failed", err);
    return {
      sizes: [],
      colors: [],
      categories: [],
      fits: [],
      fabrics: [],
      badges: [],
      priceRanges: [],
    };
  }
}
