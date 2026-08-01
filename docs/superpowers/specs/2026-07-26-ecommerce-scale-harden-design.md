# Ecommerce scale harden — design

**Date:** 2026-07-26  
**Status:** Approved (user: Do all / scope A / soft reserve B / TTL 30m / approach 1)  
**Scope:** Soft stock reserve, Mongo indexes, list pagination, payment verify amount check, rate limits, abandoned auth bind, AiSensy/DTDC secret locks, atomic coupon `$inc`

## Goals

Make checkout safe under concurrent load and admin lists safe under data growth: no oversell, no full-collection loads on hot paths, payment amount reconciled with Razorpay, basic API abuse controls, and secrets not admin-writable into Mongo/SSRF sinks.

## Non-goals

- JWT secret rotation / token revocation
- Guest phone OTP redesign / phone uniqueness migration cleanup beyond sparse unique index when safe
- Redis / Celery / multi-instance distributed rate limits
- Separate `StockReservation` collection (deferred)
- Changing storefront UI beyond what pagination APIs require

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | All five audit priorities |
| Stock | Soft reserve at order create; commit on pay/COD; release on cancel/fail/TTL |
| TTL | 30 minutes from `reservedAt` |
| Implementation style | Surgical harden on existing Beanie/Mongo paths |
| Rate limit | In-process sliding window (single API instance) |

## Design

### 1. Soft stock reserve

**Model**

- `StockBalance.reserved: int = 0` (default 0 for existing docs)
- Sellable = `quantity - reserved` (never negative)
- `sync_product_stock` exposes sellable as `totalStock` / variant `quantity`

**Atomic ops** (Mongo `find_one_and_update` only — no Python read-modify-write for qty/reserved)

| Op | Guard | Update |
|----|-------|--------|
| Reserve | `quantity - reserved >= qty` | `$inc: { reserved: qty }` |
| Commit (sale) | `reserved >= qty` and `quantity >= qty` | `$inc: { quantity: -qty, reserved: -qty }` |
| Release | `reserved >= qty` | `$inc: { reserved: -qty }` |

**Order flags** (`transactionDetails`)

- `stockReserved`, `reservedAt` (UTC) set on successful reserve at create
- Existing `stockApplied` claim remains for verify+webhook idempotency
- Commit path: if already reserved → commit; if not reserved (legacy) → atomic sale from sellable/quantity
- Coupon: `$inc usedCount` under `couponApplied` claim

**Lifecycle**

1. Order create: reserve each line against default warehouse; fail whole create if any line insufficient
2. Pay / COD / `apply_order_commitments`: convert reserve → sale
3. Cancel / payment fail / abandon: release if reserved and not applied
4. Sweeper: every ~60s (asyncio task from lifespan) release unpaid non-COD orders with `stockReserved` and `reservedAt` older than 30m

**Movements:** log `reserve`, `reserve_release`, `sale` in `StockMovement`.

### 2. Indexes

| Collection | Indexes |
|------------|---------|
| Order | `customerId`; `(status, createdAt)`; `razorpayOrderId` (sparse) |
| Product | `slug` (sparse unique if feasible, else non-unique) |
| User | `phone` sparse unique |
| AbandonedCheckout | `(userId, status)`; `(guestId, status)`; `lastActivityAt` |
| PaymentTransaction | `razorpayOrderId` sparse unique; `(orderId, status)` |
| StockBalance | keep existing unique compound; no change required beyond `reserved` field |

Beanie `Settings.indexes` — created on app init.

### 3. Pagination

- Query params: `page` (1-based) or `skip`, plus `limit` default **50**, max **200**
- Apply to: admin/user order lists, admin users, admin products (full dump), abandoned list, ERP list endpoints that currently `find_all()` without limit
- Response shape: `{ items, total, page, limit }` where callers can adopt; keep backward-compatible array responses only if web already expects arrays — prefer `{ items, total }` and update admin callers that break
- Small sets (warehouses, tax classes, roles) stay unpaginated
- ERP dashboard aggregates must not load all docs into memory — use Mongo aggregations/`count_documents` where touched

### 4. Payment verify harden

After HMAC signature succeeds on `POST /payments/verify`:

1. `razorpay.Client.payment.fetch(rz_payment_id)`
2. Require status in `captured` (and accept `authorized` only if product already treats that as paid — match current capture mode)
3. Assert `int(payment.amount) == int(txn.amountInPaise)`
4. Assert payment’s order id matches `rz_order_id` when present
5. Then mark txn/order paid and run commitments

Webhook path: when amount present on payload, same amount check vs `PaymentTransaction`.

### 5. API harden

**Rate limit** (in-process): OTP request, login, abandoned upsert, payment webhook — e.g. 10/min per IP for auth OTP/login, 30/min abandoned, 120/min webhook. Return 429.

**Abandoned upsert:** if authenticated, force `userId = current user id` and ignore body `userId`; guests may only set `guestId` (no foreign `userId`).

**AiSensy:** `contactApiUrl` from env / code default only — strip from admin save body.

**DTDC:** API key and auth secrets from env only — Mongo settings may keep non-secret prefs (service type, customer codes display); never persist `api_key` from admin body when env present; prefer env always for key.

### 6. Testing

- Unit/integration tests for reserve/commit/release atomic guards (incl. concurrent insufficient)
- Verify rejects wrong amount / wrong status
- Abandoned upsert rejects spoofed `userId` when authed as another user
- Pagination returns `total` + capped `limit`

## Out of scope reminders

JWT hygiene, guest phone OTP bind redesign — track separately if needed.
