import client from "../../axios/client.js";

const base = "/admin/erp";

export const adminErpService = {
  // Order invoices (GST only when store GSTIN is set)
  salesInvoices: {
    list: () => client.get(`${base}/sales-invoices`).then((r) => r.data),
    create: (data) => client.post(`${base}/sales-invoices`, data).then((r) => r.data),
    fromOrder: (orderId) => client.post(`${base}/sales-invoices/from-order/${orderId}`).then((r) => r.data),
    byOrder: async (orderId) => {
      try {
        const res = await client.get(`${base}/sales-invoices/by-order/${orderId}`, {
          // Missing invoice is normal until "Create invoice" is used
          validateStatus: (status) => status === 200 || status === 404,
        });
        if (res.status === 404) return null;
        return res.data;
      } catch {
        return null;
      }
    },
  },
  creditNotes: {
    list: () => client.get(`${base}/credit-notes`).then((r) => r.data),
    create: (data) => client.post(`${base}/credit-notes`, data).then((r) => r.data),
  },
  salesReturns: {
    list: () => client.get(`${base}/sales-returns`).then((r) => r.data),
    create: (data) => client.post(`${base}/sales-returns`, data).then((r) => r.data),
  },
  // Finance
  payments: {
    list: () => client.get(`${base}/payments`).then((r) => r.data),
    create: (data) => client.post(`${base}/payments`, data).then((r) => r.data),
  },
  // Reports / RBAC
  reports: {
    overview: () => client.get(`${base}/reports/overview`).then((r) => r.data),
  },
  roles: {
    list: () => client.get(`${base}/roles`).then((r) => r.data),
  },
  listStaffUsers: () => client.get(`${base}/users`).then((r) => r.data),
  createStaffUser: (data) =>
    client.post(`${base}/users`, data).then((r) => r.data),
  assignRole: (userId, roleId) =>
    client.put(`${base}/users/${userId}/role`, { roleId }).then((r) => r.data),
};

export default adminErpService;
