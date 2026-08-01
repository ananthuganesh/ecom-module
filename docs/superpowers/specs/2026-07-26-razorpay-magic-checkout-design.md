# Razorpay Magic Checkout Design

**Date:** 2026-07-26  
**Status:** Approved (user: mode B + Magic UX A + COD via Magic + shipping from Settings)

## Decisions

- Keep **Standard** and **Magic** checkout modes; toggle in Razorpay settings.
- When Magic is on: `/checkout` is summary + Pay only (no address/shipping/coupon/COD UI).
- COD is offered inside Magic via shipping-info (`cod: true`).
- Shipping fees come from admin **Shipping and delivery** profiles/zones; COD fee from shipping settings.
- Order model: **draft local order first**, then Razorpay Magic order with `line_items`.

## Flow (Magic)

1. Customer Pay → `POST /api/orders` with `paymentMethod: razorpay_magic` → draft (`status: draft`, no order number yet, stock reserved, line-item total only).
2. `POST /api/payments/create-order` creates Razorpay order with `line_items`, `line_items_total`, `receipt = localOrderId`.
3. Client opens Checkout.js with `one_click_checkout: true`, `show_coupons: true`.
4. Razorpay calls public Magic APIs (promotions + shipping-info).
5. Success:
   - Prepaid: client verify and/or webhooks `payment.captured` / `order.paid`
   - COD: webhooks `order.placed` / `payment.pending`
6. Server fetches Razorpay order, writes address/fees/promo onto draft, assigns order number, marks placed/paid, Shiprocket.

## Public APIs (no auth)

| Path | Role |
|------|------|
| `POST /api/magic/promotions` | List applicable coupons |
| `POST /api/magic/promotions/apply` | Validate code → discount paise |
| `POST /api/magic/shipping-info` | Per-address methods from shipping settings |

## Settings

- `checkoutMode`: `standard` | `magic`
- Show copyable Magic callback URLs
- `codFee` (INR) on shipping settings
- Prefer DB Razorpay keys with env fallback; add disconnect route if missing

## Out of scope (v1)

- Draft auto-expiry / stock release job
- Magic analytics (`mx-analytics`) beyond optional stub
- Gift fee inside Magic
