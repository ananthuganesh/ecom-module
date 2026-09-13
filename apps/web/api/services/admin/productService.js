import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { products: e } = adminEndpoints;

const PAGE_SIZE = 200;

async function fetchProductPage(params = {}) {
  const query = new URLSearchParams({ _t: String(Date.now()) });
  if (params.category) query.set("category", params.category);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.skip != null) query.set("skip", String(params.skip));
  const data = await client.get(`${e.base}?${query.toString()}`).then((res) => res.data);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.products)) return data.products;
  return [];
}

export const adminProductService = {
  /** Distinct values already used for free-text attributes (fit, pattern, …). */
  getAttributeOptions: async () => {
    const response = await client.get(`${e.base}/attribute-options`);
    return response.data;
  },

  getProducts: (params = {}) => fetchProductPage(params),

  /** Page through the admin products API (max 200/page). */
  getAllProducts: async (params = {}) => {
    const pageSize = Math.min(Number(params.limit) || PAGE_SIZE, PAGE_SIZE);
    const all = [];
    let page = 1;
    for (;;) {
      const batch = await fetchProductPage({
        ...params,
        page,
        limit: pageSize,
      });
      all.push(...batch);
      if (batch.length < pageSize) break;
      page += 1;
      if (page > 50) break;
    }
    return all;
  },

  getById: (id) =>
    client
      .get(`/admin/products/${encodeURIComponent(String(id))}`)
      .then((res) => res.data),

  getNeighbors: (id) =>
    client
      .get(`/admin/products/${encodeURIComponent(String(id))}/neighbors`)
      .then((res) => res.data),

  create: (data) =>
    client.post(e.base, data).then((res) => res.data),

  update: (id, data) =>
    client
      .put(`/admin/products/${encodeURIComponent(String(id))}`, data)
      .then((res) => res.data),

  bulkUpdate: (data) =>
    client.patch(e.bulkUpdate, data).then((res) => res.data),

  uploadImage: (file) => {
    const maxBytes = 25 * 1024 * 1024;
    if (file?.size > maxBytes) {
      return Promise.reject({
        response: { data: { detail: "Image must be 25 MB or smaller" } },
        message: "Image must be 25 MB or smaller",
      });
    }
    const form = new FormData();
    form.append("file", file);
    return client
      .post("/admin/upload/image", form, {
        headers: { "Content-Type": false },
        timeout: 2 * 60 * 1000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      })
      .then((res) => res.data);
  },

  delete: (id) =>
    client
      .delete(`/admin/products/${encodeURIComponent(String(id))}`)
      .then((res) => res.data),
};

export default adminProductService;
