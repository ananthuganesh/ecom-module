# Shopify-style Product Detail Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/products/[id]` the sole product edit surface (Shopify-like 2-column form + Save), and make Add product create a draft then redirect there.

**Architecture:** Extract shared form helpers from `ProductModal` into `apps/web/utils/productForm.js`. Rebuild the detail page as a controlled form with dirty/Save/Discard. List page creates a minimal draft via existing `POST /admin/products` and navigates to the new URL. Delete `ProductModal` once unused.

**Tech Stack:** Next.js (App Router), existing admin CSS (`admin-surface`), FastAPI product CRUD, ImageCropModal, sonner toasts

**Spec:** `docs/superpowers/specs/2026-07-31-shopify-product-detail-edit-design.md`

## Global Constraints

- Detail page is the **only** way to edit existing products
- Create = draft then redirect to detail
- Existing Product fields only (no tags/metafields/package/multi-location)
- Explicit Save when dirty; Discard resets to last snapshot
- Do **not** show `productUrlId` / Product ID in UI
- Description stays plain textarea (no rich text)
- Prefer reuse of ProductModal payload rules and image crop upload
- Do not commit unless the user asks (skip plan commit steps unless requested)

## File map

| File | Role |
|------|------|
| `apps/web/utils/productForm.js` | Shared defaults, slugify, SKU/ID generators, `productToForm`, `buildProductPayload`, `isProductFormDirty` |
| `apps/web/app/admin/products/[id]/page.js` | Full editable Shopify-style page |
| `apps/web/app/admin/products/page.js` | Add product → createDraft → redirect; remove ProductModal |
| `apps/web/api/services/admin/productService.js` | Optional `createDraft()` helper wrapping `create` |
| `apps/web/components/admin/ProductModal.jsx` | Delete after list no longer imports it |

---

### Task 1: Shared product form helpers

**Files:**
- Create: `apps/web/utils/productForm.js`
- Test: manual Node assert or small unit test if project has utils tests; otherwise verify by importing from a throwaway node check

**Interfaces:**
- Produces:
  - `STATUSES = ["draft", "active", "out_of_stock"]`
  - `PRODUCT_CLASSES = ["Hijabs", "Accessories", "Earring", "Rings", "Necklace"]` (match ProductModal options)
  - `generateProductId()`, `slugify(text)`, `generateSku(productId, parts, index)`, `emptyVariant()`
  - `defaultForm()` → form state object
  - `productToForm(product)` → form state from API product
  - `buildProductPayload(formData, { isCreate })` → API body (same shape as ProductModal `handleSubmit`)
  - `validateProductForm(payload)` → `{ ok: true } | { ok: false, error: string }`
  - `createDraftPayload()` → minimal body for Add product
  - `isProductFormDirty(a, b)` → boolean (JSON stringify of normalized comparable fields)

- [ ] **Step 1: Create `apps/web/utils/productForm.js` with helpers extracted from ProductModal**

