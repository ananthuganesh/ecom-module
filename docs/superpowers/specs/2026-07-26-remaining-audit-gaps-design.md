# Remaining audit gaps — design

**Date:** 2026-07-26  
**Status:** Approved (user: Done / approach B)  
**Scope:** Analytics, Media Library, Settings backends, RBAC, retire legacy Inventory, atomic order numbers

## Goals

Close the leftover audit gaps so admin surfaces use real data/backends (no fake KPIs or no-op uploads), settings stubs persist and are enforced, roles are checked, StockBalance is the only inventory system, and order numbers cannot collide under concurrency.

## Non-goals

- Full email SMTP provider (notification prefs gate existing AiSensy/WhatsApp/email paths only)
- Rebuilding orphan staff CRUD UIs (redirect to Users/Roles)
- R2/cloud media migration (filesystem uploads under `apps/api/uploads`)

## Design

### 1. Analytics

- Extend `GET /api/orders/stats` with query `range` ∈ `7d|30d|90d|365d` (default `30d`).
- Response: `totalOrders`, `totalRevenue`, `totalCustomers`, `avgOrderValue`, real `trends` (period-over-period %), `series` (daily `{ date, revenue, orders }`), `topProducts` (from line items), `channels` (from `attribution.lastTouch.source`, fallback `"direct"`).
- Exclude `status=draft` from revenue/order KPIs unless noted.
- Wire `apps/web/app/admin/analytics/page.js` to this API; remove hardcoded cards/lists/charts.

### 2. Media Library

- New router `GET/DELETE /api/admin/media` (+ optional list query `folder=products|ai`).
- List files under `UPLOAD_DIR` / `uploads/ai`; return `{ id, name, url, size, type, modifiedAt }`.
- Upload: existing `POST /admin/upload/image`.
- Delete: unlink file; 404 if missing.
- Wire Media Library UI: fetch, upload, view (open url), delete.

### 3. Settings backends (full — option B)

| Setting | Storage | Enforcement |
|---------|---------|-------------|
| Payment methods | `Setting.key=payment_methods` → `{ cod: bool, razorpay: bool }` | Storefront/admin create-order reject disabled methods |
| Notification prefs | `Setting.key=notification_prefs` → toggles for customer order email/WhatsApp, admin new-order alert | `aisensy.notify_*` and any email hooks skip when off |

- Admin GET/PUT endpoints for both keys (AdminUser).
- Payments + Notifications settings pages load/save.
- Staff admins/managers/permissions + user-roles pages: **redirect** to `/admin/settings/users` or `/admin/settings/roles`.

### 4. RBAC

- `require_permission(*perms)` in `deps.py`: allow if `user.isAdmin`, or Role has `"*"`, or any requested permission (support `resource.*` wildcards).
- Keep `AdminUser` = admin access gate: `isAdmin` OR role with `"*"` OR `"admin.access"`.
- Apply `require_permission` on ERP write, stock adjust/transfer, settings mutation, media delete as sensible defaults.
- Ensure default roles from `erp_ops.ensure_default_roles` include a coherent permission set.

### 5. Dual inventory

- Remove FastAPI `/admin/inventory*` CRUD.
- Remove/stop exporting `adminInventoryService`, `InventoryModal` usage.
- Document: Purchase + StockBalance are source of truth. `Inventory` document may remain unread for legacy Mongo data (no new writes).

### 6. Order number race

- Replace read-modify-write in `_next_order_number` with atomic `$inc` via `find_one_and_update` on `Setting` key `seq_order_number`, upsert=True, return AFTER.
- Keep company profile prefix/suffix formatting.

## Testing

- compileall on API; smoke-check new endpoints shapes.
- Manual: analytics range switch; media upload/list/delete; toggle COD off → checkout rejects; role without permission → 403 on stock adjust.
