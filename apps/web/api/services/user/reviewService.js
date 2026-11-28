import api from "../../axios/client";

export const reviewService = {
  /** { reviews, summary: { average, count, distribution }, page, pages } */
  list: async (productId, { page = 1, pageSize = 10, sort = "newest" } = {}) => {
    const response = await api.get(`/products/${productId}/reviews`, {
      params: { page, pageSize, sort },
    });
    return response.data;
  },

  /** { canReview, reason, review } for the signed-in shopper. */
  getMine: async (productId) => {
    const response = await api.get(`/products/${productId}/reviews/me`);
    return response.data;
  },

  /** Creates the shopper's review, or edits the one they already wrote. */
  saveMine: async (productId, { rating, title, body }) => {
    const response = await api.put(`/products/${productId}/reviews/me`, { rating, title, body });
    return response.data;
  },
};
