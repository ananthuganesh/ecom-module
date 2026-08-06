/**
 * Print-ready product barcode label (50mm × 25mm).
 * Supports 1 or 2 copies per sheet (2-up row).
 * Barcode SVG is rendered in-app (no CDN) so it always appears in the print popup.
 */

import JsBarcode from "jsbarcode";

export const BARCODE_LABEL_COPIES_OPTIONS = [1, 2];

export function normalizeBarcodeCopies(value) {
  const n = Number(value);
  return BARCODE_LABEL_COPIES_OPTIONS.includes(n) ? n : 1;
}

export function variantLabel(variant) {
  if (!variant || typeof variant !== "object") return "";
  return [variant.color, variant.size, variant.customValue]
    .filter(Boolean)
    .join(" / ");
}

/** Variants for barcode print UI; falls back to a single product-level row. */
export function listProductVariants(product) {
  const list = Array.isArray(product?.variants) ? product.variants : [];
  if (list.length) return list;
  return [
    {
      sku: product?.sku || "",
      barcode: product?.barcode || "",
      color: "",
      size: "",
      customValue: "",
    },
  ];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMfgMonthYear(date = new Date()) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatMrp(product) {
  const price = Number(product?.price ?? product?.salePrice ?? 0);
  if (!Number.isFinite(price) || price <= 0) return "—";
  return `₹${price.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Incl of all tax`;
}

function resolveSize(variant, product) {
  const fromVariant = String(variant?.size || "").trim();
  if (fromVariant) return fromVariant;
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  if (sizes.length === 1) return String(sizes[0]).trim() || "—";
  return "—";
}

function resolveLabelSku(variant, product) {
  const fromVariant = String(variant?.sku || "").trim();
  if (fromVariant) return fromVariant;
  return String(product?.sku || product?.productId || "").trim() || "—";
}

function resolveBarcodeCode(variant, product) {
  const candidates = [
    variant?.barcode,
    variant?.sku,
    product?.barcode,
    product?.sku,
    product?.productId,
  ];
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (v) return v;
  }
  return "";
}

function categoryNameById(categories, id) {
  if (!id || !Array.isArray(categories)) return "";
  const hit = categories.find((c) => String(c?._id) === String(id));
  return String(hit?.name || "").trim();
}

function resolveCategoryLine(product, categories = []) {
  const primary =
    categoryNameById(categories, product?.primaryCategoryId) ||
    String(product?.primaryCategoryName || "").trim() ||
    String(product?.category || "").trim();
  const secondary =
    categoryNameById(categories, product?.secondaryCategoryId) ||
    String(product?.secondaryCategoryName || "").trim() ||
    String(product?.subcategory || "").trim();

  if (primary && secondary && primary.toLowerCase() !== secondary.toLowerCase()) {
    return `${primary} / ${secondary}`;
  }
  return primary || secondary || "—";
}

/** Render CODE128 as SVG markup in the current document (no popup CDN). */
function buildBarcodeSvgMarkup(code) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, String(code), {
    format: "CODE128",
    width: 1.15,
    height: 36,
    displayValue: false,
    margin: 0,
    flat: true,
  });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.width = "100%";
  svg.style.height = "9mm";
  svg.style.maxHeight = "9mm";
  svg.style.display = "block";
  return svg.outerHTML;
}

function buildLabelHtml({
  brandName,
  size,
  mfg,
  mrp,
  category,
  sku,
  barcodeSvg,
}) {
  return `
    <div class="label">
      <div class="brand">${escapeHtml(brandName)}</div>
      <div class="meta">
        <div><strong>Size:</strong> ${escapeHtml(size)}</div>
        <div><strong>MFG:</strong> ${escapeHtml(mfg)}</div>
        <div><strong>MRP:</strong> ${escapeHtml(mrp)}</div>
        <div><strong>Category:</strong> ${escapeHtml(category)}</div>
        <div><strong>SKU:</strong> ${escapeHtml(sku)}</div>
      </div>
      <div class="barcode-wrap">${barcodeSvg}</div>
      <div class="footer">
        <div class="rule"></div>
        <div class="mfg-by">Manufactured by Urban Aana</div>
      </div>
    </div>
  `;
}

