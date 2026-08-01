import axiosClient from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/index.js";

const adminRazorpayService = {
    getSettings: async () => {
        const response = await axiosClient.get(adminEndpoints.razorpay.settings);
        return response.data;
    },

    saveSettings: async (settingsData) => {
        const response = await axiosClient.post(adminEndpoints.razorpay.settings, settingsData);
        return response.data;
    },

    disconnect: async () => {
        const response = await axiosClient.post(adminEndpoints.razorpay.disconnect);
        return response.data;
    }
};

export default adminRazorpayService;
