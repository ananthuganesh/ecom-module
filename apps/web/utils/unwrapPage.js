/**
 * Normalize admin list API responses that may be a bare array (legacy)
 * or `{ items, total, page, limit, hasMore }`.
 */
export function unwrapPage(data, { fallbackLimit = 50 } = {}) {
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      page: 1,
      limit: data.length || fallbackLimit,
      hasMore: false,
    };
  }

  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.data)
        ? data.data
        : [];

  const limit = Number(data?.limit) || items.length || fallbackLimit;
  const page = Number(data?.page) || 1;
  const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : items.length;
  const hasMore =
    typeof data?.hasMore === "boolean" ? data.hasMore : page * limit < total;

  return { items, total, page, limit, hasMore };
}
