/**
 * paymentTransactionModel.js
 * ---------------------------
 * WHY THIS FILE EXISTS:
 *   Your Order model stores what the customer bought.
 *   This model stores HOW they paid — every Razorpay payment attempt, whether
 *   successful or failed, is recorded here.
 *   Think of it like a bank statement for your store.
 *
 * WHERE IT LIVES: backend/modules/payment/paymentTransaction.model.js
 *
 * HOW IT CONNECTS:
 *   PaymentService creates/updates documents in this collection.
 *   Admin panel can query it to see all payment events.
 */

import mongoose from 'mongoose';

const paymentTransactionSchema = new mongoose.Schema(
  {
    // The local order this payment is for
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },

    // The customer who made this payment
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Razorpay IDs ──────────────────────────────────────────────────────────
    // razorpay_order_id: created by Razorpay when you call orders.create()
    // razorpay_payment_id: assigned by Razorpay after the user pays
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true, // one Razorpay order per transaction record
      trim: true,
    },

    razorpayPaymentId: {
      type: String,
      trim: true,
      default: null,
      // Populated only after the user completes payment
    },

    razorpaySignature: {
      type: String,
      trim: true,
      default: null,
      // The HMAC-SHA256 signature we verify to confirm authenticity
    },

    // ── Money ─────────────────────────────────────────────────────────────────
    // IMPORTANT: Razorpay works in the SMALLEST currency unit (paise for INR).
    // ₹100.00 → store as 10000
    amountInPaise: {
      type: Number,
      required: true,
      min: 100, // Razorpay minimum is ₹1 = 100 paise
    },

    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['created', 'attempted', 'captured', 'failed', 'refunded'],
      default: 'created',
      // 'created'   → Razorpay order created, user hasn't paid yet
      // 'attempted' → User opened checkout, might have failed
      // 'captured'  → Payment confirmed and money received — this is the happy path!
      // 'failed'    → Payment failed or user cancelled
      // 'refunded'  → Money returned to customer
      index: true,
    },

    // ── Webhook Tracking ──────────────────────────────────────────────────────
    webhookEventId: {
      type: String,
      trim: true,
      default: null,
      // Razorpay sends an x-razorpay-event-id header; store it to detect duplicates
    },

    webhookProcessedAt: {
      type: Date,
      default: null,
    },

    // ── Raw Razorpay Response ─────────────────────────────────────────────────
    // Store the raw payment fetch response for debugging and audits
    razorpayPaymentDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Failure Info ──────────────────────────────────────────────────────────
    failureReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// Compound index: quickly find all transactions for an order
paymentTransactionSchema.index({ orderId: 1, status: 1 });
// Quickly find by Razorpay payment ID (used in webhook handler)
paymentTransactionSchema.index({ razorpayPaymentId: 1 });
// Idempotency check: don't process the same webhook event twice
paymentTransactionSchema.index({ webhookEventId: 1 }, { sparse: true });

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);
export default PaymentTransaction;
