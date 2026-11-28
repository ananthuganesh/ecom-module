import api from "../../axios/client";

export const returnService = {
  /** Which items are still returnable on this order, and until when. */
  eligibility: async (orderRef) => {
    const response = await api.get(`/returns/eligibility/${orderRef}`);
    return response.data;
  },

  /** items: [{ index, quantity }] */
  create: async (orderRef, { items, reason = "", note = "" }) => {
    const response = await api.post(`/returns/${orderRef}`, { items, reason, note });
    return response.data;
  },

  myReturns: async () => {
    const response = await api.get(`/returns`);
    return response.data;
  },
};
