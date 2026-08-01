import client from "../../axios/client.js";

const MEDIA_BASE = "/admin/media";

export const adminMediaService = {
  list: (folder = "all") =>
    client.get(MEDIA_BASE, { params: { folder } }).then((res) => res.data),

  upload: (file, folder = "products") => {
    const target = folder === "ai" ? "ai" : "products";
    const form = new FormData();
    form.append("file", file);
    return client
      .post(`${MEDIA_BASE}/upload`, form, {
        params: { folder: target },
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((res) => res.data);
  },

  updateAlt: ({ folder, name, altText }) =>
    client.patch(`${MEDIA_BASE}/alt`, { folder, name, altText }).then((res) => res.data),

  delete: ({ folder, name }) =>
    client
      .delete(`${MEDIA_BASE}/${encodeURIComponent(name)}`, { params: { folder } })
      .then((res) => res.data),
};

export default adminMediaService;
