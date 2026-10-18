import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { collections: e } = adminEndpoints;

export const adminCollectionService = {
  /** [{ _id, name, slug, description, image, isActive, productCount }] */
  getAll: () => client.get(e.base).then((res) => res.data),
  /** Collection plus `products: [{ _id, productUrlId, name, slug, image, status, price }]` */
  getById: (id) => client.get(e.byId(id)).then((res) => res.data),
  create: (data) => client.post(e.base, data).then((res) => res.data),
  update: (id, data) => client.put(e.byId(id), data).then((res) => res.data),
  delete: (id) => client.delete(e.byId(id)).then((res) => res.data),
  addProducts: (id, productIds) =>
    client.post(e.addProducts(id), { productIds }).then((res) => res.data),
  removeProducts: (id, productIds) =>
    client.post(e.removeProducts(id), { productIds }).then((res) => res.data),
};

export default adminCollectionService;
