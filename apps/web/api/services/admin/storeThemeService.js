import api from "../../axios/client";

export const adminStoreThemeService = {
  /** Hero banners, plus whether the shipped defaults are still in use. */
  getBanners: async () => {
    const response = await api.get(`/admin/store-theme/banners`);
    return response.data;
  },

  /** heroSlides: [{ url, alt, visible, href }] — saved as a whole, in order. */
  saveBanners: async (heroSlides) => {
    const response = await api.put(`/admin/store-theme/banners`, { heroSlides });
    return response.data;
  },
};
