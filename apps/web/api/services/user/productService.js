import client from "../../axios/client.js";
import { userEndpoints } from "../../endpoints/user.js";

const { products: e } = userEndpoints;

/**
 * @param {Object} params - { product?, category?, keyword?, sort? } — product = schema field for classification (Hijabs, Accessories, etc.)
 */
export const productService = {
  getProducts: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.product && params.product !== "All")
      searchParams.append("product", params.product);
    if (params.category && params.category !== "All")
      searchParams.append("category", params.category);

    ["brand", "color", "size", "fit", "fabric", "badge"].forEach((key) => {
      if (!params[key]) return;
      const value = Array.isArray(params[key]) ? params[key].join(",") : params[key];
      searchParams.append(key, value);
    });

    if (params.priceRange) searchParams.append("priceRange", params.priceRange);
    if (params.keyword) searchParams.append("keyword", params.keyword);
    if (params.sort) searchParams.append("sort", params.sort);
    if (params.pageSize != null) searchParams.append("pageSize", String(params.pageSize));
    if (params.pageNum != null) searchParams.append("pageNum", String(params.pageNum));
    const query = searchParams.toString();
    const url = query ? `${e.base}?${query}` : e.base;
    return client.get(url).then((res) => res.data);
  },

  getFeatured: () =>
    client.get(e.featured).then((res) => res.data),
  getFilters: () =>
    client.get(`${e.base}/filters`).then((res) => res.data),
  getBrands: () =>
    client.get(`${e.base}/brands`).then((res) => res.data),
  getColors: () =>
    client.get(`${e.base}/colors`).then((res) => res.data),
  getById: (id) =>
    client.get(e.byId(id)).then((res) => res.data),
  getBySlug: (slug) =>
    client.get(`${e.base}/slug/${slug}`).then((res) => res.data),
  getSuggestions: (keyword) =>
    client
      .get(`${e.base}/search/suggestions`, { params: { q: keyword } })
      .then((res) => res.data),
};

export default productService;
