import client from "../../axios/client.js";

const MEDIA_BASE = "/admin/media";

function resolveFolder(folder = "products") {
  if (folder === "ai" || folder === "reels") return folder;
  if (folder === "all") return "all";
  return "products";
}

export const adminMediaService = {
  list: (folder = "all") =>
    client
      .get(MEDIA_BASE, { params: { folder: resolveFolder(folder) } })
      .then((res) => res.data),

  upload: (file, folder = "products") => {
    const target = resolveFolder(folder);
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
    client
      .patch(`${MEDIA_BASE}/alt`, { folder, name, altText })
      .then((res) => res.data),

  delete: ({ folder, name }) =>
    client
      .delete(`${MEDIA_BASE}/${encodeURIComponent(name)}`, { params: { folder } })
      .then((res) => res.data),
};

export default adminMediaService;
