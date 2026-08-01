# Razorpay Magic Checkout Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Support Standard + Magic Razorpay checkout with a settings toggle; Magic uses draft orders, line_items, public promotions/shipping APIs, and COD via Magic.

**Architecture:** Draft Urban Aana order → Razorpay Magic order → public callbacks → enrich + fulfill. Standard path unchanged.

**Tech Stack:** FastAPI, Beanie/Mongo, Next.js checkout, Razorpay Checkout.js

## Global Constraints

- Public Magic URLs must require no auth.
- Never return API secrets to the storefront except `keyId`.
- Receipt max 40 chars; use local Mongo order id string.
- Amounts to Razorpay are in paise.

---

### Task 1: Shipping helper + COD fee + Magic router

- [ ] Add `codFee` to default shipping settings
- [ ] `app/services/magic_checkout.py` — resolve order by receipt/rzp id; promotions list/apply; shipping methods from profiles
- [ ] `app/routers/magic.py` — three POST endpoints
- [ ] Register router in `main.py`

### Task 2: Payments — Magic create-order, config, webhooks, enrich

- [ ] `_get_razorpay_creds` reads DB settings then env
- [ ] `GET /api/payments/config` → `{ checkoutMode }`
- [ ] Create-order: if Magic mode / magic paymentMethod, send `line_items` + `line_items_total`
- [ ] Shared `complete_magic_order(order, rz_order_payload, …)` enrich address/fees/promo
- [ ] Webhook: `order.paid`, `order.placed`, `payment.pending`, keep `payment.captured`
- [ ] Verify path calls enrich for Magic drafts

### Task 3: Orders — Magic draft create

- [ ] `create_order` accepts `razorpay_magic`: status draft, no orderNumber, shipping 0, no coupon apply, payment pending

### Task 4: Admin Razorpay UI + disconnect

- [ ] Persist `checkoutMode`; show Magic URLs; disconnect endpoint
- [ ] Shipping settings UI for `codFee`

### Task 5: Storefront checkout branch

- [ ] Fetch checkout config; Magic UI = summary + Pay
- [ ] Fix create-order response shape (`razorpayOrder.id`, `keyId`)
- [ ] `one_click_checkout: true` + prefill contact

### Task 6: Smoke checks

- [ ] Import/compile routes; manual checklist for Dashboard URL paste
