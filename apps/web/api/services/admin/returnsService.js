import api from "../../axios/client";

export const adminReturnsService = {
  /** Returns queue. status: all | requested | approved | picked_up | received | rejected */
  list: async ({ status = "all", q = "", page = 1, pageSize = 25 } = {}) => {
    const response = await api.get(`/admin/returns`, {
      params: { status, q: q || undefined, page, pageSize },
    });
    return response.data;
  },

  getById: async (returnId) => {
    const response = await api.get(`/admin/returns/${returnId}`);
    return response.data;
  },

  /** Approve and book the Delhivery reverse pickup. */
  approve: async (returnId) => {
    const response = await api.post(`/admin/returns/${returnId}/approve`);
    return response.data;
  },

  reject: async (returnId, reason) => {
    const response = await api.post(`/admin/returns/${returnId}/reject`, { reason });
    return response.data;
  },

  /** Goods are back: posts a sales return and restocks. Does not refund. */
  markReceived: async (returnId) => {
    const response = await api.post(`/admin/returns/${returnId}/received`);
    return response.data;
  },
};