```js
// apps/web/utils/productForm.js

export const STATUSES = ["draft", "active", "out_of_stock"];

export const PRODUCT_CLASSES = [
  "Hijabs",
  "Accessories",
  "Earring",
  "Rings",
  "Necklace",
];

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateProductId() {
  let id = "";
  for (let i = 0; i < 10; i++) {
    id += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return id;
}

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function generateSku(productId, parts, index) {
  const baseId = String(productId || "")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase();
  const part = String(parts || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 4)
    .toUpperCase();
  const idx = String((index ?? 0) + 1).padStart(2, "0");
  return `${baseId}-${part || "VAR"}-${idx}`;
}

export function emptyVariant() {
  return {
    color: "",
    size: "",
    customName: "",
    customValue: "",
    quantity: 0,
    images: [],
    sku: "",
    barcode: "",
  };
}

export function defaultForm() {
  return {
    productId: generateProductId(),
    product: "",
    productName: "",
    category: "",
    type: "",
    brand: "",
    description: "",
    pricing: {
      buyingPrice: 0,
      mrp: undefined,
      sellingPrice: 0,
      offerPrice: undefined,
    },
    variants: [emptyVariant()],
    status: "draft",
    hsnCode: "",
    taxClassId: "",
    priceTaxMode: "inclusive",
    slug: "",
    metaTitle: "",
    metaDescription: "",
    slugManual: false,
  };
}

export function productToForm(product) {
  if (!product) return defaultForm();
  const name = product.productName || product.name || "";
  return {
    productId: product.productId || generateProductId(),
    product: product.product || "",
    productName: name,
    category: product.category || "",
    type: product.type || product.subcategory || "",
    brand: product.brand || "",
    description: product.description || "",
    pricing: {
      buyingPrice: product.pricing?.buyingPrice ?? 0,
      mrp: product.pricing?.mrp,
      sellingPrice: product.pricing?.sellingPrice ?? product.price ?? 0,
      offerPrice: product.pricing?.offerPrice,
    },
    variants:
      Array.isArray(product.variants) && product.variants.length
        ? product.variants.map((v) => ({
            color: "",
            size: v.size || "",
            customName: v.customName || "",
            customValue: v.customValue || "",
            quantity: Number(v.quantity) || 0,
            images: Array.isArray(v.images) ? [...v.images] : [],
            sku: v.sku || "",
            barcode: v.barcode || "",
          }))
        : [emptyVariant()],
    status: STATUSES.includes(product.status) ? product.status : "draft",
    hsnCode: product.hsnCode || "",
    taxClassId: product.taxClassId || "",
    priceTaxMode: product.priceTaxMode === "exclusive" ? "exclusive" : "inclusive",
    slug: product.slug || slugify(name),
    metaTitle: product.metaTitle || "",
    metaDescription: product.metaDescription || "",
    slugManual: Boolean(product.slug),
  };
}

export function buildProductPayload(formData) {
  const productIdVal =
    (formData.productId && String(formData.productId).trim()) || generateProductId();
  const normalizedVariants = (formData.variants || []).filter((v) => {
    if (!v) return false;
    return (
      (v.size || "").trim() ||
      (v.customValue || "").trim() ||
      (v.sku || "").trim()
    );
  });
  const title = (formData.productName || "").trim();
  const slug =
    (formData.slug || "").trim() || slugify(title) || slugify(productIdVal);

  return {
    productId: productIdVal,
    product: (formData.product || "").trim(),
    productName: title,
    name: title,
    category: formData.category || "",
    type: formData.type || undefined,
    brand: (formData.brand || "").trim() || "Urban Aana",
    description: (formData.description != null ? formData.description : "").trim(),
    pricing: {
      buyingPrice: Number(formData.pricing?.buyingPrice) || 0,
      mrp:
        formData.pricing?.mrp != null && formData.pricing?.mrp !== ""
          ? Number(formData.pricing.mrp)
          : undefined,
      sellingPrice: Number(formData.pricing?.sellingPrice) || 0,
      offerPrice:
        formData.pricing?.offerPrice != null && formData.pricing?.offerPrice !== ""
          ? Number(formData.pricing.offerPrice)
          : undefined,
    },
    variants: normalizedVariants.map((v, idx) => {
      const size = (v.size || "").trim();
      const customName = (v.customName || "").trim();
      const customValue = (v.customValue || "").trim();
      const quantity = Math.max(0, Number(v.quantity) || 0);
      const images = Array.isArray(v.images) ? v.images.filter(Boolean) : [];
      const existingSku = v.sku != null ? String(v.sku).trim() : "";
      const sku =
        existingSku ||
        generateSku(productIdVal, [size, customValue].filter(Boolean).join("-"), idx);
      const barcode = v.barcode != null ? String(v.barcode).trim() : "";
      return {
        color: "",
        size,
        customName,
        customValue,
        quantity,
        images,
        sku,
        barcode: barcode || undefined,
      };
    }),
    thumbnails: (formData.variants || []).flatMap((v) =>
      (Array.isArray(v.images) ? v.images.filter(Boolean) : []).slice(0, 1)
    ),
    totalStock: normalizedVariants.reduce(
      (sum, v) => sum + Math.max(0, Number(v.quantity) || 0),
      0
    ),
    status: STATUSES.includes(formData.status) ? formData.status : "draft",
    hsnCode: (formData.hsnCode || "").trim() || null,
    taxClassId: formData.taxClassId || null,
    priceTaxMode: formData.priceTaxMode === "exclusive" ? "exclusive" : "inclusive",
    slug,
    metaTitle: (formData.metaTitle || "").trim() || null,
    metaDescription: (formData.metaDescription || "").trim() || null,
  };
}

export function validateProductForm(payload) {
  if (!payload.productId || !payload.product || !payload.productName || !payload.category) {
    return {
      ok: false,
      error: "Product type, product name, and category are required.",
    };
  }
  if (!payload.variants || payload.variants.length === 0) {
    return {
      ok: false,
      error: "Add at least one variant (size, or custom option).",
    };
  }
  return { ok: true };
}

/** Minimal body for Add product → draft redirect. API Product fields are optional. */
export function createDraftPayload() {
  const productId = generateProductId();
  const title = "Untitled product";
  return {
    productId,
    product: "Hijabs",
    productName: title,
    name: title,
    brand: "Urban Aana",
    description: "",
    pricing: { buyingPrice: 0, sellingPrice: 0 },
    variants: [
      {
        color: "",
        size: "Default",
        customName: "",
        customValue: "",
        quantity: 0,
        images: [],
        sku: generateSku(productId, "Default", 0),
      },
    ],
    thumbnails: [],
    totalStock: 0,
    status: "draft",
    priceTaxMode: "inclusive",
    slug: `untitled-product-${productId.toLowerCase()}`,
  };
}

export function isProductFormDirty(current, snapshot) {
  try {
    return (
      JSON.stringify(buildProductPayload(current)) !==
      JSON.stringify(buildProductPayload(snapshot))
    );
  } catch {
    return true;
  }
}
```

