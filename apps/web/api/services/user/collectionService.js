import client from "../../axios/client.js";
import { userEndpoints } from "../../endpoints/user.js";

const { collections: e } = userEndpoints;

export const collectionService = {
  /** Active collections with their live product counts. */
  getAll: () => client.get(e.base).then((res) => res.data),
  getBySlug: (slug) => client.get(e.bySlug(slug)).then((res) => res.data),
};

export default collectionService;
