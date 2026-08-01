import client from "../../axios/client.js";
import { adminEndpoints } from "../../endpoints/admin.js";

const { wallet: e } = adminEndpoints;

export const adminWalletService = {
  getByUserId: (userId) =>
    client.get(e.byUserId(userId)).then((res) => res.data),

  getTransactions: (userId) =>
    client.get(e.transactions(userId)).then((res) => res.data),

  issueRefund: (data) =>
    client.post(e.refund, data).then((res) => res.data),
};

export default adminWalletService;
