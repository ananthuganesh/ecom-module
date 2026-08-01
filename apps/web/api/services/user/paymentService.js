import client from "../../axios/client.js";
import { userEndpoints } from "../../endpoints/user.js";

const { razorpay: e, orders: o } = userEndpoints;

/**
 * Service to handle Razorpay payment flows
 */
export const paymentService = {
  getConfig: () => client.get(e.config).then((res) => res.data),

  /**
   * Step 1: Create a Razorpay order from a local localOrderId
   * @param {string} localOrderId
   * @returns {Promise<{razorpayOrder: Object, keyId: string}>}
   */
  createRazorpayOrder: (localOrderId) =>
    client.post(e.createOrder, { localOrderId }).then((res) => res.data),

  /**
   * Step 2: Verify the payment signature after checkout is complete
   * @param {Object} verificationData - { razorpayOrderId, razorpayPaymentId, razorpaySignature, localOrderId }
   * @returns {Promise<Object>} The updated order
   */
  verifyPayment: (verificationData) =>
    client.post(e.verify, verificationData).then((res) => res.data),

  /**
   * Release soft-reserved stock when Razorpay modal is dismissed.
   */
  releaseReservation: (localOrderId) =>
    client
      .post(o.releaseReservation(localOrderId))
      .then((res) => res.data)
      .catch(() => null),
};

export default paymentService;
