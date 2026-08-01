# Cloudflare R2 Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or execute tasks directly.

**Goal:** Route product, AI, and Media Library storage through Cloudflare R2 when configured.

**Architecture:** `app.services.r2` boto3 wrapper; upload/media/AI callers use it with local disk fallback.

**Tech Stack:** FastAPI, boto3, existing R2 env vars, Next.js image config

## Global Constraints

- Do not commit secrets or `.env`
- Do not log access keys
- Keep Media Library response shape unchanged
- No commit/push unless user asks

---

### Task 1: R2 service + dependency

- [ ] Add `boto3` to `apps/api/requirements.txt`
- [ ] Create `apps/api/app/services/r2.py` with is_configured / upload / list / delete

### Task 2: Wire upload + AI + media routes

- [ ] `admin.py` upload/image + AI temp saves use r2
- [ ] `media.py` list/delete use r2 when configured

### Task 3: Next.js image host

- [ ] Allow R2 public URL hostname in `apps/web/next.config.mjs` remotePatterns

### Task 4: Verify

- [ ] compileall; smoke list without R2 still works (fallback)
