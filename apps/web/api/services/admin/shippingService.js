import api from "../../axios/client";

export const adminShippingService = {
  createShipment: async (orderId) => {
    const response = await api.post(`/shipping/create/${orderId}`);
    return response.data;
  },

  /** Soft-refresh DTDC statuses for open AWB orders; returns updated order payloads. */
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
