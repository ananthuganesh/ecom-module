# Shopify-style product detail edit page

**Date:** 2026-07-31  
**Status:** Implemented  
**Decision:** Approach A — rebuild `/admin/products/[id]` as the sole product edit surface; create = draft then redirect.

## Goal

Make the admin product individual page the **only** place to edit products, with a Shopify-like layout (main column + right rail), using **existing Product fields only**, and an **explicit Save** control.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Edit surface | Detail page only |
| Create | Create draft → open detail |
| Field scope | Existing fields only (no tags/metafields/package/multi-location UI) |
| Save UX | Explicit Save when dirty; Discard resets |
| Implementation | Full rebuild (Approach A), not modal wrapper |

## Non-goals

- Rich text editor (description stays plain textarea)
- Metafields, tags, collections membership UI, theme templates
- Shipping package / weight / country of origin models
- Multi-warehouse inventory grid (Unavailable / Committed / On hand per location)
- Sales past 90 days analytics card
- Showing `productUrlId` / Product ID in the UI (URL only)
- Autosave

## Layout

Match order-detail admin chrome (sticky header, gray bg, white `admin-surface` cards), but use Shopify product **2-column** grid:

```text
grid grid-cols-1 items-start gap-3 p-3 pb-6
lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]
```

### Header

- Product title (live from form) + status badge
- Subtitle: created datetime only (no Product ID)
- Actions: **Discard** (dirty only), **Save** (dirty only), Barcode print, View store, ↑↓ neighbors
- Unsaved changes: `beforeunload`; confirm when leaving via in-app navigation where practical

### Main column

1. **Title** — `productName`
2. **Description** — plain textarea `description`
3. **Media** — upload + crop (reuse `ImageCropModal` / `adminProductService.uploadImage`); attach to primary variant / thumbnails as ProductModal does today. Prefer drag-drop + file picker; “Select existing” only if a lightweight media-library picker can be reused without new backend work — otherwise skip for this pass
4. **Category** — parent `category` + child `type` (inline create optional, same as modal)
5. **Price** — `pricing.sellingPrice`, `pricing.mrp` (compare-at), `pricing.buyingPrice` (cost), `pricing.offerPrice`; `taxClassId` + `priceTaxMode`
6. **Inventory / variants** — rows for each variant: size/custom option, quantity, SKU, barcode; add/remove variant; `totalStock` derived from quantities
7. **Tax codes** — `hsnCode` (card may be labeled Shipping/Tax; no weight/package fields)
8. **Search engine listing** — preview using slug + meta; fields `slug`, `metaTitle`, `metaDescription`

### Right rail

- **Status** — `draft` | `active` | `out_of_stock`
- **Product organization** — `brand`, product class `product` (Hijabs / Accessories / …) if kept; avoid duplicating category/type if already in main Category card
- **Publishing** — View on storefront link only (no channel multi-select)

## Create flow

1. Products list **Add product** calls create API with a minimal draft:
   - `productName`: `"Untitled product"` (or equivalent)
   - `status`: `draft`
   - Other required defaults matching current create validation (pricing zeros / one empty variant as needed)
2. Response includes `productUrlId` (ensure assigned on create)
3. Redirect to `/admin/products/{productUrlId}`
4. User edits and Saves

## List cleanup

- Row click → `adminProductHref(product)` detail only
- Remove “Edit” actions that open `ProductModal`
- After create no longer uses the modal, **remove `ProductModal`** (or leave unused file deleted in same change)
- Bulk edit / import flows unchanged unless they depended on modal edit

## Save / Discard

- Local form state loaded from `GET /admin/products/{id}`
- Dirty = deep compare (or change flag) vs last successful load/save snapshot
- **Save** → `PUT /admin/products/{id}` with the same normalized payload shape ProductModal used (`_normalize_product_payload` compatible)
- On success: toast, replace snapshot, clear dirty
- **Discard**: reset form to snapshot

## API

- Prefer existing `GET` / `PUT` / `POST` product endpoints
- Optional: dedicated `POST /admin/products/draft` if create validation is too strict for empty drafts — only if needed
- Neighbors endpoint already exists; keep for ↑↓

## Validation (client)

Mirror ProductModal rules where practical:

- Selling price required before setting Active (or allow Active with 0 and warn — match current modal)
- HSN digits max 8
- Slug uniqueness handled server-side; surface API errors on Save
- SKU auto-generate empty variants on Save if current modal does

## Out of scope follow-ups

- TipTap/Lexical description
- Warehouse stock table on product page
- Collections / tags / metafields
- Package dimensions for DTDC from product

## Success criteria

- Editing a product is only possible on `/admin/products/[id]`
- Add product lands on that page as a draft
- Save persists all listed existing fields
- UI feels like Shopify product admin (2-col cards), not a sidesheet wizard
- Product ID not shown in UI
