import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { users: e } = adminEndpoints;

export const adminUserService = {
  getUsers: (params = {}) =>
    client.get(e.base, { params }).then((res) => res.data),

  getUserById: (id) =>
    client.get(e.byId(encodeURIComponent(String(id)))).then((res) => res.data),

  createCustomer: (data) =>
    client.post(e.base, data).then((res) => res.data),

  getUserOrders: (id) =>
    client
      .get(e.orders(encodeURIComponent(String(id))))
      .then((res) => res.data),

  getNeighbors: (id) =>
    client
      .get(e.neighbors(encodeURIComponent(String(id))))
      .then((res) => res.data),

  deleteUser: (id) =>
    client.delete(e.byId(encodeURIComponent(String(id)))).then((res) => res.data),
};

export default adminUserService;
