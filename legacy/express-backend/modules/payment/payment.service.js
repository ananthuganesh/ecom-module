/**
 * payment.service.js
 * -------------------
 * WHY THIS FILE EXISTS:
 *   This is the BRAIN of the payment module. It holds all the business logic —
 *   creating Razorpay orders, verifying signatures, updating the database.
 *   The controller just calls methods on this class; it has no idea how Razorpay works.
 *   This separation makes it easy to test and replace later (e.g. swap Razorpay for PayU).
 *
 * WHERE IT LIVES: backend/modules/payment/payment.service.js
 *
 * HOW IT CONNECTS:
 *   - Imports razorpay.client.js to talk to Razorpay API
 *   - Imports Order and PaymentTransaction models to read/write the DB
 *   - Is imported and used by payment.controller.js
 */

import crypto from 'crypto'; // Node.js built-in — no installation needed
import getRazorpayClient, { getActiveKeyId } from './razorpay.client.js';
import Setting from '../../models/settingModel.js';
import { decrypt } from '../../utils/encryption.js';
import Order from '../../models/orderModel.js';
import User from '../../models/userModel.js';
import PaymentTransaction from './paymentTransaction.model.js';
import ShiprocketService from '../../services/shiprocketService.js';

class PaymentService {
  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Create a Razorpay Order
  // Called when the user clicks "Proceed to Pay" on your checkout page.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a Razorpay order and a local PaymentTransaction record.
   *
   * @param {string} localOrderId  - Your MongoDB Order _id
   * @param {string} userId        - The logged-in user's _id
   * @returns {Object} { razorpayOrder, keyId } — send this to your frontend
   */
  async createRazorpayOrder(localOrderId, userId) {
    // 1a. Fetch the local order — we ALWAYS calculate the amount from our database,
    //     NEVER trust amounts coming from the frontend!
    const order = await Order.findById(localOrderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // 1b. Make sure this order belongs to the requesting user (security check)
    if (order.customerId.toString() !== userId.toString()) {
      throw new Error('Unauthorized: This order does not belong to you');
    }

    // 1c. Make sure the order isn't already paid (prevent double-payment)
    if (order.paymentStatus === 'paid') {
      throw new Error('This order has already been paid');
    }

    // 1d. Convert ₹ to paise (Razorpay requires the smallest currency unit)
    //     ₹249.00 → 24900 paise
    const amountInPaise = Math.round(order.finalPrice * 100);

    // 1e. Call Razorpay API to create an order
    //     This returns an object with an id like "order_XXXXXXXXXXXXXXXXXX"
    const client = await getRazorpayClient();
    const razorpayOrder = await client.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      // receipt: a unique string you can use for your own tracking.
      // Must be max 40 chars. We use the MongoDB _id which is 24 chars.
      receipt: `rcpt_${localOrderId}`,
      // notes: optional metadata — shows up in your Razorpay dashboard
      notes: {
        localOrderId: localOrderId.toString(),
        userId: userId.toString(),
      },
    });

    // 1f. Save a PaymentTransaction record in your DB with status 'created'
    await PaymentTransaction.create({
      orderId:        localOrderId,
      userId:         userId,
      razorpayOrderId: razorpayOrder.id,
      amountInPaise:  amountInPaise,
      currency:       'INR',
      status:         'created',
    });

    // 1g. Also store the Razorpay order ID on the local order (handy for admin lookups)
    await Order.findByIdAndUpdate(localOrderId, {
      razorpayOrderId: razorpayOrder.id,
    });

    // 1h. Return what the frontend needs to open the Razorpay checkout popup
    return {
      razorpayOrder,
      keyId: await getActiveKeyId(), // dynamic keyId
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Verify Payment After Checkout
  // Called AFTER the user pays and your frontend sends back the payment IDs.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Verifies that the payment actually happened and wasn't tampered with.
   *
   * How signature verification works (beginner explanation):
   *   Razorpay creates a unique "stamp" using your key_secret + the order/payment IDs.
   *   Your backend recreates the same stamp from scratch.
   *   If both stamps match → payment is genuine. If not → someone tried to fake it.
   *
   * @param {string} razorpayOrderId    - The Razorpay order ID
   * @param {string} razorpayPaymentId  - The Razorpay payment ID (after user pays)
   * @param {string} razorpaySignature  - The signature from Razorpay (from frontend)
   * @param {string} localOrderId       - Your MongoDB Order _id
   * @param {string} userId             - The logged-in user's _id (for security check)
   * @returns {Object} Updated order document
   */
  async verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature, localOrderId, userId) {
    // 2a. Recreate the expected signature on our end
    //     The formula is: HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
    
    // Fetch active key secret for verification
    const dbSetting = await Setting.findOne({ key: 'razorpay_settings' });
    const keySecret = (dbSetting && dbSetting.value && dbSetting.value.isConnected)
        ? decrypt(dbSetting.value.keySecret)
        : process.env.RAZORPAY_KEY_SECRET;

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    // 2b. Compare our signature with the one Razorpay sent
    //     We use timingSafeEqual to prevent timing attacks (a security best practice)
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(razorpaySignature, 'hex')
    );

    if (!isSignatureValid) {
      // SECURITY: Someone is trying to fake a payment — reject immediately!
      throw new Error('Payment verification failed: invalid signature');
    }

    // 2c. Signature is valid! Now fetch full payment details from Razorpay
    //     (to get the actual captured amount, method, bank details, etc.)
    const client = await getRazorpayClient();
    const paymentDetails = await client.payments.fetch(razorpayPaymentId);

