# Urban Aana Storefront Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Urban Aana customer storefront UI with Urban Aana frontend design while keeping `/admin` and Urban Aana FastAPI APIs.

**Architecture:** Port Urban components/pages into `apps/web` as JSX; wire to existing `@/api` + Zustand stores; leave `app/admin/**` untouched.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Framer Motion, Urban Aana `productService` / cart / auth stores, Urban Open Sans + Vina Sans.

**Spec:** `docs/superpowers/specs/2026-07-27-urbanaana-storefront-swap-design.md`

## Global Constraints

- Do not modify `apps/web/app/admin/**` layouts or admin feature behavior.
- Prefer JSX over TSX when porting.
- GTM stays storefront-only (`GtmClient` skips `/admin`).
- Data must come from Urban Aana APIs, not Urban’s old backend URL.
- Commit after each completed task phase.

## File map

| Area | Create / Modify |
|------|-----------------|
| Assets | Copy Urban `public/*` brand images into `apps/web/public/urban/` |
| Theme | Modify `apps/web/app/globals.css`, `apps/web/app/layout.js` (fonts + chrome) |
| Storefront chrome | Create `apps/web/components/storefront/Navbar.jsx`, `Footer.jsx`, `TickerBar.jsx`, … |
| Home | Replace `apps/web/app/page.js` |
| Product | Replace/restyle `apps/web/app/product/[id]/page.js` |
| Cart/Checkout | Restyle `apps/web/app/cart`, `apps/web/app/checkout` |
| Auth | Restyle `apps/web/app/login`, add `/account` → `/profile` redirect |
| Adapter | Create `apps/web/utils/urbanProductAdapter.js` |

---

### Task 1: Foundation — assets, fonts, storefront chrome shell

**Files:**
- Create: `apps/web/components/storefront/` (Navbar, Footer, TickerBar initially)
- Modify: `apps/web/app/layout.js`, `apps/web/app/globals.css`
- Copy: Urban public brand assets → `apps/web/public/urban/`

- [ ] **Step 1:** Copy needed Urban public images into `apps/web/public/urban/`
- [ ] **Step 2:** Add Open_Sans + Vina_Sans to root layout; keep Inter only if admin needs it — admin has own layout; storefront root can switch to Urban fonts with admin layout overriding if required
- [ ] **Step 3:** Merge Urban CSS variables / `.font-vina` into `globals.css` without breaking admin CSS imports
- [ ] **Step 4:** Port Navbar + Footer + TickerBar to JSX under `components/storefront/`, using Next `Link` and Urban Aana cart count from `useCartStore`
- [ ] **Step 5:** Update root layout body to render storefront Navbar/Footer for non-admin routes only (client wrapper `StorefrontChrome` that returns null on `/admin`)
- [ ] **Step 6:** Verify `/admin` still loads; `/` shows new chrome
- [ ] **Step 7:** Commit `feat: add Urban storefront chrome foundation`

---

### Task 2: Home page — Urban sections + Urban Aana products

**Files:**
- Create: `components/storefront/HeroBanner.jsx`, `ProductGrid.jsx`, `ProductCard.jsx`, `InstagramReels.jsx`, `Testimonials.jsx`, `AboutSection.jsx`
- Create: `utils/urbanProductAdapter.js`
- Modify: `app/page.js`

- [ ] **Step 1:** Port home section components from Urban (JSX)
- [ ] **Step 2:** Adapter maps Urban Aana product → Urban card props (`id`, `name`, `price`, `image`, `href`)
- [ ] **Step 3:** `ProductGrid` fetches via `productService.getProducts()`
- [ ] **Step 4:** Replace `app/page.js` with Urban home composition (no old Header/Hero)
- [ ] **Step 5:** Manual check home loads products
- [ ] **Step 6:** Commit `feat: Urban Aana home page on Urban Aana storefront`

---

### Task 3: Product detail

**Files:**
- Modify: `app/product/[id]/page.js`
- Optionally restyle `app/products/[slug]/page.js` or redirect to `/product/[id]`

- [ ] **Step 1:** Port Urban product page layout/interactions
- [ ] **Step 2:** Keep Urban Aana variant/color/stock/add-to-cart via `useCartStore`
- [ ] **Step 3:** Deduped colors (already fixed) preserved
- [ ] **Step 4:** Commit `feat: Urban product detail on Urban Aana`

---

### Task 4: Cart + checkout UI

**Files:**
- Modify: `app/cart/page.js`, `app/checkout/page.js`, `components/storefront/CartDrawer.jsx`

- [ ] **Step 1:** Port Urban cart drawer + cart page visuals
- [ ] **Step 2:** Keep Urban Aana checkout payment (Razorpay) logic
- [ ] **Step 3:** Smoke-test add-to-cart → checkout page render
- [ ] **Step 4:** Commit `feat: Urban cart and checkout UI`

---

### Task 5: Auth + account mapping

**Files:**
- Modify: `app/login/page.js`
- Create: `app/account/page.js` → redirect to `/profile`
- Restyle profile shell lightly to match Urban if quick

- [ ] **Step 1:** Port Urban login/AuthModal visuals to Urban Aana auth
- [ ] **Step 2:** Add `/account` redirect
- [ ] **Step 3:** Commit `feat: Urban auth UI and account redirect`

---

### Task 6: Shop/category restyle + cleanup

**Files:**
- Modify: `app/shop/page.js`, `app/category/[slug]/page.js`
- Delete unused storefront-only: old `Hero.jsx` / home-only pieces if unreferenced

- [ ] **Step 1:** Restyle listing pages with Urban ProductGrid/Card
- [ ] **Step 2:** Remove dead imports
- [ ] **Step 3:** Commit `feat: Urban listing pages and storefront cleanup`

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Home + chrome | 1–2 |
| Product | 3 |
| Cart/checkout | 4 |
| Login/account | 5 |
| Shop/category keep | 6 |
| Admin untouched | 1 constraint |
| Urban Aana APIs | 2–5 adapters |

## Execution

Preferred: inline execution in this session starting Task 1 immediately (user said “Do”).
