# Shopify-style Checkout Design

**Date:** 2026-07-28  
**Status:** Approved (user: do)

## Goal
Rebuild storefront checkout to match Shopify-style single-page layout while keeping Urban Aana payment/coupon/auth behavior.

## Decisions
- Approach: rebuild `/checkout/page.js` in place
- Dedicated chrome: hide Navbar/Footer on `/checkout*`
- Single page: Contact → Delivery → Shipping → Payment → Pay
- Keep: COD + Razorpay, coupons, magic checkout, OTP verify, abandoned tracking, pincode lookup

## UI
- Left: form sections; Right: sticky order summary
- Logo header linking home; privacy link footer
- Shipping: Standard — free over ₹150 else ₹15