    // 2d. Update the PaymentTransaction record
    await PaymentTransaction.findOneAndUpdate(
      { razorpayOrderId }, // find by Razorpay order ID
      {
        razorpayPaymentId,
        razorpaySignature,
        status:                  'captured',
        razorpayPaymentDetails:  paymentDetails,
        webhookProcessedAt:      new Date(),
      },
      { new: true }
    );

    // 2e. Mark the local order as paid — this is the final confirmation!
    const order = await Order.findById(localOrderId);
    if (!order) throw new Error('Order not found');

    // SECURITY: Ownership check
    if (order.customerId.toString() !== userId.toString()) {
        throw new Error('Unauthorized: This order does not belong to you');
    }

    if (order) {
        order.paymentStatus = 'paid';
        order.paymentMethod = 'razorpay';
        order.razorpayPaymentId = razorpayPaymentId;
        order.transactionDetails = {
            ...order.transactionDetails,
            paymentStatus: 'paid'
        };
        order.status = 'order placed';
        await order.save();

        // Trigger Shiprocket for prepaid now that it's paid
        if (!order.shiprocketOrderId) {
            try {
                const user = await User.findById(order.customerId);
                await ShiprocketService.processFullOrderFlow(order, user);
            } catch (srError) {
                console.error('[Payment Module] Shiprocket sync failed:', srError.message);
                order.shippingStatus = 'Shipping Sync Failed';
                await order.save();
            }
        }
    }

    return order;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: Handle Webhook Events (called by payment.webhook.js)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Processes a verified webhook event from Razorpay.
   * Handles 'payment.captured' and 'order.paid' events.
   *
   * Idempotency: if we already processed this event, we skip it safely.
   *
   * @param {Object} event        - The parsed Razorpay webhook JSON body
   * @param {string} webhookEventId - From the x-razorpay-event-id header
   */
  async handleWebhookEvent(event, webhookEventId) {
    const { event: eventName, payload } = event;

    console.log(`[Webhook] Received event: ${eventName} | eventId: ${webhookEventId}`);

    // Idempotency check: skip if we've already processed this exact event
    const alreadyProcessed = await PaymentTransaction.findOne({ webhookEventId });
    if (alreadyProcessed) {
      console.log(`[Webhook] Duplicate event ${webhookEventId} — skipping.`);
      return { skipped: true, reason: 'duplicate' };
    }

    if (eventName === 'payment.captured' || eventName === 'order.paid' || eventName === 'payment.authorized') {
      const paymentEntity = payload.payment?.entity;
      const orderEntity   = payload.order?.entity;

      const razorpayPaymentId = paymentEntity?.id;
      const razorpayOrderId   = paymentEntity?.order_id ?? orderEntity?.id;

      if (!razorpayOrderId) {
        console.warn('[Webhook] Missing order_id — cannot process event.');
        return { skipped: true, reason: 'missing_order_id' };
      }

      // Find our local PaymentTransaction for this Razorpay order
      const transaction = await PaymentTransaction.findOne({ razorpayOrderId });
      if (!transaction) {
        console.warn(`[Webhook] No transaction found for razorpayOrderId: ${razorpayOrderId}`);
        return { skipped: true, reason: 'transaction_not_found' };
      }

      // If it's authorized, we might want to capture it if it's not already captured
      // In many setups, authorization happens first, then capture.
      // For late authorizations, this is where we mark it as successful.
      if (eventName === 'payment.authorized') {
        console.log(`[Webhook] Payment authorized for order ${transaction.orderId}. Marking as paid (late auth).`);
      }

      // Only update if not already captured (prevents overwriting a verify() call)
      if (transaction.status !== 'captured') {
        await PaymentTransaction.findByIdAndUpdate(transaction._id, {
          razorpayPaymentId:      razorpayPaymentId,
          status:                 'captured',
          razorpayPaymentDetails: paymentEntity,
          webhookEventId:         webhookEventId,
          webhookProcessedAt:     new Date(),
        });

        const order = await Order.findById(transaction.orderId);
        if (order) {
            order.paymentStatus = 'paid';
            order.paymentMethod = 'razorpay';
            order.razorpayPaymentId = razorpayPaymentId;
            order.transactionDetails = {
                ...order.transactionDetails,
                paymentStatus: 'paid'
            };
            order.status = 'order placed';
            await order.save();

            // Trigger Shiprocket for prepaid now that it's paid
            if (!order.shiprocketOrderId) {
                try {
                    const user = await User.findById(order.customerId);
                    await ShiprocketService.processFullOrderFlow(order, user);
                } catch (srError) {
                    console.error('[Webhook] Shiprocket sync failed:', srError.message);
                    order.shippingStatus = 'Shipping Sync Failed';
                    await order.save();
                }
            }
        }

        console.log(`[Webhook] Order ${transaction.orderId} marked as paid and synced via ${eventName}`);
      }

      return { processed: true, orderId: transaction.orderId };
    }

    if (eventName === 'payment.failed') {
      const paymentEntity = payload.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;

      if (razorpayOrderId) {
        await PaymentTransaction.findOneAndUpdate(
          { razorpayOrderId },
          {
            status: 'failed',
            razorpayPaymentDetails: paymentEntity,
            webhookEventId: webhookEventId,
            webhookProcessedAt: new Date(),
          }
        );
        console.log(`[Webhook] Payment failed for order ${razorpayOrderId}`);
      }
      return { processed: true, reason: 'payment_failed_recorded' };
    }

    // For any other event (e.g., refund.processed), just log and return
    console.log(`[Webhook] Unhandled event type: ${eventName}`);
    return { processed: false, reason: 'unhandled_event' };
  }
}

// Export a single shared instance of the service (singleton pattern again)
export default new PaymentService();
