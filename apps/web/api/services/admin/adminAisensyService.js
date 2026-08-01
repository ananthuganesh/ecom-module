import axiosClient from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/index.js";

const adminAisensyService = {
  getSettings: async () => {
    const response = await axiosClient.get(adminEndpoints.aisensy.settings);
    return response.data;
  },

  saveSettings: async (settingsData) => {
    const response = await axiosClient.put(adminEndpoints.aisensy.settings, settingsData);
    return response.data;
  },

  disconnect: async () => {
    const response = await axiosClient.post(adminEndpoints.aisensy.disconnect);
    return response.data;
  },

  syncCustomers: async () => {
    const response = await axiosClient.post(adminEndpoints.aisensy.syncCustomers);
    return response.data;
  },

  syncCatalog: async () => {
    const response = await axiosClient.post(adminEndpoints.aisensy.syncCatalog);
    return response.data;
  },

  sendAbandonedRecovery: async (checkoutId) => {
    const response = await axiosClient.post(
      adminEndpoints.aisensy.sendAbandonedRecovery(checkoutId)
    );
    return response.data;
  },
};

export default adminAisensyService;
