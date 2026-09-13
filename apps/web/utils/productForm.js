export const STATUSES = ["draft", "active"];

export const PRODUCT_CLASSES = [
  "Hijabs",
  "Accessories",
  "Earring",
  "Rings",
  "Necklace",
];

/** Fixed catalog categories (admin Category dropdown). */
export const PRODUCT_CATEGORIES = ["T-Shirt"];

/** Product Type options keyed by Category name. */
export const PRODUCT_TYPES_BY_CATEGORY = {
  "T-Shirt": [
    "Graphic T-Shirt",
    "Oversized T-Shirt",
    "Plain T-Shirt",
    "Polo T-Shirt",
    "Full Sleeve T-Shirt",
    "Tank Top",
  ],
};

export function productTypesForCategory(category) {
  const key = String(category || "").trim();
  return PRODUCT_TYPES_BY_CATEGORY[key] || [];
}

/** Product-level apparel attributes shown on admin detail. */
export const PRODUCT_ATTR_FIELDS = [
  {
    key: "fit",
    label: "Fit",
    options: ["Regular", "Oversized", "Relaxed", "Slim"],
    creatable: true,
  },
  {
    key: "fabric",
    label: "Fabric",
    options: ["Cotton", "Cotton Blend", "Terry", "Polyester"],
    creatable: true,
  },
  {
    key: "neckType",
    label: "Neck Type",
    options: ["Round Neck", "Polo", "V Neck", "Henley"],
    creatable: true,
  },
  {
    key: "colors",
    label: "Colour",
    options: [],
    creatable: true,
  },
  {
    key: "pattern",
    label: "Pattern",
    options: ["Graphic Print", "Solid", "Striped", "All Over Print", "Embroidery"],
    creatable: true,
  },
  {
    key: "sleeveType",
    label: "Sleeve Type",
    options: ["Half Sleeve", "Full Sleeve", "Sleeveless"],
    creatable: true,
  },
];

