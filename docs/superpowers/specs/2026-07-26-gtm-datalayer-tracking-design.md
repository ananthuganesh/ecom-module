# GTM + DataLayer ecommerce tracking — design

**Date:** 2026-07-26  
**Updated:** 2026-07-26 — GTM container moved to server env  
**Approved:** Approach A — GTM container only in Urban Aana; Meta Pixel configured inside GTM.

## Goal

Scalable, debuggable tracking for the custom Next.js storefront (no hardcoded Meta Pixel, no DOM/CSS triggers).

## Architecture

1. API env: `GTM_ID` (e.g. `GTM-XXXXXXX`) and `GTM_ENABLED` (default true). Admin UI is read-only status.
2. Storefront loads config from `GET /api/gtm/config` and injects GTM when enabled (skip `/admin`).
3. Shared client helper pushes GA4-style ecommerce events to `window.dataLayer`.
4. Meta / GA4 / other tags are configured only in the GTM UI (Facebook community template, etc.).

## DataLayer schema

```js
dataLayer.push({ ecommerce: null }); // clear previous
dataLayer.push({
  event: "view_item" | "add_to_cart" | "begin_checkout" | "purchase",
  ecommerce: {
    currency: "INR",
    value: number,
    transaction_id?: string, // purchase only
    items: [{
      item_id: string,
      item_name: string,
      price: number,
      quantity: number,
      item_category?: string,
      item_brand?: string,
    }],
  },
});
```

## Event map

| Event | Fire when |
|-------|-----------|
| `view_item` | Product detail page load |
| `add_to_cart` | Cart add succeeds |
| `begin_checkout` | Checkout page load (with cart items) |
| `purchase` | Checkout success (order id + value + items) |

## Out of scope

- Hardcoded `fbq` / Pixel ID in Urban Aana
- Server-side Conversions API (later)
- Configuring GTM tags/triggers inside Meta (operator task)
