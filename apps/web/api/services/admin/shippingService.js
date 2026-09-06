import api from "../../axios/client";

export const adminShippingService = {
  /** Carrier options for the booking dropdown (code, label, configured). */
  getCarriers: async () => {
    const response = await api.get(`/shipping/carriers`);
    return response.data;
  },

  /** Per-carrier serviceability for a destination pincode. */
  checkServiceability: async (pincode) => {
    const response = await api.get(`/shipping/serviceability/${pincode}`);
    return response.data;
  },

  createShipment: async (orderId, carrier) => {
    const response = await api.post(
      `/shipping/create/${orderId}`,
      carrier ? { carrier } : {}
    );
    return response.data;
  },

  /** Soft-refresh carrier statuses for open AWB orders; returns updated order payloads. */
  syncStatuses: async (orderIds) => {
    const response = await api.post(`/shipping/sync-statuses`, { orderIds });
    return response.data;
  },

  downloadLabel: async (orderId) => {
    const response = await api.get(`/shipping/label/${orderId}`, {
      responseType: "blob",
    });
    return response.data;
  },

  downloadLabelsBulk: async (orderIds) => {
    const response = await api.post(
      `/shipping/labels/bulk`,
      { orderIds },
      { responseType: "blob" }
    );
    return {
      blob: response.data,
      printed: Number(response.headers["x-labels-printed"] || 0),
      skipped: Number(response.headers["x-labels-skipped"] || 0),
      errors: Number(response.headers["x-labels-errors"] || 0),
    };
  },
};
