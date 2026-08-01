# Media storage via Cloudflare R2 — design

**Date:** 2026-07-26  
**Status:** Approved (approach 1 — server-side S3/R2 uploads)  
**Scope:** Product uploads, AI Studio files, Media Library list/delete

## Goals

Store all admin media in the configured Cloudflare R2 bucket using the existing `R2_*` env vars. Return public URLs from `R2_PUBLIC_URL`. Fall back to local `uploads/` only when R2 is not configured (local/dev).

## Non-goals

- Presigned browser-direct uploads
- One-off migration of existing local files into R2
- Changing product image schema beyond URL strings

## Config (already present)

- `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_PUBLIC_URL`
- R2 considered configured when bucket, access key, secret, and endpoint are all non-empty

## Object keys

| Prefix | Use |
|--------|-----|
| `products/{uuid}{ext}` | `POST /admin/upload/image`, Media Library product files |
| `ai/{uuid}{ext}` | AI Studio reference/output files |

## Service

`apps/api/app/services/r2.py` using `boto3` S3 client (`region_name="auto"`, `endpoint_url=R2_ENDPOINT`):

- `is_configured() -> bool`
- `upload_bytes(folder, data, filename, content_type) -> { key, url, name, size, type }`
- `list_folder(folder | "all") -> list[dict]` matching Media Library shape
- `delete_object(folder, name)`

Public URL: `{R2_PUBLIC_URL.rstrip("/")}/{key}`

## Wire-up

1. `POST /admin/upload/image` → R2 `products/` (else local)
2. AI Studio save helpers → R2 `ai/` (else local)
3. `GET/DELETE /api/admin/media` → R2 list/delete (else local)
4. Next.js `images.remotePatterns` — allow R2 public host when `R2_PUBLIC_URL` / env is set

## Security

- Never commit real R2 secrets; keep `.env` local / secret manager
- Delete/list only under `products/` and `ai/` prefixes; reject `..` / path escape
