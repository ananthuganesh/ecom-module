import api from "../../axios/client";

export const adminReviewsService = {
  /** status: all | published | hidden; rating: 1-5 */
  list: async ({ status = "all", rating, q = "", page = 1, pageSize = 25 } = {}) => {
    const response = await api.get(`/admin/reviews`, {
      params: { status, rating: rating || undefined, q: q || undefined, page, pageSize },
    });
    return response.data;
  },

  hide: async (reviewId) => {
    const response = await api.post(`/admin/reviews/${reviewId}/hide`);
    return response.data;
  },

  publish: async (reviewId) => {
    const response = await api.post(`/admin/reviews/${reviewId}/publish`);
    return response.data;
  },
};
