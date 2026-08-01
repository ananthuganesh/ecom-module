# Order UTM attribution + activity timeline — design

**Date:** 2026-07-26  
**Approved:** Approach 1 — client capture + snapshot on order create; first-touch + last-touch; 30-day first-touch window; admin attribution + extended timeline (option B).

## Goal

Persist marketing attribution on each storefront order and show it in admin order detail, with a short activity timeline (attribution + order milestones).

## Decisions

| Topic | Choice |
|-------|--------|
| Attribution model | First-touch **and** last-touch |
| First-touch TTL | 30 days in `localStorage` |
| Capture | Client reads URL params; send on `POST /api/orders` |
| Timeline | Computed in admin UI from attribution + existing order fields (no activity collection) |
| Admin list filters | Out of scope for v1 |

## Architecture

1. Storefront helper captures UTM/click ids from the URL on non-admin page loads.
2. Persists `firstTouch` / `lastTouch` in `localStorage` (same pattern as `abandoned_guest_id`).
3. Checkout includes `attribution` on order create (COD, Razorpay, Magic).
4. API stores a sanitized snapshot on `Order.attribution` at create time; never updates later.
5. Admin order detail shows Attribution + an expanded Order Timeline.

## Captured params

From the landing URL when any are present:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `gclid`, `fbclid` (click ids)

Also store `landedAt` (ISO) and `landingPath` (pathname + search without secrets).

### Touch rules

- **Last-touch:** overwrite whenever a new UTM/click-id set appears on a visit.
- **First-touch:** write only if missing, or if existing first-touch `landedAt` is older than 30 days.
- Visits with no UTM/click ids do not clear existing touches.

## Data shape

```js
attribution: {
  firstTouch: {
    source, medium, campaign, content, term,
    gclid, fbclid,
    landedAt,   // ISO string
    landingPath
  } | null,
  lastTouch: { /* same */ } | null,
}
```

Empty strings omitted. Missing attribution on order → treat as direct / none.

### Order model

`Order.attribution: Optional[dict] = None` (Beanie/Mongo). Admin-created orders leave it unset.

## API

- `POST /api/orders` accepts optional `attribution`.
- Sanitize: string fields only, trim, max length (e.g. 200), drop unknown keys.
- Payment verify / webhooks unchanged — attribution is fixed at create.
- Admin `GET` order already returns the document; no new endpoint.

## Storefront wiring

| Piece | Behavior |
|-------|----------|
| `lib/attribution.js` (or extend tracking helper) | Capture + get snapshot |
| Root layout / small client component | Run capture on pathname change (skip `/admin`) |
| `checkout/page.js` | Attach `attribution: getAttributionSnapshot()` on every `orderService.create` |

## Admin UI (`/admin/orders/[id]`)

Right column, above existing **Order Timeline**:

### Attribution

- Compact rows: Source, Medium, Campaign; Content/Term if set.
- Show **First touch** and **Last touch** when both exist and differ; one block if identical.
- Show `gclid` / `fbclid` only when present.
- If no attribution: “Direct / none”.

### Timeline (extend existing)

Computed steps (skip missing):

1. First visit — firstTouch  
2. Last touch — lastTouch (omit if same as first)  
3. Order created — `createdAt`  
4. Payment — from `paymentStatus` / `transactionDetails` (paid / COD / pending)  
5. Shipped — when AWB or shipping/order status indicates shipped  
6. Delivered — `isDelivered` / `deliveredAt` / status delivered  

Keep existing “Expected fulfillment” when `deliveryDate` is set. Reuse current timeline visual style.

## Out of scope

- UTM filters/columns on orders list  
- Attribution on abandoned checkouts  
- Editing or re-attributing orders in admin  
- Server-side cookie middleware  
- Separate activity/audit log collection  
- Pushing UTMs into GTM `dataLayer` (optional later; GTM can still read URL itself)

## Success criteria

1. Visit with `?utm_source=ig&utm_medium=cpc&utm_campaign=summer` → place order → admin shows those values under attribution.  
2. Later visit with different UTMs within 30 days → order shows original first-touch and new last-touch.  
3. Timeline shows attribution steps plus payment/ship/deliver when those fields exist.  
4. Direct traffic / admin-created orders show “Direct / none” without errors.
