import axiosClient from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/index.js";

const adminGa4Service = {
  getSettings: async () => {
    const response = await axiosClient.get(adminEndpoints.ga4.settings);
    return response.data;
  },

  getReport: async (params = {}) => {
    const response = await axiosClient.get(adminEndpoints.ga4.report, { params });
    return response.data;
  },
};

export default adminGa4Service;
