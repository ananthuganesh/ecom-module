# Ecommerce Scale Harden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close ecommerce Critical/High scale and security gaps: soft stock reserve (30m TTL), Mongo indexes, paginated lists, Razorpay amount verify, rate limits, abandoned auth bind, AiSensy/DTDC secret locks, atomic coupon increments.

**Architecture:** Surgical changes on existing FastAPI + Beanie paths. `StockBalance.reserved` holds soft reservations; order `transactionDetails` tracks reserve/commit claims; asyncio sweeper releases stale holds; list endpoints gain `limit`/`page`; verify fetches Razorpay payment; in-process rate limiter middleware/deps.

**Tech Stack:** FastAPI, Beanie/PyMongo, Razorpay SDK, pytest

**Spec:** `docs/superpowers/specs/2026-07-26-ecommerce-scale-harden-design.md`

## Global Constraints

- Soft reserve at order create; commit on pay/COD; release on cancel/fail/30m TTL
- All qty/reserved mutations via Mongo `find_one_and_update` with guards
- Pagination default limit 50, max 200
- `contactApiUrl` and DTDC API key from env only
- No Redis/Celery; in-process rate limits OK
- JWT revocation and guest-phone OTP redesign out of scope
- Prefer TDD; do not commit unless user asks

---

### Task 1: Atomic stock helpers + reserved field

**Files:**
- Modify: `apps/api/app/documents/__init__.py` (`StockBalance.reserved`)
- Modify: `apps/api/app/services/stock.py`
- Test: `apps/api/tests/test_stock_reserve.py` (create if needed)

**Interfaces:**
- Produces: `async def reserve_stock(...)`, `async def commit_reserved_stock(...)`, `async def release_reserved_stock(...)`, update `apply_sale` / `apply_order_commitments` / `sync_product_stock` (sellable)

- [ ] **Step 1:** Write failing tests for reserve/commit/release guards and sellable sync
- [ ] **Step 2:** Run tests — expect fail
- [ ] **Step 3:** Implement `reserved` field + atomic helpers + movement types
- [ ] **Step 4:** Wire `apply_order_commitments` to commit-if-reserved else legacy atomic sale; coupon `$inc`
- [ ] **Step 5:** Run tests — pass

### Task 2: Order create reserve + release paths + TTL sweeper

**Files:**
- Modify: `apps/api/app/routers/orders.py` (create)
- Modify: `apps/api/app/routers/payments.py` / `admin.py` cancel/fail paths as applicable
- Create or modify: `apps/api/app/services/stock_reserve_sweeper.py` + lifespan in `main.py`
- Test: extend `test_stock_reserve.py` or order tests

- [ ] **Step 1:** Failing test — create reserves; cancel/TTL releases
- [ ] **Step 2:** Implement reserve on create; release helpers; 60s sweeper for 30m TTL
- [ ] **Step 3:** Tests pass

### Task 3: Mongo indexes

**Files:**
- Modify: `apps/api/app/documents/__init__.py` Settings.indexes for Order, Product, User, AbandonedCheckout, PaymentTransaction

- [ ] **Step 1:** Add indexes per spec
- [ ] **Step 2:** Confirm app still boots / Beanie init accepts indexes

### Task 4: Paginate hot list endpoints

**Files:**
- Modify: `apps/api/app/routers/orders.py`, `users.py`, `products.py`, `admin.py`, `erp.py` (find_all hot paths)
- Modify: matching admin web callers if response shape changes to `{ items, total, page, limit }`
- Test: `apps/api/tests/test_pagination.py`

- [ ] **Step 1:** Failing test for limit cap + total
- [ ] **Step 2:** Shared helper `parse_pagination(query)` + apply
- [ ] **Step 3:** Update web admin services that break
- [ ] **Step 4:** Tests pass

### Task 5: Payment verify amount/status check

**Files:**
- Modify: `apps/api/app/routers/payments.py`
- Test: `apps/api/tests/test_payment_verify.py` (mock Razorpay fetch)

- [ ] **Step 1:** Failing tests — wrong amount / non-captured rejected
- [ ] **Step 2:** Implement fetch + asserts on verify (+ webhook when amount present)
- [ ] **Step 3:** Tests pass

### Task 6: Rate limit + abandoned bind + secret locks

**Files:**
- Create: `apps/api/app/services/rate_limit.py`
- Modify: `apps/api/app/routers/users.py` (OTP/login), `abandoned.py`, `payments.py` webhook
- Modify: `apps/api/app/services/aisensy.py`, `dtdc.py`, `admin.py` DTDC save
- Test: `apps/api/tests/test_api_harden.py`

- [ ] **Step 1:** Failing tests for 429, abandoned spoof, contactApiUrl strip
- [ ] **Step 2:** Implement limiter + binds + env-only secrets
- [ ] **Step 3:** Tests pass

### Task 7: Verification pass

- [ ] Run targeted pytest suite for new/changed tests
- [ ] Smoke: API import / key routes if easy
- [ ] Update readiness canvas notes optional — skip unless asked