- [ ] **Step 2: Sanity-check exports load**

Run from `apps/web`:

```bash
node -e "const m=require('./utils/productForm.js'); console.log(m.createDraftPayload().status, m.validateProductForm(m.buildProductPayload(m.defaultForm())).ok)"
```

Note: if the project is ESM-only, use:

```bash
node --input-type=module -e "import * as m from './utils/productForm.js'; console.log(m.createDraftPayload().status)"
```

Working directory: `apps/web`. Expected: `draft` printed; validate on empty defaultForm returns `ok: false`.

---

### Task 2: List — Add product creates draft and redirects

**Files:**
- Modify: `apps/web/api/services/admin/productService.js`
- Modify: `apps/web/app/admin/products/page.js`

**Interfaces:**
- Consumes: `createDraftPayload()` from `productForm.js`, `adminProductHref`
- Produces: Add product no longer opens ProductModal

- [ ] **Step 1: Add `createDraft` on productService**

```js
  createDraft: () => {
    // dynamic import avoided — page will pass payload
    return null;
  },
```

Prefer keeping payload construction in the page:

```js
// In page.js
import { createDraftPayload } from "@/utils/productForm";
import { adminProductHref } from "@/utils/formatProductUrl";

const [creating, setCreating] = useState(false);

const handleAddProduct = async () => {
  if (creating) return;
  setCreating(true);
  try {
    const created = await adminProductService.create(createDraftPayload());
    router.push(adminProductHref(created));
  } catch (err) {
    toast.error(err?.response?.data?.detail || err?.message || "Failed to create product");
    setCreating(false);
  }
};
```

- [ ] **Step 2: Wire Add product button to `handleAddProduct`; remove ProductModal state/import/render**

Remove:
- `import ProductModal`
- `isModalOpen`, `selectedProduct` used only for modal edit
- Any Edit action that opened the modal for a row (if present)

Keep:
- Bulk edit modal (`BulkEditProductsModal`) unchanged
- Row click → `adminProductHref`

- [ ] **Step 3: Manual check**

Click Add product → lands on `/admin/products/<12-digit>` with Untitled product draft. No sidesheet.

---

### Task 3: Rebuild product detail page shell + Save/Discard

**Files:**
- Modify: `apps/web/app/admin/products/[id]/page.js` (full rewrite)

**Interfaces:**
- Consumes: `productToForm`, `buildProductPayload`, `validateProductForm`, `isProductFormDirty`, `emptyVariant`, `STATUSES`, `PRODUCT_CLASSES`, `slugify`
- Consumes: `adminProductService.getById|update|getNeighbors`, categories, tax classes
- Produces: editable page with dirty Save

- [ ] **Step 1: Replace page with 2-column layout shell**

Layout classes:

