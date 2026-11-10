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

  addAddress: (id, data) =>
    client
      .post(e.addresses(encodeURIComponent(String(id))), data)
      .then((res) => res.data),

  updateAddress: (id, addressId, data) =>
    client
      .put(e.address(encodeURIComponent(String(id)), encodeURIComponent(String(addressId))), data)
      .then((res) => res.data),

  setDefaultAddress: (id, addressId) =>
    client
      .post(e.addressDefault(encodeURIComponent(String(id)), encodeURIComponent(String(addressId))))
      .then((res) => res.data),

  deleteAddress: (id, addressId) =>
    client
      .delete(e.address(encodeURIComponent(String(id)), encodeURIComponent(String(addressId))))
      .then((res) => res.data),

  deleteUser: (id) =>
    client.delete(e.byId(encodeURIComponent(String(id)))).then((res) => res.data),
};

export default adminUserService;
