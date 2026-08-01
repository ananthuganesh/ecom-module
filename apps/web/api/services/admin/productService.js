import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { products: e } = adminEndpoints;

export const adminProductService = {
  getProducts: (params = {}) => {
    const query = new URLSearchParams({ _t: String(Date.now()) });
    if (params.category) query.set("category", params.category);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.skip != null) query.set("skip", String(params.skip));
    return client.get(`${e.base}?${query.toString()}`).then((res) => res.data);
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

  delete: (id) =>
    client.delete(e.byId(id)).then((res) => res.data),
};

export default adminProductService;
