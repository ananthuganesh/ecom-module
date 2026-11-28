import axiosInstance from "../../axios/client.js";

export const adminCouponService = {
  getAll: async () => {
    const response = await axiosInstance.get("/admin/coupons");
    return response.data;
  },

  create: async (couponData) => {
    const response = await axiosInstance.post("/admin/coupons", couponData);
    return response.data;
  },

  update: async (id, couponData) => {
    const response = await axiosInstance.put(`/admin/coupons/${id}`, couponData);
    return response.data;
  },

  delete: async (id) => {
    const response = await axiosInstance.delete(`/admin/coupons/${id}`);
    return response.data;
  },

  /** Customers for the "Specific customers" picker: `{ q }` to search, `{ ids }` to resolve. */
  customers: async ({ q = "", ids = [] } = {}) => {
    const response = await axiosInstance.get("/admin/coupons/customers", {
      params: { q: q || undefined, ids: ids.length ? ids.join(",") : undefined },
    });
    return Array.isArray(response.data) ? response.data : [];
  },
};
