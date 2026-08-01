import axiosInstance from '../../axios/client.js';

export const couponService = {
  validate: async (code, amount, items = []) => {
    const response = await axiosInstance.post('/coupons/validate', {
      code,
      subtotal: amount,
      amount,
      items,
    });
    return response.data;
  },
  getAll: async () => {
    const response = await axiosInstance.get('/coupons');
    return response.data;
  },
};
