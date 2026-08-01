import client from "../../axios/client.js";
import { userEndpoints } from "../../endpoints/user.js";

const { stripe: e } = userEndpoints;

export const stripeService = {
  getConfig: () =>
    client.get(e.config).then((res) => res.data),

  createPaymentIntent: (amount) =>
    client.post(e.createPaymentIntent, { amount }).then((res) => res.data),
};

export default stripeService;
