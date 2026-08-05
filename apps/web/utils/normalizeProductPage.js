/** Normalize list + paging meta from GET /api/products. */
export function normalizeProductPage(data, { pageSize = 40, pageNum = 1 } = {}) {
  const products = Array.isArray(data?.products)
    ? data.products
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
  const page = Number(data?.page) || pageNum;
  const total = Number(data?.total);
  const pages = Number(data?.pages);
  const hasMore =
    Number.isFinite(pages) && pages > 0
      ? page < pages
      : Number.isFinite(total)
        ? page * pageSize < total
        : products.length >= pageSize;
  return {
    products,
    page,
    pages: Number.isFinite(pages) ? pages : hasMore ? page + 1 : page,
    total: Number.isFinite(total) ? total : products.length,
    hasMore,
  };
}