```jsx
<main className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col overflow-y-auto bg-background">
  <header className="sticky top-0 z-20 ...">...</header>
  <div className="grid grid-cols-1 items-start gap-3 p-3 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
    <div className="flex min-w-0 flex-col gap-3">{/* main cards */}</div>
    <aside className="flex flex-col gap-3">{/* right rail */}</aside>
  </div>
</main>
```

State pattern:

```jsx
const [product, setProduct] = useState(null); // server meta (_id, createdAt, productUrlId)
const [form, setForm] = useState(null);
const [snapshot, setSnapshot] = useState(null);
const dirty = form && snapshot ? isProductFormDirty(form, snapshot) : false;
```

Load:

```jsx
const data = await adminProductService.getById(productRef);
const next = productToForm(data);
setProduct(data);
setForm(next);
setSnapshot(next);
```

- [ ] **Step 2: Header actions**

- Title from `form.productName`
- Status badge from `form.status`
- Subtitle: `formatCreatedAt(product.createdAt)` only
- **Discard** — visible when dirty; `setForm(structuredClone(snapshot))`
- **Save** — visible/enabled when dirty; builds payload, validates, `adminProductService.update(product._id, payload)`, then reload/`productToForm` into form+snapshot, toast success
- Keep Barcode + View store + neighbors (disable neighbors or confirm if dirty)

`beforeunload` when dirty:

```jsx
useEffect(() => {
  if (!dirty) return;
  const onBeforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
}, [dirty]);
```

- [ ] **Step 3: Implement main cards (all editable)**

Use `Card` + `admin-surface` + `Field`/`Input`/`Textarea`/`Select` matching admin patterns.

1. Title — `form.productName` (also auto-updates slug unless `slugManual`)
2. Description — textarea
3. Media — show images from `form.variants[0].images` (and all variant images); file input → ImageCropModal → upload → push URL onto variant images (copy ProductModal crop flow)
4. Category — parent/type selects (load categories like ProductModal)
5. Price — selling / mrp / buying / offer / taxClass / priceTaxMode
6. Inventory — variant rows: size, customName/customValue, qty, sku, barcode; Add variant / remove
7. Tax codes — HSN
8. SEO — slug, metaTitle, metaDescription + small preview text

- [ ] **Step 4: Right rail**

- Status select
- Organization: `product` class select, `brand` input
- Publishing: button/link View store (`storefrontHref(product)` using current slug from form when possible)

Do **not** render Product ID.

- [ ] **Step 5: Manual QA checklist**

- Edit title → Save → reload shows new title
- Discard restores
- Add product from list → edit → Save
- Barcode still works
- Neighbors work
- No ProductModal on list/detail

---

### Task 4: Remove ProductModal

**Files:**
- Delete: `apps/web/components/admin/ProductModal.jsx`
- Grep repo for `ProductModal` and remove remaining imports

- [ ] **Step 1: Search**

```bash
rg "ProductModal" apps/web
```

Expected: only delete candidates / none after cleanup.

- [ ] **Step 2: Delete file and fix any leftover imports**

- [ ] **Step 3: Confirm list + detail still load**

---

### Task 5: Spec status + smoke

- [ ] **Step 1: Update spec status line to Implemented** in `docs/superpowers/specs/2026-07-31-shopify-product-detail-edit-design.md`

- [ ] **Step 2: Smoke**

1. Products list → Add product → draft detail  
2. Fill category + type + name + variant → Save  
3. Refresh → values persist  
4. No Product ID in UI  
5. Bulk edit still works from list  

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Sole edit surface | 2, 3, 4 |
| Draft create → redirect | 2 |
| 2-col Shopify layout | 3 |
| Existing fields only | 3 |
| Explicit Save / Discard | 3 |
| Hide Product ID | 3 |
| Remove ProductModal | 2, 4 |
| No rich text / metafields / warehouse grid | N/A (omitted) |
| Neighbors / barcode / view store | 3 |

## Placeholder scan

None intentionally left.

## Type consistency

- Form helpers use `productName`, `pricing.sellingPrice`, `variants[].sku` matching ProductModal/API.
- Update uses Mongo `_id` via `adminProductService.update(product._id, payload)` (existing service).
- Navigation uses `adminProductHref` / `productUrlId`.
