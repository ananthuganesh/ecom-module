import client from "../../axios/client.js";
import { userEndpoints } from "../../endpoints/user.js";

const { orders: e } = userEndpoints;

export const orderService = {
  create: (orderData) =>
    client.post(e.base, orderData).then((res) => res.data),

  getMyOrders: () =>
    client.get(e.myOrders).then((res) => res.data),

  getById: (id) =>
    client.get(e.byId(id)).then((res) => res.data),

  getInvoice: (id) =>
    client.get(e.invoice(id)).then((res) => res.data),

  /** Change where a paid order goes (same state, before it's handed to the courier).
   *  data: address fields, or { addressId } for a saved address. */
  updateShippingAddress: (id, data) =>
    client.put(e.shippingAddress(id), data).then((res) => res.data),

  updateToPaid: (id, paymentResult) =>
    client.put(e.pay(id), paymentResult).then((res) => res.data),
};

export default orderService;
