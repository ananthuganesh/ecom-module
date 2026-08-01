import api from "../../axios/client";

export const shippingService = {
  getTrackingDetails: async (orderId) => {
    const response = await api.get(`/shipping/track/${orderId}`);
    return response.data;
  },
};
