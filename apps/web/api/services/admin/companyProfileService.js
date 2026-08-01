import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { companyProfile: e } = adminEndpoints;

export const adminCompanyProfileService = {
  get: () => client.get(e.base).then((res) => res.data),
  save: (data) => client.put(e.base, data).then((res) => res.data),
};

export default adminCompanyProfileService;
