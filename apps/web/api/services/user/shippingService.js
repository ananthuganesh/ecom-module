import api from "../../axios/client";

export const shippingService = {
  /** { deliverable: true | false | null, reason } — null means unverified. */
  checkDeliverable: async (pincode) => {
    const response = await api.get(`/shipping/deliverable/${pincode}`);
    return response.data;
  },

  getTrackingDetails: async (orderId) => {
    const response = await api.get(`/shipping/track/${orderId}`);
    return response.data;
  },
};
