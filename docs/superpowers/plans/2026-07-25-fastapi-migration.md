# FastAPI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Replace Express backend with FastAPI while keeping Next.js path parity and fixing auth/payment security.

**Architecture:** Strangler — `backend_fastapi/` beside `backend/`; Beanie/Motor on same MongoDB; cutover via `INTERNAL_BACKEND_URL`.

**Tech Stack:** FastAPI, Uvicorn, Beanie, Motor, PyJWT, passlib, pytest, Razorpay, httpx

## Global Constraints

- Path prefixes unchanged for Next rewrites
- JWT claim `id`, 30-day expiry, Bearer header
- No auth bypass
- No Stripe port
- Shiprocket only after paid/COD
- Spec: `docs/superpowers/specs/2026-07-25-fastapi-migration-design.md`

---

### Task 1: Scaffold + health + auth foundation

- [ ] Create `backend_fastapi/` package layout and requirements
- [ ] Implement config, db, security, deps
- [ ] Health endpoint + pytest for health/auth
- [ ] Commit

### Task 2: Catalog + admin catalog

- [ ] Products/categories/brands/collections/coupons public + admin
- [ ] Uploads
- [ ] Tests for public list + admin gate
- [ ] Commit

### Task 3: Orders + payments + shipping

- [ ] Orders with ownership
- [ ] Razorpay create/verify/webhook
- [ ] Shiprocket deferred
- [ ] Tests for ownership + verify binding
- [ ] Commit

### Task 4: Cutover

- [ ] Root scripts / docker / env point to FastAPI :8000
- [ ] Full pytest suite green
- [ ] Commit
