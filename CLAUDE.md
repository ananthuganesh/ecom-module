# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Urban Aana — an Indian D2C streetwear store. Monorepo: Next.js storefront + admin panel (`apps/web`), FastAPI backend (`apps/api`), MongoDB Atlas. Payments via Razorpay, shipping via DTDC/Shipsy, WhatsApp via AiSensy, media on Cloudflare R2, transactional email via Resend.

## Commands

Run from the repo root:

```bash
npm run install:all     # npm install in apps/web + create apps/api/.venv from requirements.txt
npm run dev             # api (uvicorn :8000, reload) + web (next :3000) concurrently
npm run dev:api         # api only
npm run dev:web         # web only
npm run test            # api pytest + web node:test
npm run test:api
npm run test:web
npm run docker:up       # docker compose up -d --build
```

API tests (from `apps/api`, venv is `.venv`):

```bash
.venv/bin/pytest -q
.venv/bin/pytest tests/test_stock.py -q                              # one file
.venv/bin/pytest tests/test_stock.py::test_sellable_never_negative   # one test
```

Web: `npm run lint --prefix apps/web`, `npm run build --prefix apps/web`. Web tests are plain `node --test` over `lib/*.test.mjs` — there is no React test runner, so testable logic belongs in `apps/web/lib/`.

CI (`.github/workflows/ci.yml`) runs exactly these two suites on Python 3.12 / Node 20.

## Environment

There is **one `.env` at the repo root** — no per-app env files. `apps/api/app/config.py` walks up to find it (repo root locally, `/app/.env` in Docker), and `docker-compose.yml` passes the same file to both services. Copy from `.env.example`. `Settings.assert_production_secrets()` fails startup in production without a 32+ char `JWT_SECRET` and a `RAZORPAY_WEBHOOK_SECRET`.

## Architecture

### Request path

Browser → Next.js (`:3000`) → rewrite `/api/*` and `/uploads/*` → `INTERNAL_BACKEND_URL` (`:8000`). The browser axios client always uses the relative `/api` base so the proxy handles it; only server-side rendering hits the backend host directly. This means CORS matters mostly for direct API calls, and cookies are same-origin from the browser's point of view.

### API (`apps/api`)

`app/main.py:create_app()` mounts every router and is what tests instantiate with `create_app(with_lifespan=False)`. The lifespan starts four long-running background loops that only exist in the real process: abandoned-cart WhatsApp recovery (`services/aisensy`), stock reservation sweeper, DTDC status sync, and the monthly report mailer.

Layering is `routers/` (HTTP + permissions) → `services/` (all business logic and third-party integrations) → `documents/` (Beanie models). `app/documents/__init__.py` is a single file holding all 26 Document models plus `ALL_DOCUMENTS`, which `db.init_db()` feeds to `init_beanie`. Add a new model there **and** to `ALL_DOCUMENTS`, or its indexes never get built.

`db.py` deliberately reconciles indexes before `init_beanie`: Atlas often already has a same-named index with different `unique`/`sparse` flags, so conflicting indexes are dropped first, with a retry on `IndexKeySpecsConflict` (code 86). Keep that behaviour in mind when changing `Settings.indexes`.

Documents use camelCase fields (`orderNumber`, `createdAt`, `finalPrice`) to match pre-existing Atlas data, and `extra="ignore"` with `_as_optional_str`/float coercion validators because legacy docs mix ObjectIds and strings in the same field. Responses go through `app/serializers.py` (`doc_to_dict`, `user_public`, …) rather than Pydantic response models.

### Auth and permissions

Two independent HttpOnly cookie sessions, never interchangeable: `ua_session` (customer `User`) and `ua_admin_session` (staff `AdminAccount`). Bearer tokens are still accepted for tests/API clients. `app/deps.py` exposes the annotated dependencies to use — `CurrentUser`, `OptionalUser`, `AdminUser`, `RoleManager`, `OrdersWriter`, `CustomersReader`, etc. Never hand-roll a token check in a router.

Staff permissions are strings on a `Role` (`orders.write`, `customers.read`, resource wildcards like `orders.*`, or global `*`). `require_permission()` gates on `admin.access` first — fine-grained permissions alone must not open admin APIs. Staff live in the `admins` collection; the `isAdmin`/`roleId` fields on `User` are legacy migration leftovers.

