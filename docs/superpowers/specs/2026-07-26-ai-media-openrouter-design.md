# AI Media Generator (product photo studio) — design

**Date:** 2026-07-26  
**Approved:** Approach 1 — server-side OpenRouter via `httpx`; product photo studio (reference + product angles); history + optional attach to product; OpenRouter API key in Admin Settings.

## Goal

Replace the mock AI Media page with a real **product photo studio**: upload a style/scene reference image plus product-angle shots, generate with OpenRouter `google/gemini-3-pro-image`, save outputs, and optionally attach them to a product gallery.

## Decisions

| Topic | Choice |
|-------|--------|
| Primary job | Product photo studio (not prompt-only-only) |
| Persist | Always save to AI history; optional “Add to product” |
| API key | Admin Settings → Integrations → OpenRouter |
| OpenRouter client | Server `httpx` (no browser key; no required SDK) |
| Default model | `google/gemini-3-pro-image` |

## Architecture

1. **Settings** — Mongo `Setting` key `openrouter`: `{ apiKey, model, enabled }`. Admin GET never returns the raw key (`hasApiKey`, `isConnected`).
2. **Generate** — Admin-only `POST /api/admin/ai-media/generate`.
3. **OpenRouter** — Multimodal chat message: text + `image_url` parts (reference first, then product angles), matching the OpenRouter chat shape.
4. **Persist** — Write generated binary to `uploads/ai/{uuid}.{ext}`; URL `/uploads/ai/...` (served like existing `/uploads`).
5. **History** — `AiMediaJob` documents in Mongo.
6. **Attach** — Admin endpoint appends output URL onto a product’s images/thumbnails.

Fake credits UI is removed. Billing is on the OpenRouter account.

## OpenRouter request shape

```js
{
  model: "google/gemini-3-pro-image", // or settings.model
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "<prompt>" },
      { type: "image_url", image_url: { url: "<reference absolute or data URL>" } },
      // then 0..N product angle images
      { type: "image_url", image_url: { url: "<product angle>" } },
    ]
  }]
}
```

Prompt guidance (default helper in UI): first image is style/scene reference; following images are the product from different angles.

Server must parse the model response for an image (base64 data URL and/or hosted URL — implement against actual response fields; fail clearly if no image returned).

## Data model

### Setting `openrouter`

```js
{
  apiKey: string,          // stored secret
  model: string,           // default "google/gemini-3-pro-image"
  enabled: boolean
}
```

### `AiMediaJob` (Beanie)

| Field | Notes |
|-------|--------|
| `prompt` | string |
| `referenceUrl` | string (input) |
| `productImageUrls` | list[str] |
| `outputUrl` | string \| null |
| `status` | `pending` \| `succeeded` \| `failed` |
| `error` | string \| null |
| `model` | string used |
| `productId` | optional ObjectId if attached |
| `createdBy` | admin user id |
| `createdAt` / `updatedAt` | datetime |

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET/PUT | `/api/admin/openrouter/settings` | Integration settings |
| POST | `/api/admin/openrouter/disconnect` | Clear key / disable |
| POST | `/api/admin/ai-media/generate` | Multipart or JSON: prompt + reference (+ product images); creates job, calls OpenRouter, saves file |
| GET | `/api/admin/ai-media/jobs` | List history (newest first) |
| GET | `/api/admin/ai-media/jobs/{id}` | One job |
| DELETE | `/api/admin/ai-media/jobs/{id}` | Delete job (+ optional file delete) |
| POST | `/api/admin/ai-media/jobs/{id}/attach-product` | Body `{ productId, variantColor? }` — append `outputUrl` to product images |

Auth: admin only (existing `AdminUser` dependency).

Input images: accept multipart uploads and/or existing `/uploads/...` URLs. When calling OpenRouter, convert local paths to absolute public URLs **or** data URLs so the provider can fetch/read them.

## Admin UI

### `/admin/content/ai-studio`

- Prompt textarea + helper copy  
- Reference upload (required, 1)  
- Product angle uploads (up to 4)  
- Generate → loading → result preview  
- Actions: Download, Add to product (picker)  
- History list from API (thumb, prompt, date, status)  

### `/admin/settings/integrations/openrouter`

- API key, enable toggle, model field (prefilled)  
- Connected / has key indicators  
- Nav entry under Settings integrations  

If OpenRouter not configured, AI Media shows a clear CTA to settings.

## Out of scope (v1)

- Fake generative credits  
- Aspect ratio / quality dropdowns (model defaults)  
- Rewriting Content Library into a full DAM  
- Prompt-only generation without a reference image  
- Batch / queue workers (sync request in v1; timeout handled with clear error)  
- Client-side OpenRouter calls  

## Success criteria

1. Admin saves OpenRouter key → AI Media can generate.  
2. Reference + optional product angles + prompt → image saved under `/uploads/ai/` and listed in history.  
3. “Add to product” appends the output URL to the chosen product.  
4. Without a key / when disabled → clear error, no crash.  
5. No API key exposed to the browser.
