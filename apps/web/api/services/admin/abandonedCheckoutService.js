import api from "../../axios";

export const abandonedCheckoutService = {
  // Public tracking
  upsertCheckout: async (data) => {
    const response = await api.post("/abandoned-checkout", data);
    return response.data;
  },

  /** Rehydrate cart via unguessable recovery token (never pass checkout/cart IDs). */
  recover: async (token) => {
    const response = await api.get("/abandoned-checkout/recover", {
      params: { token },
    });
    return response.data;
  },

  // Admin methods
  getAll: async (params) => {
    const response = await api.get("/admin/abandoned-checkouts", { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/admin/abandoned-checkouts/${id}`);
    return response.data;
  },

  /** Mint (if needed) and return a shareable recovery URL. */
  getRecoveryLink: async (id) => {
    const response = await api.get(
      `/admin/abandoned-checkouts/${encodeURIComponent(id)}/recovery-link`
    );
    return response.data;
  },
};