function normalizeColorList(value) {
  const raw = Array.isArray(value)
    ? value
    : value != null && value !== ""
      ? [value]
      : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const name = String(item || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function emptyProductAttrs() {
  const out = {};
  for (const { key } of PRODUCT_ATTR_FIELDS) {
    out[key] = key === "colors" ? [] : "";
  }
  return out;
}

function attrsFromProduct(product) {
  const out = emptyProductAttrs();
  for (const { key } of PRODUCT_ATTR_FIELDS) {
    if (key === "colors") {
      const fromList = normalizeColorList(product?.colors);
      out.colors = fromList.length
        ? fromList
        : normalizeColorList(product?.color);
      continue;
    }
    out[key] = product?.[key] != null ? String(product[key]) : "";
  }
  return out;
}

function attrsForPayload(formData) {
  const out = {};
  for (const { key } of PRODUCT_ATTR_FIELDS) {
    if (key === "colors") {
      const colors = normalizeColorList(formData?.colors);
      out.colors = colors;
      out.color = colors[0] || null;
      continue;
    }
    const raw = formData?.[key];
    const trimmed = raw != null ? String(raw).trim() : "";
    out[key] = trimmed || null;
  }
  return out;
}

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

/** Strip legacy trailing variant index (`-01`, `-02`, …) from SKUs. */
export function stripSkuIndex(sku) {
  return String(sku || "")
    .trim()
    .replace(/-\d{2}$/, "");
}

export function generateSku(productId, parts, _index) {
  const baseId = String(productId || "")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase();
  const part = String(parts || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 4)
    .toUpperCase();
  return `${baseId}-${part || "VAR"}`;
}

/** Digits only, optional single `.`, max 2 decimal places. */
export function sanitizePriceInput(value) {
  let cleaned = String(value ?? "").replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot !== -1) {
    cleaned =
      cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
    const [intPart, frac = ""] = cleaned.split(".");
    cleaned = `${intPart}.${frac.slice(0, 2)}`;
  }
  return cleaned;
}

export function parsePriceNumber(value, { fallback = 0 } = {}) {
  if (value == null || value === "") return fallback;
  const cleaned = sanitizePriceInput(value);
  if (!cleaned || cleaned === ".") return fallback;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Display as `0.00` style for price fields. */
export function formatPriceDisplay(value) {
  const n = parsePriceNumber(value, { fallback: 0 });
  if (n == null) return "0.00";
  return n.toFixed(2);
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
    category: "T-Shirt",
    type: "",
    brand: "",
    description: "",
    ...emptyProductAttrs(),
    pricing: {
      buyingPrice: "0.00",
      mrp: "",
      sellingPrice: "0.00",
    },
    variants: [emptyVariant()],
    thumbnails: [],
    status: "draft",
    badge: "auto",
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
  const variants =
    Array.isArray(product.variants) && product.variants.length
      ? product.variants.map((v) => ({
          color: "",
          size: v.size || "",
          customName: v.customName || "",
          customValue: v.customValue || "",
          quantity: Number(v.quantity) || 0,
          images: Array.isArray(v.images) ? v.images.filter(Boolean).map(String) : [],
          sku: stripSkuIndex(v.sku),
          barcode: v.barcode || "",
        }))
      : [emptyVariant()];

  // Product Media and variant images stay separate. Drop any URLs that already
  // belong to a variant so they only show in the variant image area.
  const variantImageSet = new Set(
    variants.flatMap((v) => (Array.isArray(v.images) ? v.images : []))
  );
  const thumbnails = (
    Array.isArray(product.thumbnails) ? product.thumbnails : []
  )
    .filter(Boolean)
    .map(String)
    .filter((url) => !variantImageSet.has(url));

  return {
    productId: product.productId || generateProductId(),
    product: product.product || "",
    productName: name,
    category: product.category || "T-Shirt",
    type: product.type || product.subcategory || "",
    brand: product.brand || "",
    description: product.description || "",
    ...attrsFromProduct(product),
    pricing: {
      buyingPrice: formatPriceDisplay(product.pricing?.buyingPrice ?? 0),
      mrp:
        product.pricing?.mrp != null && product.pricing?.mrp !== ""
          ? formatPriceDisplay(product.pricing.mrp)
          : "",
      sellingPrice: formatPriceDisplay(
        product.pricing?.sellingPrice ?? product.price ?? 0
      ),
    },
    variants,
    thumbnails,
    status:
      product.status === "active"
        ? "active"
        : product.status === "draft"
          ? "draft"
          : product.status === "out_of_stock"
            ? "active"
            : "draft",
    badge: ["new_arrival", "trending", "best_seller"].includes(
      String(product.badge || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    )
      ? String(product.badge)
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_")
      : "auto",
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
  const variantsForPayload =
    normalizedVariants.length > 0
      ? normalizedVariants
      : [
          {
            color: "",
            size: "",
            customName: "",
            customValue: "",
            quantity: 0,
            images: [],
            sku: "",
            barcode: "",
          },
        ];
  const title = (formData.productName || "").trim();
  const slug =
    (formData.slug || "").trim() || slugify(title) || slugify(productIdVal);

  return {
    productId: productIdVal,
    product: (formData.product || formData.category || "").trim(),
    productName: title,
    name: title,
    category: formData.category || "",
    type: formData.type || undefined,
    brand: (formData.brand || "").trim() || "Urban Aana",
    description: (formData.description != null ? formData.description : "").trim(),
    ...attrsForPayload(formData),
    pricing: {
      buyingPrice: (() => {
        const n = parsePriceNumber(formData.pricing?.buyingPrice, { fallback: 0 });
        return n == null ? 0 : n;
      })(),
      mrp: (() => {
        if (formData.pricing?.mrp == null || formData.pricing?.mrp === "") {
          return undefined;
        }
        const n = parsePriceNumber(formData.pricing.mrp, { fallback: null });
        return n == null ? undefined : n;
      })(),
      sellingPrice: (() => {
        const n = parsePriceNumber(formData.pricing?.sellingPrice, { fallback: 0 });
        return n == null ? 0 : n;
      })(),
    },
    variants: variantsForPayload.map((v, idx) => {
      const size = (v.size || "").trim();
      const customName = (v.customName || "").trim();
      const customValue = (v.customValue || "").trim();
      const quantity = Math.max(0, Number(v.quantity) || 0);
      const images = Array.isArray(v.images) ? v.images.filter(Boolean) : [];
      const existingSku = stripSkuIndex(v.sku);
      const sku =
        existingSku ||
        generateSku(
          productIdVal,
          [size, customValue].filter(Boolean).join("-") || "VAR",
          idx
        );
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
    // Product Media only — never copy variant uploads into thumbnails.
    thumbnails: (() => {
      const variantImageSet = new Set(
        (formData.variants || []).flatMap((v) =>
          Array.isArray(v.images) ? v.images.filter(Boolean) : []
        )
      );
      return (formData.thumbnails || [])
        .filter(Boolean)
        .filter((url) => !variantImageSet.has(url));
    })(),
    totalStock: variantsForPayload.reduce(
      (sum, v) => sum + Math.max(0, Number(v.quantity) || 0),
      0
    ),
    status: STATUSES.includes(formData.status) ? formData.status : "draft",
    badge: ["new_arrival", "trending", "best_seller"].includes(
      String(formData.badge || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    )
      ? String(formData.badge)
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_")
      : null,
    hsnCode: (formData.hsnCode || "").trim() || null,
    taxClassId: null,
    priceTaxMode: formData.priceTaxMode === "exclusive" ? "exclusive" : "inclusive",
    slug,
    metaTitle: (formData.metaTitle || "").trim() || null,
    metaDescription: (formData.metaDescription || "").trim() || null,
  };
}

export function validateProductForm(payload) {
  if (!payload.productId || !payload.productName || !payload.category) {
    return {
      ok: false,
      error: "Product name and category are required.",
    };
  }
  if (!payload.variants || payload.variants.length === 0) {
    return {
      ok: false,
      error: "Add at least one variant (size, or custom option).",
    };
  }
  const pricing = payload.pricing || {};
  for (const key of ["buyingPrice", "mrp", "sellingPrice"]) {
    const val = pricing[key];
    if (val == null || val === "") continue;
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
      return { ok: false, error: `${key} must be a valid non-negative number.` };
    }
  }
  return { ok: true };
}

/** Minimal body for Add product → draft redirect. */
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
        size: "",
        customName: "",
        customValue: "",
        quantity: 0,
        images: [],
        sku: generateSku(productId, "VAR"),
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
