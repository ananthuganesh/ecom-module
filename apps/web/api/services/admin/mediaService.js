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

  upload: (file, folder = "products", { onUploadProgress } = {}) => {
    const target = resolveFolder(folder);
    const form = new FormData();
    form.append("file", file);
    return client
      .post(`${MEDIA_BASE}/upload`, form, {
        params: { folder: target },
        // Let the browser set multipart boundary (do not force Content-Type).
        headers: { "Content-Type": false },
        onUploadProgress,
        // Large reels can take several minutes through the Next.js proxy → API → R2.
        timeout: 10 * 60 * 1000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      })
      .then((res) => res.data);
  },

  updateAlt: ({ folder, name, altText }) =>
    client
      .patch(`${MEDIA_BASE}/alt`, { folder, name, altText })
      .then((res) => res.data),

  updateVisible: ({ folder, name, visible }) =>
    client
      .patch(`${MEDIA_BASE}/visible`, { folder, name, visible: Boolean(visible) })
      .then((res) => res.data),

  delete: ({ folder, name }) =>
    client
      .delete(`${MEDIA_BASE}/${encodeURIComponent(name)}`, { params: { folder } })
      .then((res) => res.data),
};

export default adminMediaService;