/**
 * @param {object} opts
 * @param {object} opts.product
 * @param {object} [opts.variant]
 * @param {array} [opts.categories]
 * @param {1|2} [opts.copies]
 */
export async function printProductBarcodeLabel({
  product,
  variant = null,
  categories: categoriesProp,
  copies = 1,
} = {}) {
  if (typeof window === "undefined") {
    return { ok: false, error: "Print is only available in the browser" };
  }

  const productName = product?.productName || product?.name || "Product";
  const sku = resolveLabelSku(variant, product);
  const code = resolveBarcodeCode(variant, product) || sku;
  if (!code || code === "—") {
    return { ok: false, error: "Unable to print barcode for this product" };
  }

  let barcodeSvg;
  try {
    barcodeSvg = buildBarcodeSvgMarkup(code);
  } catch (err) {
    console.error("Barcode render failed:", err);
    return { ok: false, error: "Unable to generate barcode for this SKU" };
  }

  // Open immediately so the browser does not block the popup
  const w = window.open("", "_blank", "width=900,height=320");
  if (!w) {
    return { ok: false, error: "Allow pop-ups to print the barcode label" };
  }

  let categories = Array.isArray(categoriesProp) ? categoriesProp : [];
  if (!categories.length) {
    try {
      const { adminCategoryService } = await import("@/api");
      const data = await adminCategoryService.getAll();
      categories = Array.isArray(data) ? data : [];
    } catch {
      categories = [];
    }
  }

  const count = normalizeBarcodeCopies(copies);
  const brandName =
    String(product?.brand || product?.brandName || "KERALATHINAYI").trim() ||
    "KERALATHINAYI";
  const fields = {
    brandName,
    size: resolveSize(variant, product),
    mfg: formatMfgMonthYear(),
    mrp: formatMrp(product),
    category: resolveCategoryLine(product, categories),
    sku,
    barcodeSvg,
  };

  const oneLabel = () => buildLabelHtml(fields);

  // Dual die-cut stock: always 2 × 50mm panels side-by-side (identical pair).
  // copies=2 → one sheet with both panels; copies=1 still prints both (same label twice).
  const sheetCount = Math.max(1, Math.ceil(count / 2));
  const rowsHtml = Array.from({ length: sheetCount }, () => {
    return `<div class="row">${oneLabel()}${oneLabel()}</div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode – ${escapeHtml(productName)}</title>
  <style>
    @page { size: 100mm 25mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: Arial, Helvetica, sans-serif;
    }
    .sheet { width: 100mm; }
    .row {
      width: 100mm;
      height: 25mm;
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      page-break-after: always;
      break-after: page;
    }
    .row:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .label {
      width: 50mm;
      flex: 0 0 50mm;
      max-width: 50mm;
      height: 25mm;
      padding: 1.2mm 1.6mm 1mm;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    .brand {
      font-size: 3.1mm;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1.05;
      text-transform: uppercase;
      margin-bottom: 0.5mm;
    }
    .meta {
      font-size: 1.85mm;
      line-height: 1.22;
      flex: 0 0 auto;
    }
    .meta strong { font-weight: 700; }
    .barcode-wrap {
      margin-top: 0.6mm;
      width: 100%;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: stretch;
      overflow: hidden;
    }
    .barcode-wrap svg {
      width: 100% !important;
      max-width: 100%;
      height: 9mm !important;
      max-height: 9mm !important;
      display: block;
    }
    .footer {
      margin-top: auto;
      text-align: center;
      padding-top: 0.4mm;
    }
    .rule {
      width: 18mm;
      height: 0;
      border-top: 0.25mm solid #000;
      margin: 0 auto 0.35mm;
    }
    .mfg-by {
      font-size: 1.55mm;
      line-height: 1.1;
      font-weight: 500;
    }
    @media print {
      html, body { width: 100mm; }
      .sheet { width: 100mm; }
    }
  </style>
</head>
<body>
  <div class="sheet">${rowsHtml}</div>
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 120);
    };
  </script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  return { ok: true, copies: sheetCount * 2 };
}
