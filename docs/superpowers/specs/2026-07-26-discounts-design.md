# Discounts (ex-Coupons) — design

**Date:** 2026-07-26

## Goal

Rename Coupon Management → **Discounts** with Shopify-style types:

1. **Amount off products** — % or ₹ off selected products/collections  
2. **Buy X get Y** — buy N, get M at a % off (100% = free)  
3. **Amount off order** — % or ₹ off cart total (existing behaviour)

## Data

`Coupon` document gains: `kind`, `productIds`, `collectionIds`, `buyQuantity`, `getQuantity`, `getDiscountPercent`, `buyProductIds`, `getProductIds`. Legacy rows default to `kind=order`.

## Apply path

Shared `app/services/discounts.py` used by:

- `POST /api/coupons/validate` (accepts cart `items`)  
- Standard checkout order create  
- Magic Checkout promotions  

## Admin

`/admin/discounts` — type picker → form. `/admin/coupons` redirects here.
