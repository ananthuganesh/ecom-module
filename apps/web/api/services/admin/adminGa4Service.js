import axiosClient from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const adminGa4Service = {
  getReport: async (params = {}) => {
    const response = await axiosClient.get(adminEndpoints.ga4.report, { params });
    return response.data;
  },
};

export default adminGa4Service;
