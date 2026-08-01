/**
 * payment.controller.js
 * ----------------------
 * WHY THIS FILE EXISTS:
 *   The controller is the TRAFFIC COP. It sits between the Express router and the service.
 *   It does three things only:
 *     1. Reads the incoming request (req.body, req.user, etc.)
 *     2. Calls the appropriate method on PaymentService
 *     3. Sends back a JSON response with the right status code
 *   It does NOT contain any Razorpay logic — that lives in payment.service.js.
 *
 * WHERE IT LIVES: backend/modules/payment/payment.controller.js
 *
 * HOW IT CONNECTS:
 *   - Imported by payment.routes.js
 *   - Calls methods on payment.service.js
 */

import paymentService from './payment.service.js';

class PaymentController {
  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/payments/create-order
  // Called when the user clicks "Pay Now" on the checkout page.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a Razorpay order for a local order.
   * The frontend uses the returned data to open the Razorpay checkout popup.
   */
  async createOrder(req, res) {
    try {
      const { localOrderId } = req.body;

      // Validate: the localOrderId must be provided
      if (!localOrderId) {
        return res.status(400).json({
          success: false,
          message: 'localOrderId is required in request body',
        });
      }

      // req.user is set by your auth middleware (the logged-in user's data)
      const userId = req.user._id;

      const result = await paymentService.createRazorpayOrder(localOrderId, userId);

      return res.status(200).json({
        success: true,
        message: 'Razorpay order created successfully',
        data: {
          // The frontend needs all three of these to open the Razorpay modal
          razorpayOrderId: result.razorpayOrder.id,
          amount:          result.razorpayOrder.amount, // in paise
          currency:        result.razorpayOrder.currency,
          keyId:           result.keyId, // only key_id — NEVER key_secret!
        },
      });
    } catch (error) {
      console.error('[PaymentController.createOrder] Full error:', error);
      const message = error.message || '';

      if (message.includes('not found')) {
        return res.status(404).json({ success: false, message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ success: false, message });
      }
      if (message.includes('already been paid')) {
        return res.status(409).json({ success: false, message });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order. Please try again.',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/payments/verify
  // Called AFTER the user completes payment in the Razorpay popup.
  // The frontend sends back 3 IDs that Razorpay gave it.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Verifies payment and marks the order as paid.
   */
  async verifyPayment(req, res) {
    try {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature, localOrderId } = req.body;

      // Validate: all four fields are required
      const missing = [];
      if (!razorpayOrderId)   missing.push('razorpayOrderId');
      if (!razorpayPaymentId) missing.push('razorpayPaymentId');
      if (!razorpaySignature) missing.push('razorpaySignature');
      if (!localOrderId)      missing.push('localOrderId');

      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missing.join(', ')}`,
        });
      }

      const updatedOrder = await paymentService.verifyPayment(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        localOrderId,
        req.user._id
      );

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully. Your order is confirmed!',
        data: { orderId: updatedOrder._id, status: updatedOrder.paymentStatus },
      });
    } catch (error) {
      console.error('[PaymentController.verifyPayment] Full error:', error);
      const message = error.message || '';

      if (message.includes('invalid signature')) {
        // This is a serious security event — someone tampered with the payment data
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed. Please contact support.',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Payment verification error. Please contact support.',
      });
    }
  }
}

export default new PaymentController();
