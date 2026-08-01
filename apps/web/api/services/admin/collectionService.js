import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { collections: e } = adminEndpoints;

export const adminCollectionService = {
  getCollections: () =>
    client.get(e.base).then((res) => res.data),

  getById: (id) =>
    client.get(e.byId(id)).then((res) => res.data),

  create: (data) =>
    client.post(e.base, data).then((res) => res.data),

  update: (id, data) =>
    client.put(e.byId(id), data).then((res) => res.data),

  delete: (id) =>
    client.delete(e.byId(id)).then((res) => res.data),
};

export default adminCollectionService;
