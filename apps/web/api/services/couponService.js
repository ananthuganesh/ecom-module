import axiosInstance from '../axios/axiosInstance';

export const couponService = {
  validate: async (code, amount) => {
    const response = await axiosInstance.post('/coupons/validate', { code, amount });
    return response.data;
  },
};