Router prefixes are all `/api/...`; admin surfaces are `/api/admin` (`admin.py`, `stock_admin.py`), `/api/admin/erp`, `/api/admin/media`.

### Orders, stock, and payments

`Order.status` is a lowercase string (`order placed`, `processing`, `delivered`, `cancelled`, `abandoned`, …) and is distinct from `Order.shippingStatus`, whose canonical values live in `services/fulfillment.py` (`STORE_SHIPPING_STATUSES`) and only move forward via `_SHIPPING_STATUS_RANK`. DTDC track codes map in through `DTDC_TRACK_STATUS_MAP`.

Inventory is a ledger, not a counter: `StockBalance` (per product × warehouse × variant SKU) plus `StockMovement` rows, with `sellable = quantity − reserved − unavailable`. Order flow reserves on placement (`reserve_order_stock`), commits on payment (`apply_order_commitments`), and releases on cancel/abandon (`release_order_stock`); the sweeper loop frees stale reservations. Always go through `services/stock.py` — do not mutate `StockBalance` directly.

Razorpay webhooks at `/api/payments/webhook` are HMAC-verified against `RAZORPAY_WEBHOOK_SECRET`; `PaymentTransaction` records them for idempotency.

Orders and customers each carry a 12-digit public id (`orderUrlId`, `customerUrlId`) separate from both the Mongo `_id` and the display `orderNumber` (`UA1000`). Admin URLs use the public id; `services/order_resolve.resolve_order()` accepts any of the three forms.

Product variants vary per product (size only, color only, custom axes) — use `services/variants.py` (`find_variant`, `product_variant_axes`, `variant_sku`) instead of assuming size+color.

### Media

Uploads go to Cloudflare R2 when configured (`services/r2.py`, folders `products` / `ai` / `reels`) and fall back to the local `apps/api/uploads` volume mounted at `/uploads`. Images are optimized through `services/image_optimize.py`. AI Studio (`services/ai_media.py`, `openrouter.py`) generates product photos via OpenRouter, tracked as `AiMediaJob` rows and publishable into the content library as `MediaAsset`.

### Web (`apps/web`)

Next.js App Router, JavaScript (no TypeScript), Tailwind v4, shadcn-style components under `components/ui`, Zustand stores in `store/`, `@/*` path alias.

All backend access goes through the `api/` layer — `api/axios/client.js` (shared axios instance, `withCredentials`, global 401 handling that clears only the matching session) → `api/endpoints/{user,admin}.js` → `api/services/{user,admin}/*.js`, re-exported from `api/services/index.js` and `api/index.js`. Add a new backend call as a service function there, not as an inline fetch in a component.

Server-rendered storefront catalog data uses `lib/fetchProducts.js` with `INTERNAL_BACKEND_URL` and Next cache tags (`store-catalog`), tuned by `STORE_*` env vars via `lib/catalogConfig.js`; `lib/bustStorefrontCatalogCache.js` invalidates after admin edits.

`next.config.mjs` carries the security headers and CSP (Razorpay, GTM, Meta Pixel, Cloudflare are explicitly allowlisted — a new third-party script needs a CSP edit) and a long list of legacy `/admin/*` redirects; prefer adding a redirect there over keeping a stub page. `middleware.js` 308-redirects `www` → apex because only the apex domain is Razorpay-approved for live checkout. `output: 'standalone'` and the memory caps in `docker-compose.yml` target a 2 vCPU / 4 GB host — build images elsewhere, since `next build` can OOM on the live box.

## Testing notes

`apps/api/tests/conftest.py` sets test env vars **before** importing `app.config` and clears the `get_settings` cache; the `db` fixture swaps in `mongomock_motor.AsyncMongoMockClient` via `init_db(client=...)`. `pytest.ini` sets `asyncio_mode = auto`, so async tests need no decorator — use `@pytest.mark.usefixtures("db")` for anything touching Mongo, and `httpx.ASGITransport` over `create_app(with_lifespan=False)` for endpoint tests.
