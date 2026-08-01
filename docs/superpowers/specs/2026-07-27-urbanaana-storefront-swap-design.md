# Design: Urban Aana Storefront Swap into Urban Aana

**Date:** 2026-07-27  
**Status:** Approved (approach + design); awaiting spec review before implementation plan  
**Source UI:** `/Users/ananthuganesh/Documents/urban-code/urban-aana-frontend`  
**Target:** `apps/web` (Urban Aana Next.js)

## Goal

Replace the current customer-facing storefront with the Urban Aana frontend design and UX, while keeping Urban Aana admin and Urban Aana FastAPI backend.

## Decision

**Approach 1 — Port Urban UI into `apps/web`, keep Urban Aana APIs.**

Rejected:

- Separate Urban Next app (two deploys / auth cookie complexity)
- Replacing all of `apps/web` with Urban (would remove `/admin`)

## Scope

### In scope (storefront)

- Home (`/`) and Urban layout chrome (navbar, footer, ticker, theme/fonts)
- Product listing / detail (`/product/[id]`, shop/category equivalents)
- Cart, checkout
- Login / account (map Urban `/account` ↔ Urban Aana `/profile` with redirects as needed)
- About / return-policy and other Urban marketing pages present in source
- Public assets, motion, and Urban visual language (streetwear aesthetic)
- Wire all data to existing Urban Aana `@/api` services + Zustand stores

### Out of scope

- `/admin/**` redesign or behavior changes
- GST per-piece slab (tracked separately)
- Backend schema / API contract changes beyond adapters needed for UI fields
- Rewriting admin components or ERP flows

## Architecture

```
Browser
  └── apps/web (Next.js)
        ├── /admin/**          (unchanged Urban Aana admin)
        ├── storefront pages   (Urban UI, ported)
        └── @/api + stores     (Urban Aana FastAPI client)
              └── apps/api (FastAPI + Mongo)
```

- Single deployable web image (Docker compose `web` service unchanged in role).
- GTM remains storefront-only (already skips `/admin`).

## Route mapping

| Urban Aana | Urban Aana after swap | Notes |
|------------|-------------------|--------|
| `/` | `/` | Replace home with Urban sections |
| `/product/[id]` | `/product/[id]` | Keep; restyle + Urban components |
| `/cart` | `/cart` | Urban cart UI → Urban Aana cart store |
| `/checkout` | `/checkout` | Urban UI → Urban Aana payment/order APIs |
| `/login` | `/login` | Urban auth UI → Urban Aana auth |
| `/account` | `/profile` (+ redirect `/account` → `/profile`) | Prefer keeping `/profile` URLs |
| Urban-only pages | Add under `app/` | e.g. return-policy, coming-soon if needed |
| Urban Aana `/shop`, `/category/[slug]`, `/wishlist`, `/collections` | Keep routes; restyle to Urban or redirect into Urban listing patterns | Prefer restyle to avoid dead links |

## Implementation strategy

1. **Foundation** — Copy Urban fonts/CSS tokens/public assets; update root storefront layout chrome without touching `app/admin/layout.js`.
2. **Home** — Replace `app/page.js` with Urban home composition; ProductGrid → Urban Aana `productService`.
3. **Product** — Port Urban product page; variants/colors via Urban Aana product shape.
4. **Cart / checkout** — Port UI; keep Urban Aana cart Zustand + order/payment services (Razorpay Magic Checkout as already integrated).
5. **Auth / account** — Port Urban login/account visuals; keep Urban Aana auth tokens/session.
6. **Cleanup** — Remove obsolete storefront-only components (old Header/Hero/FAQ-only home stack) that nothing references; do not delete admin-shared utilities.

### Tech notes

- Prefer JSX in `apps/web` for consistency with existing admin; convert Urban `.tsx` → `.jsx` on import unless a small TS island is justified.
- Add Urban dependencies only when used (e.g. `@react-three/fiber` only if Hero/3D is shipped).
- Image URLs continue through Urban Aana resolvers / R2 public URLs.
- Preserve `NEXT_PUBLIC_GTM_*` behavior on storefront only.

## Success criteria

- Visual storefront matches Urban Aana frontend for home, product, cart, checkout, login/account.
- `/admin` unchanged and reachable.
- Products, cart, checkout, and login work against Urban Aana API locally and in Docker.
- No hydration / script console regressions introduced by layout chrome.
- Dead storefront routes either work in Urban style or redirect cleanly.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Urban API field names ≠ Urban Aana | Thin adapters in components; map in one place |
| Large PR | Ship in phases (foundation → home → product → cart/checkout → auth) |
| Asset/font paths | Copy into `apps/web/public` and verify Next font loading |
| Checkout payment edge cases | Reuse existing Urban Aana checkout verify / Razorpay paths; UI-only swap first |

## Non-goals clarification

“Same design” means **UI/UX and visual system** from Urban Aana, not their backend or admin.
