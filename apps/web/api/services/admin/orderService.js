import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { orders: e } = adminEndpoints;

export const adminOrderService = {
  getAll: (params) =>
    client.get(e.base, { params }).then((res) => res.data),

  getStats: (params) =>
    client.get(e.counts, { params }).then((res) => res.data),

  getCounts: () =>
    client.get(e.counts).then((res) => res.data),

  getById: (id) =>
    client.get(e.byId(id)).then((res) => res.data),

  getNeighbors: (id) =>
    client.get(`/admin/orders/${encodeURIComponent(id)}/neighbors`).then((res) => res.data),

  updateStatus: (id, status) =>
    client.patch(e.status(id), { status }).then((res) => res.data),

  archive: (id, archived = true) =>
    client.patch(e.archive(id), { archived }).then((res) => res.data),

  handleReturn: (id, action) =>
    client.patch(e.return(id), { action }).then((res) => res.data),

  updatePaymentStatus: (id, paymentStatus) =>
    client.patch(`/admin/orders/${id}/payment-status`, { paymentStatus }).then((res) => res.data),
};

export default adminOrderService;
