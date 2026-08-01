/**
 * payment.routes.js
 * ------------------
 * WHY THIS FILE EXISTS:
 *   This file declares all the URL endpoints for the payment module.
 *   It connects Express routes to the controller methods.
 *   It also handles the special case of the webhook route needing a raw body parser.
 *
 * WHERE IT LIVES: backend/modules/payment/payment.routes.js
 *
 * HOW IT CONNECTS:
 *   - Imported and mounted in server.js as app.use('/api/payments', paymentRoutes)
 *   - Uses paymentController for normal routes
 *   - Uses handleWebhook directly for the webhook route (with raw body parser)
 */

import express from 'express';
import paymentController from './payment.controller.js';
import handleWebhook from './payment.webhook.js';
import { protect } from '../../middleware/authMiddleware.js';

const router = express.Router();

// ── 🔒 Protected Routes (require logged-in user) ──────────────────────────────

/**
 * POST /api/payments/create-order
 *
 * Flow: User clicks "Pay" → frontend calls this → backend creates Razorpay order
 *       → returns order details to frontend → frontend opens Razorpay checkout modal
 *
 * Body: { localOrderId: "64abc..." }
 * Returns: { razorpayOrderId, amount, currency, keyId }
 */
router.post(
  '/create-order',
  protect, // must be logged in
  (req, res) => paymentController.createOrder(req, res)
);

/**
 * POST /api/payments/verify
 *
 * Flow: User completes payment in modal → Razorpay gives frontend 3 IDs
 *       → frontend calls this → backend verifies signature → marks order paid
 *
 * Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, localOrderId }
 * Returns: { orderId, status }
 */
router.post(
  '/verify',
  protect, // must be logged in
  (req, res) => paymentController.verifyPayment(req, res)
);

// ── 🌐 Webhook Route is now handled in server.js ────────────────────────────
// It must be mounted before global express.json() middleware.

export default router;
