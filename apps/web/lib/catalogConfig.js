function intEnv(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Server-side storefront catalog knobs (from env, with safe defaults). */
export function getCatalogConfig() {
  return {
    revalidate: intEnv("STORE_CATALOG_REVALIDATE", 60),
    filtersRevalidate: intEnv("STORE_FILTERS_REVALIDATE", 300),
    homePageSize: intEnv("STORE_HOME_PAGE_SIZE", 12),
    catalogPageSize: intEnv("STORE_CATALOG_PAGE_SIZE", 40),
    categoryPageSize: intEnv("STORE_CATEGORY_PAGE_SIZE", 100),
    cardPriorityCount: intEnv("STORE_CARD_PRIORITY_COUNT", 4),
  };
}
