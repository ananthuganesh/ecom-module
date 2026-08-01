# Remaining Audit Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close remaining Urban Aana audit gaps: real analytics, media library, payment/notification settings backends, RBAC, retire legacy Inventory API, atomic order numbers.

**Architecture:** Parallel vertical slices with non-overlapping file ownership. Spec: `docs/superpowers/specs/2026-07-26-remaining-audit-gaps-design.md`.

**Tech Stack:** FastAPI + Beanie/MongoDB, Next.js admin UI, existing Setting documents.

## Global Constraints

- Do NOT commit or push unless the user explicitly asks.
- Match existing code style; no drive-by refactors.
- No fake/hardcoded KPIs or media files in UI after wiring.
- `isAdmin` users always retain full access.
- StockBalance + Purchase remain inventory source of truth.

---

### Task 1: Atomic order numbers + analytics API/UI

**Files:** `apps/api/app/routers/orders.py`, `apps/web/app/admin/analytics/page.js`, optionally `apps/web/api/services/admin/orderService.js`

- [ ] Replace `_next_order_number` with atomic `$inc` (`find_one_and_update`, upsert, ReturnDocument.AFTER).
- [ ] Extend `GET /api/orders/stats` with `range`, trends, series, topProducts, channels per spec.
- [ ] Wire analytics page to API; remove hardcoded data.
- [ ] Verify: `python3 -m compileall apps/api/app`.

### Task 2: Media library API + UI

**Files:** new `apps/api/app/routers/media.py`, `apps/api/app/main.py`, `apps/web/app/admin/content/library/page.js`, new `apps/web/api/services/admin/mediaService.js` (+ export from admin index)

- [ ] List/delete under uploads; upload via existing image endpoint.
- [ ] Wire library UI (list, upload, view, delete).
- [ ] compileall.

### Task 3: Payment + notification settings + redirects + inventory retire

**Files:** `apps/api/app/routers/admin.py` (settings endpoints; remove inventory CRUD), checkout/order create paths that check payment method, `apps/api/app/services/aisensy.py`, payments/notifications pages, staff/user-roles redirect pages, web inventory service exports/modals cleanup

- [ ] `payment_methods` + `notification_prefs` Setting GET/PUT.
- [ ] Enforce payment toggles on storefront create-order.
- [ ] Gate AiSensy notify on prefs.
- [ ] Wire Payments + Notifications UI save/load.
- [ ] Redirect orphan staff/user-roles pages.
- [ ] Remove `/admin/inventory*` routes; stop exporting inventory client surface.

### Task 4: RBAC

**Files:** `apps/api/app/deps.py`, `apps/api/app/services/erp_ops.py` (default role permissions), apply `require_permission` on stock_admin write + erp sensitive writes + media delete if present

- [ ] Implement `require_permission` + broaden `require_admin` per spec.
- [ ] Seed/update default role permission lists.
- [ ] Apply to stock adjust/transfer and key ERP mutations.
- [ ] compileall.

---

## Execution

Dispatch Tasks 1–4 in parallel (non-overlapping ownership). Integrate + fix review findings after.
