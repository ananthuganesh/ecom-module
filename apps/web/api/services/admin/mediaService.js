import client from "../../axios/client.js";
import { adminProductService } from "./productService.js";

const MEDIA_BASE = "/admin/media";

export const adminMediaService = {
  list: (folder = "all") =>
    client.get(MEDIA_BASE, { params: { folder } }).then((res) => res.data),

  upload: (file) => adminProductService.uploadImage(file),

  updateAlt: ({ folder, name, altText }) =>
    client.patch(`${MEDIA_BASE}/alt`, { folder, name, altText }).then((res) => res.data),

  delete: ({ folder, name }) =>
    client
      .delete(`${MEDIA_BASE}/${encodeURIComponent(name)}`, { params: { folder } })
      .then((res) => res.data),
};

export default adminMediaService;
