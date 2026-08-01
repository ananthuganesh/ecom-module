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
};
