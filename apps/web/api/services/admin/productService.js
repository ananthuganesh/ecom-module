import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { products: e } = adminEndpoints;

export const adminProductService = {
  getProducts: (params = {}) => {
    console.log('[ProductService] Fetching products with params:', params);
    let url = `${e.base}?_t=${Date.now()}`;
    if (params.category) {
      url += `&category=${params.category}`;
    }
    return client.get(url).then((res) => res.data);
  },

  getById: (id) =>
    client.get(e.byId(id)).then((res) => res.data),

  getNeighbors: (id) =>
    client
      .get(`/admin/products/${encodeURIComponent(id)}/neighbors`)
      .then((res) => res.data),

  create: (data) =>
    client.post(e.base, data).then((res) => res.data),

  update: (id, data) =>
    client.put(e.byId(id), data).then((res) => res.data),

  updatePricing: (id, data) =>
    client.patch(e.pricing(id), data).then((res) => res.data),

  updateStock: (id, data) =>
    client.patch(e.stock(id), data).then((res) => res.data),

  updateVariant: (id, data) =>
    client.patch(e.variant(id), data).then((res) => res.data),

  bulkUpdate: (data) =>
    client.patch(e.bulkUpdate, data).then((res) => res.data),

  uploadImage: (file) => {
    const maxBytes = 10 * 1024 * 1024;
    if (file?.size > maxBytes) {
      return Promise.reject({
        response: { data: { detail: "Image must be 10 MB or smaller" } },
        message: "Image must be 10 MB or smaller",
      });
    }
    const form = new FormData();
    form.append("file", file);
    return client
      .post("/admin/upload/image", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((res) => res.data);
  },

  importProducts: (file) => {
    const form = new FormData();
    form.append("file", file);
    return client
      .post(`${e.base}/import`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((res) => res.data);
  },

  delete: (id) =>
    client.delete(e.byId(id)).then((res) => res.data),
};

export default adminProductService;
