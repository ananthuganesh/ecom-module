import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { stock: e } = adminEndpoints;

export const adminStockService = {
  list: (params) => client.get(e.base, { params }).then((res) => res.data),
  movements: (params) => client.get(e.movements, { params }).then((res) => res.data),
  adjust: (data) => client.post(e.adjust, data).then((res) => res.data),
  product: (id) => client.get(e.product(id)).then((res) => res.data),
  backfill: () => client.post(e.backfill).then((res) => res.data),
};

export default adminStockService;
