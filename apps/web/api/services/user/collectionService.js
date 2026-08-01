import client from "../../axios/client.js";

export const collectionService = {
  getCollections: () => 
    client.get("/collections").then((res) => res.data),

  getByCategory: (slug) => 
    client.get(`/collections/category/${slug}`).then((res) => res.data),

  getBySlug: (slug) => 
    client.get(`/collections/${slug}`).then((res) => res.data),
};

export default collectionService;
