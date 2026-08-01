import axiosClient from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/index.js";

const adminGtmService = {
  getSettings: async () => {
    const response = await axiosClient.get(adminEndpoints.gtm.settings);
    return response.data;
  },

  saveSettings: async (settingsData) => {
    const response = await axiosClient.put(adminEndpoints.gtm.settings, settingsData);
    return response.data;
  },
};

export default adminGtmService;
