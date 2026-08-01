# FastAPI Migration Design — Urban Aana Ecommerce

**Date:** 2026-07-25  
**Status:** Approved for implementation  
**Frontend:** Next.js (unchanged paths)  
**Backend:** Express → FastAPI (strangler), MongoDB retained

## Goals

- Replace Express with FastAPI while keeping `/api/*` and `/uploads/*` path parity for Next.js rewrites.
- Fix security defects during migration (no auth bypass, order ownership, payment binding, CORS allowlist, Shiprocket after payment).
- Deliver pytest coverage for auth, catalog, orders, and payments.

## Non-goals

- Rewriting Next.js storefront UI.
- Migrating MongoDB to Postgres.
- Porting unused Stripe checkout (Razorpay-only in FastAPI).

## Architecture

- New package: `backend_fastapi/` runs beside legacy `backend/` until cutover.
- Stack: FastAPI, Uvicorn, Motor + Beanie, Pydantic v2, PyJWT, passlib/bcrypt, httpx, pytest + pytest-asyncio.
- Auth: Bearer JWT `{ id }`, 30-day TTL, same `JWT_SECRET`.
- Cutover: set `INTERNAL_BACKEND_URL` to FastAPI port (8000 default); remove Express when Phase 7 complete.

## Phases

0. Scaffold, health, CORS, JWT deps, pytest  
1. Users/auth/OTP (strict protect + adminOnly)  
2. Public catalog + coupons/collections  
3. Uploads + admin catalog/inventory/coupons  
4. Orders with ownership; Shiprocket deferred until paid/COD  
5. Razorpay create/verify/webhook (raw body)  
6. Shipping, wallet, abandoned checkout, settings  
7. Point Next to FastAPI; decommission Express entry in root scripts

## Security rules (all phases)

1. No JWT fallback / auto-admin.  
2. Admin routes require `isAdmin`.  
3. Order get/pay/track: owner or admin.  
4. Payment verify: user owns order; txn binds to order.  
5. CORS from `ALLOWED_ORIGINS` only in production.  
6. Shiprocket after `paymentStatus=paid` or COD.
