import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const e = adminEndpoints.productColors;

export const adminProductColorService = {
  getAll: () => client.get(e.base).then((res) => res.data),
  create: (name) =>
    client.post(e.base, { name }).then((res) => res.data),
};

export default adminProductColorService;
