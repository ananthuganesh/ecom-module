# AiSensy Project API — full stack design

**Date:** 2026-07-30  
**Approved choices:** Full stack (C), env-only secrets (A), manual catalog sync (A), one catalog item per variant (B)

## Goal

Move Contacts, Campaign sends, and Catalog/products onto AiSensy Project API (`ProjectAPI.json`), while keeping existing event triggers (abandoned / order placed / paid / shipped / delivered).

## Architecture

- New client module `apps/api/app/services/aisensy_project.py` for Project API HTTP.
- Existing `aisensy.py` keeps event orchestration; delegates contact create, campaign send, and catalog sync to the Project client when configured.
- Admin Settings → AiSensy: keep campaign maps; add **Sync catalog** (manual) next to Sync customers.

## Env (secrets)

| Variable | Use |
|----------|-----|
| `AISENSY_PROJECT_ID` | Path `{project_id}` |
| `AISENSY_PROJECT_API_KEY` | Header `X-AiSensy-Project-API-Pwd` |
| `AISENSY_API_KEY` | Legacy campaign API fallback only |
| `PUBLIC_WEB_URL` / siteUrl | Product page URLs in catalog |

## Flows

### Contacts
- `POST /project/{id}/contact` with name + mobile_number.
- Sync customers uses Project API only when project id + password are set.

### Campaign send
- Prefer `POST /project/{id}/campaign/api/send` with campaign_name, phone_number, name, template_params, tags, attributes.
- If Project API not configured, fall back to legacy `backend.aisensy.com/campaign/t1/api/v2`.

### Catalog / products
- Manual admin action:
  1. Ensure a commerce catalog (get or create); store `catalogId` in AiSensy settings prefs.
  2. For each **active** product → each **variant**, `create-product` with `retailer_id` = SKU or `{productId}-{color}-{size}`.
  3. Call `sync-catalog` / `sync-catalog-products` as available.
- No auto-sync on product save (v1).

## Out of scope (v1)
- Meta catalog connect/disconnect UI
- Template CRUD in admin
- Webhook inbox
- Scheduled catalog sync
