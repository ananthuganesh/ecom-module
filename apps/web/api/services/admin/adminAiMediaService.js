import client from "../../axios/client.js";

const BASE = "/admin/ai-media";

export const adminAiMediaService = {
  status: () => client.get(`${BASE}/status`).then((res) => res.data),

  listJobs: () => client.get(`${BASE}/jobs`).then((res) => res.data),

  getJob: (jobId) =>
    client.get(`${BASE}/jobs/${encodeURIComponent(jobId)}`).then((res) => res.data),

  generateImage: ({
    prompt,
    aspectRatio = "3:4",
    quality = "high",
    background = "auto",
    n = 1,
    references = [],
  }) => {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("aspect_ratio", aspectRatio);
    form.append("quality", quality);
    form.append("background", background);
    form.append("n", String(n));
    for (const file of references) {
      form.append("references", file);
    }
    return client
      .post(`${BASE}/images`, form, {
        headers: { "Content-Type": false },
        timeout: 60 * 1000,
      })
      .then((res) => res.data);
  },

  deleteJob: (jobId) =>
    client
      .delete(`${BASE}/jobs/${encodeURIComponent(jobId)}`)
      .then((res) => res.data),
};

export default adminAiMediaService;
