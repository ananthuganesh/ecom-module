# Customer URL ID Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Add 12-digit public `customerUrlId` for storefront customers (random start, then sequential), with migration and Shopify-style order filters.

**Architecture:** Mirror `orderUrlId`: field on `User`, counter in `settings` (`seq_customer_url_id`), assign on create + backfill script. Orders keep Mongo `customerId`; filters resolve `customerUrlId` → ObjectId.

**Tech Stack:** FastAPI, Beanie/MongoDB, Next.js admin

## Global Constraints

- Only `isAdmin: false` customers get IDs
- Mongo `_id` remains internal; do not rewrite `orders.customerId`
- 12-digit zero-padded string; random start in `[100000000000, 899999999999]` on first migration
- Spec: `docs/superpowers/specs/2026-07-30-customer-url-id-design.md`

---

### Task 1: Model + next-id helper

**Files:**
- Modify: `apps/api/app/documents/__init__.py` (User)
- Create: `apps/api/app/services/customer_url_id.py`

- [ ] Add `customerUrlId: Optional[str] = None` + unique sparse index
- [ ] Implement `async def next_customer_url_id() -> str` (counter `seq_customer_url_id`, same pattern as `_next_order_url_id`)
- [ ] Implement `async def ensure_customer_url_id(user: User) -> str` for create paths

### Task 2: Serializer + create paths

**Files:**
- Modify: `apps/api/app/serializers.py` (`user_public`)
- Modify: `apps/api/app/routers/admin.py` (`admin_create_customer`)
- Modify: `apps/api/app/routers/users.py` (register + checkout find-or-create)
- Modify: import/placeholder paths if they create non-admin users

- [ ] Expose `customerUrlId` in `user_public`
- [ ] Assign on create when not admin

### Task 3: Orders filter by customerUrlId

**Files:**
- Modify: `apps/api/app/routers/admin.py` (`admin_orders` q parsing)

- [ ] Resolve `customer_id:"12digits"` via `User.customerUrlId`
- [ ] Keep ObjectId `customer_id:"24hex"` compatibility

### Task 4: Migration script

**Files:**
- Create: `apps/api/scripts/assign_customer_url_ids.py`

- [ ] Backfill non-admin users missing `customerUrlId`
- [ ] Random or `CUSTOMER_URL_ID_START` start; update counter

### Task 5: Admin UI links

**Files:**
- Modify: `apps/web/app/admin/orders/[id]/page.js`

- [ ] Prefer `customer.customerUrlId` in `/admin/orders?q=customer_id:"…"` links

### Task 6: Verify

- [ ] Run migration script (or note command for user)
- [ ] Smoke: create customer / filter orders
