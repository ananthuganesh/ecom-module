import axiosInstance from '../../axios/client.js';

export const couponService = {
  /**
   * Apply a code on top of the cart's automatic discounts.
   * `extra`: { pincode, phone, email } — for free-shipping and per-customer codes.
   */
  validate: async (code, amount, items = [], extra = {}) => {
    const response = await axiosInstance.post('/coupons/validate', {
      code,
      subtotal: amount,
      amount,
      items,
      ...extra,
    });
    return response.data;
  },
  /** Automatic discounts (and optionally a code) for this cart, for the summary. */
  preview: async (items = [], extra = {}) => {
    const response = await axiosInstance.post('/coupons/preview', { items, ...extra });
    return response.data;
  },
  getAll: async () => {
    const response = await axiosInstance.get('/coupons');
    return response.data;
  },
  getForProduct: async (productId) => {
    const response = await axiosInstance.get(`/coupons/product/${encodeURIComponent(productId)}`);
    return response.data;
  },
};
