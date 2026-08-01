/**
 * payment.webhook.js
 * -------------------
 * WHY THIS FILE EXISTS:
 *   Webhooks are how Razorpay talks back to your server automatically.
 *   When a payment is captured, Razorpay sends a POST request to your webhook URL.
 *   This file handles that incoming request.
 *
 *   WHY WEBHOOKS MATTER:
 *   The /verify endpoint depends on the user's browser. But what if:
 *   - The user closes the browser before /verify is called?
 *   - Their internet drops right after payment?
 *   Webhooks ensure your server ALWAYS knows about a payment, even without user action.
 *
 *   CRITICAL RAW BODY REQUIREMENT:
 *   To verify the webhook signature, we need the RAW, unmodified request body bytes.
 *   If Express parses JSON first (express.json()), the raw body is lost.
 *   That's why this route must use express.raw() BEFORE express.json().
 *   See server.js for how this is handled.
 *
 * WHERE IT LIVES: backend/modules/payment/payment.webhook.js
 *
 * HOW IT CONNECTS:
 *   - Mounted as a special route in payment.routes.js
 *   - Calls paymentService.handleWebhookEvent() for business logic
 */

import crypto from 'crypto';
import paymentService from './payment.service.js';
import Setting from '../../models/settingModel.js';
import { decrypt } from '../../utils/encryption.js';

/**
 * Webhook handler for POST /api/payments/webhook
 *
 * This is a standalone async function (not a class method) because
 * Express middleware functions work well as plain functions.
 */
const handleWebhook = async (req, res) => {
  // ── Step 1: Get the Razorpay signature from headers ──────────────────────────
  const razorpaySignature = req.headers['x-razorpay-signature'];
  const webhookEventId    = req.headers['x-razorpay-event-id'];
  
  // Fetch active webhook secret from DB or fallback to .env
  const dbSetting = await Setting.findOne({ key: 'razorpay_settings' });
  const webhookSecret = (dbSetting && dbSetting.value && dbSetting.value.webhookSecret)
    ? decrypt(dbSetting.value.webhookSecret)
    : process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!razorpaySignature) {
    console.warn('[Webhook] Missing x-razorpay-signature header');
    return res.status(400).json({ success: false, message: 'Missing signature header' });
  }

  if (!webhookSecret) {
    console.error('[Webhook] RAZORPAY_WEBHOOK_SECRET is not set in .env!');
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }

  // ── Step 2: Verify the webhook signature ────────────────────────────────────
  // req.body is the RAW Buffer here (because we use express.raw() for this route)
  // We compute an HMAC-SHA256 of the raw body using the webhook secret
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(req.body) // req.body must be raw Buffer — NOT parsed JSON!
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(razorpaySignature, 'hex')
  );

  if (!isValid) {
    console.warn(`[Webhook] Invalid signature for event ${webhookEventId}`);
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  // ── Step 3: Parse the body into JSON (we know it's safe now) ────────────────
  let event;
  try {
    // req.body is a Buffer from express.raw(), so we convert it to a string first
    event = JSON.parse(req.body.toString('utf8'));
  } catch (parseError) {
    console.error('[Webhook] Failed to parse webhook body:', parseError.message);
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }

  // ── Step 4: Immediately acknowledge Razorpay ────────────────────────────────
  // Razorpay expects a 200 response quickly (within 5 seconds).
  // If we take too long, Razorpay will retry the webhook (causing duplicates).
  // So we respond NOW and process asynchronously.
  res.status(200).json({ success: true, message: 'Webhook received' });

  // ── Step 5: Process the event asynchronously ────────────────────────────────
  // We don't await this — the response is already sent above.
  // Any errors here are logged but don't affect the 200 response.
  paymentService.handleWebhookEvent(event, webhookEventId).catch((err) => {
    console.error('[Webhook] Error processing event:', err.message);
  });
};

export default handleWebhook;
