import axiosClient from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/index.js";

const adminAiMediaService = {
  generate: async ({ referenceFile, productId, frontImageUrl, backImageUrl }) => {
    const form = new FormData();
    form.append("reference", referenceFile);
    form.append("product_id", productId);
    form.append("front_image_url", frontImageUrl);
    form.append("back_image_url", backImageUrl);
    const response = await axiosClient.post(adminEndpoints.aiMedia.generate, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
      validateStatus: (status) => status === 202 || (status >= 200 && status < 300),
    });
    return response.data;
  },

  getJob: async (id) => {
    const response = await axiosClient.get(adminEndpoints.aiMedia.job(id));
    return response.data;
  },

  listJobs: async () => {
    const response = await axiosClient.get(adminEndpoints.aiMedia.jobs);
    return response.data;
  },

  status: async () => {
    const response = await axiosClient.get(adminEndpoints.aiMedia.status);
    return response.data;
  },

  deleteJob: async (id) => {
    const response = await axiosClient.delete(adminEndpoints.aiMedia.job(id));
    return response.data;
  },

  approveJob: async (id, { productId, variantColor }) => {
    const response = await axiosClient.post(adminEndpoints.aiMedia.approve(id), {
      productId,
      variantColor: variantColor || undefined,
    });
    return response.data;
  },

  attachProduct: async (id, payload) => adminAiMediaService.approveJob(id, payload),
};

export default adminAiMediaService;
