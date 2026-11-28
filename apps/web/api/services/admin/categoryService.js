import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { categories: e } = adminEndpoints;

export const adminCategoryService = {
  getAll: () => client.get(e.base).then((res) => res.data),
  create: (data) => client.post(e.base, data).then((res) => res.data),
  update: (id, data) => client.put(e.byId(id), data).then((res) => res.data),
  delete: (id) => client.delete(e.byId(id)).then((res) => res.data),
};

export default adminCategoryService;
