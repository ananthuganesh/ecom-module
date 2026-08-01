# AiSensy Project API Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire AiSensy Contacts, Campaign send, and Catalog sync to Project API with env credentials and a manual Sync catalog button.

**Architecture:** Thin `aisensy_project.py` client; `aisensy.py` keeps event wiring and delegates when Project credentials exist; admin route + Settings UI for catalog sync.

**Tech Stack:** FastAPI, httpx/aiohttp (match existing), Next.js admin settings, Beanie Product/User docs.

## Global Constraints

- Secrets only in env: `AISENSY_PROJECT_ID`, `AISENSY_PROJECT_API_KEY` (plus legacy `AISENSY_API_KEY` fallback).
- One catalog product per variant.
- Manual catalog sync only.
- Do not persist API keys in Mongo settings.

---

### Task 1: Project API client + config

**Files:**
- Modify: `apps/api/app/config.py`
- Create: `apps/api/app/services/aisensy_project.py`
- Modify: `apps/api/.env.example`, `.env.example`

- [ ] Add `aisensy_project_id: str = ""`
- [ ] Implement client: auth header, `create_contact`, `send_campaign`, `get_or_create_catalog`, `create_product`, `sync_catalog`
- [ ] Unit-testable helpers for retailer_id / phone formatting

### Task 2: Migrate aisensy orchestration

**Files:**
- Modify: `apps/api/app/services/aisensy.py`

- [ ] Prefer Project API for `send_campaign` and `create_contact` when project id + key set
- [ ] Fall back to legacy campaign URL when only `AISENSY_API_KEY`
- [ ] Add `sync_catalog()` that upserts variants and records last sync prefs
- [ ] Expose `projectConfigured` / `catalogId` / last catalog sync in `public_settings`

### Task 3: Admin API + UI

**Files:**
- Modify: `apps/api/app/routers/admin.py`
- Modify: `apps/web/api/services/admin/...` (aisensy service)
- Modify: `apps/web/app/admin/settings/integrations/aisensy/page.js`

- [ ] `POST /admin/aisensy/sync-catalog`
- [ ] Frontend Sync catalog button + status
- [ ] Sync customers requires Project API (already checks project key; also require project id)

### Task 4: Verify

- [ ] Smoke-test settings GET shape
- [ ] Lint touched files
