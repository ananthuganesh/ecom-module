# 12-digit public customer ID (`customerUrlId`)

**Date:** 2026-07-30  
**Status:** Implemented (migration run locally)  
**Decision:** Option A — public customer number mirroring `orderUrlId`; Mongo `_id` remains the internal key.

## Goal

Give every storefront customer a stable **12-digit** public ID for admin URLs, search/filters (Shopify-style `customer_id:"…"`), and display — without replacing MongoDB ObjectIds on orders or auth.

## Non-goals

- Changing `/admin/customers/[mongoId]` routes in this pass (can follow later).
- Assigning IDs to admin users (`isAdmin: true`).
- Rewriting historical `orders.customerId` ObjectId references.

## Model

Add on `User`:

| Field | Type | Notes |
|-------|------|--------|
| `customerUrlId` | `Optional[str]` | Exactly 12 digit characters, zero-padded |

Index: unique sparse on `customerUrlId`.

Internal relationships stay:

- `Order.customerId` → `User._id` (ObjectId)
- Auth / sessions continue to use Mongo `_id`

## Sequence

- Settings key: `seq_customer_url_id` with value `{ "seq": <int> }`
- Same pattern as `seq_order_url_id` / `_next_order_url_id()`
- Helper: `_next_customer_url_id() -> str` returning `f"{n:012d}"`

### Start value

- On **first** migration (when counter does not exist), pick a **random** integer in  
  `[100000000000, 899999999999]` inclusive.
- Assign that value to the first customer (sorted by `createdAt`, then `_id`), then increment by 1 for each subsequent customer.
- Persist the **last assigned** value into `seq_customer_url_id` so the next create gets `last + 1`.
- If the counter already exists (re-run / new signups), do **not** re-randomize; only continue the series.
- Optional env override for scripts: `CUSTOMER_URL_ID_START` (forces start instead of random) for reproducible deploys/tests.

## Migration

Script: `apps/api/scripts/assign_customer_url_ids.py` (mirror `assign_order_url_ids.py`).

1. Load Mongo from `.env`.
2. Query `users` where `isAdmin` is not true, sorted by `createdAt` asc, `_id` asc.
3. Resolve start: `CUSTOMER_URL_ID_START` or random in range (or continue from existing counter if already set and backfill only missing).
4. For each customer missing `customerUrlId`, set next 12-digit id.
5. Update `seq_customer_url_id` to last used value.
6. Print summary (count assigned, first, last).

Idempotent: skip users that already have a 12-digit `customerUrlId`.

## Assignment on create

Call `_next_customer_url_id()` when creating storefront customers if `customerUrlId` is empty:

- `admin_create_customer`
- Storefront `register`
- Checkout / guest email find-or-create customer path
- Import / placeholder customer creation paths that create non-admin users

Do **not** assign for `isAdmin: true` users.

## API / serializers

- Include `customerUrlId` in `user_public()` / nested `order.customerId` enrichment.
- Orders list search `q`:
  - `customer_id:"482917305612"` (or unquoted 12 digits after `customer_id:`) resolves via `User.customerUrlId` → Mongo `_id`, then `query["customerId"] = ObjectId(...)`.
  - Keep accepting a 24-char hex ObjectId for backward compatibility.

## Admin UI

- Order detail Customer card: name and “X orders” link to  
  `/admin/orders?q=customer_id:"{customerUrlId}"`  
  when `customerUrlId` is present; fall back to Mongo `_id` filter only if url id missing (pre-migration).
- Prefer showing/using the 12-digit id in that filter once migration has run.

## Testing

- Unit/integration: create customer → gets 12-digit id; counter increments.
- Search: `q=customer_id:"{urlId}"` returns only that customer’s orders.
- Migration script dry logic: existing ids preserved; new users continue series.
- Admins never receive `customerUrlId`.

## Rollout

1. Ship model + helper + create paths + API filter + UI link.
2. Run migration script on each environment.
3. Verify a known customer’s “X orders” link uses the 12-digit id.

## Open follow-ups (later)

- Customer admin detail URLs by `customerUrlId`.
- Display `customerUrlId` on customers list column.
