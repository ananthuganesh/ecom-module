# AI Media OpenRouter Product Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Real admin product photo studio via OpenRouter `google/gemini-3-pro-image`, with history and optional attach-to-product.

**Architecture:** Admin stores OpenRouter key in `Setting`. Generate endpoint builds multimodal chat (reference + product angles), calls OpenRouter chat completions with `modalities: ["image","text"]`, saves base64 output under `uploads/ai/`, records `AiMediaJob`.

**Tech Stack:** FastAPI, Beanie, httpx, Next.js admin.

## Global Constraints

- Model default: `google/gemini-3-pro-image`
- API key only in Admin Settings (never browser)
- Reference image required; up to 4 product angles
- Always save history; optional attach to product
- No fake credits; no Content Library rewrite

## File map

| File | Role |
|------|------|
| `apps/api/app/services/openrouter.py` | Settings helpers + generate call + parse image |
| `apps/api/tests/test_openrouter.py` | Pure parse/save helpers |
| `apps/api/app/documents/__init__.py` | `AiMediaJob` + ALL_DOCUMENTS |
| `apps/api/app/routers/admin.py` | openrouter settings + ai-media routes |
| `apps/api/app/main.py` | ensure uploads/ai mount if needed |
| Web services/endpoints + settings page + ai-media page | UI |

---

### Task 1: OpenRouter service + AiMediaJob + admin API

- [ ] Add `AiMediaJob` document; register in `ALL_DOCUMENTS`
- [ ] Implement `apps/api/app/services/openrouter.py`: get settings, `extract_image_from_response`, `save_ai_image`, `generate_product_image` (httpx POST `https://openrouter.ai/api/v1/chat/completions`)
- [ ] Unit tests for extract + save
- [ ] Admin routes: openrouter settings GET/PUT/disconnect; ai-media generate/list/get/delete/attach-product
- [ ] Commit

### Task 2: Web client + Settings OpenRouter page

- [ ] Endpoints + `adminOpenrouterService` + `adminAiMediaService`
- [ ] Settings page + SETTINGS_NAV entry
- [ ] Commit

### Task 3: Replace AI Media studio UI

- [ ] Real generate form (reference + angles + prompt)
- [ ] History from API; attach-to-product picker
- [ ] Commit

### Task 4: Smoke verify

- [ ] pytest openrouter tests
- [ ] Manual: settings page loads; generate without key returns clear error
