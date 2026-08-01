# Razorpay Refunds (Admin Manual) Design

**Date:** 2026-07-26  
**Status:** Approved — manual full/partial refund; update payment records only

## Behaviour

- Admin order detail → **Refund** when `razorpayPaymentId` exists and payment is `paid` or `partially_refunded`
- Modal: amount (default remaining) + optional reason
- API: `POST /api/payments/refund` `{ localOrderId, amount?, reason? }`
- Calls Razorpay `POST /v1/payments/:id/refund` (normal speed)
- Updates `order.paymentStatus`, `transactionDetails.refunds[]`, `refundedAmount`, and `PaymentTransaction.status`

## Out of scope (v1)

- Auto refund on cancel/return approve
- Instant refunds
- ERP credit notes
- Payouts API
- COD cash refunds
