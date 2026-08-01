/**
 * Product barcode label print — matches TSPL dual-label stock:
 * SIZE 100 mm, 40 mm | GAP 3 mm, 0 mm
 * Two identical panels side-by-side; Code 128 barcode.
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDom(d = new Date()) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[d.getMonth()]}, ${d.getFullYear()}`;
}

export function variantLabel(variant) {
  if (!variant || typeof variant !== "object") return "";
  return [variant.color, variant.size, variant.customValue].filter(Boolean).join(" / ");
}

export function resolveLabelSize(variant) {
  if (!variant || typeof variant !== "object") return "";
  return String(variant.size || "").trim();
}

function looksLikeObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());
}

function categoryId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    return String(value._id || value.id || "").trim();
  }
  return String(value).trim();
}

function findCategoryName(categories, idOrDoc) {
  if (!idOrDoc) return "";
  if (typeof idOrDoc === "object") {
    const direct = String(idOrDoc.name || idOrDoc.title || "").trim();
    if (direct) return direct;
  }
  const id = categoryId(idOrDoc);
  if (!id) return "";
  const list = Array.isArray(categories) ? categories : [];
  const match = list.find((c) => categoryId(c) === id);
  return String(match?.name || match?.title || "").trim();
}

/** Resolve human-readable category (+ type) name. */
export function resolveLabelCategory(product, categories = []) {
  const parentName =
    (product?.category && typeof product.category === "object"
      ? String(product.category.name || product.category.title || "").trim()
      : "") ||
    (String(product?.category || "").trim() &&
    !looksLikeObjectId(product.category)
      ? String(product.category).trim()
      : "") ||
    findCategoryName(categories, product?.category);

  const subName =
    (product?.type && typeof product.type === "object"
      ? String(product.type.name || product.type.title || "").trim()
      : "") ||
    (String(product?.type || "").trim() &&
    !looksLikeObjectId(product.type)
      ? String(product.type).trim()
      : "") ||
    findCategoryName(categories, product?.type);

  if (parentName && subName) return `${parentName} / ${subName}`;
  if (parentName) return parentName;
  if (subName) return subName;

  const named = String(product?.categoryName || "").trim();
  if (named && !looksLikeObjectId(named)) return named;

  return "";
}

export function resolveBarcodeCode(variant, product) {
  const fromVariant = String(variant?.barcode || variant?.sku || "").trim();
  if (fromVariant) return fromVariant;
  const fromProduct = String(product?.barcode || product?.sku || "").trim();
  if (fromProduct) return fromProduct;
  const id = product?._id != null ? String(product._id) : "";
  return id ? id.slice(-8).toUpperCase() : "";
}

export function resolveLabelSku(variant, product) {
  const fromVariant = String(variant?.sku || "").trim();
  if (fromVariant) return fromVariant;
  const fromProduct = String(product?.sku || "").trim();
  if (fromProduct) return fromProduct;
  const id = product?._id != null ? String(product._id) : "";
  return id ? id.slice(-8).toUpperCase() : "—";
}

export function resolveLabelMrp(product, variant) {
  const v = variant?.mrp ?? variant?.price ?? variant?.pricing?.mrp;
  if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  const p =
    product?.pricing?.mrp ??
    product?.mrp ??
    product?.pricing?.sellingPrice ??
    product?.price;
  if (p != null && p !== "" && !Number.isNaN(Number(p))) return Number(p);
  return null;
}

export function normalizeBarcodeCopies(raw, { min = 1, max = 200 } = {}) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** TSPL stock: SIZE 100mm, 40mm — two panels side by side. */
export const LABEL_STOCK = {
  pageWmm: 100,
  pageHmm: 40,
  /** Vertical gap between labels on the roll (GAP 3 mm, 0 mm). */
  gapHmm: 3,
  panelWmm: 50,
};

/**
 * Build print HTML for barcode labels.
 * Always landscape 100×40 mm with two panels per sheet (matches dual die-cut stock).
 * copies=1 → one sheet with the same label twice (identical pair).
 */
export function buildProductBarcodeLabelHtml({
  productName,
  sizeText,
  categoryText,
  dom,
  mrp,
  sku,
  barcode,
  manufacturer = "Urban Aana",
  copies = 1,
}) {
  const code = String(barcode || sku || "").trim();
  const mrpText =
    mrp != null
      ? `₹${Number(mrp).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "—";
  const title = esc(productName || "Product Label");
  const count = normalizeBarcodeCopies(copies);

  const { pageWmm, pageHmm, gapHmm, panelWmm } = LABEL_STOCK;
  const PAGE_W = `${pageWmm}mm`;
  const PAGE_H = `${pageHmm}mm`;
  const PANEL_W = `${panelWmm}mm`;
  const LABEL_H = `${pageHmm}mm`;

  const oneLabel = (i) => `<div class="label">
    <div class="label-body">
      <div class="name">${esc((productName || "Product").toUpperCase())}</div>
      <div class="row-line">
        <span class="pair"><b>Size:</b> ${esc(sizeText || "—")}</span>
        <span class="pair"><b>MFG:</b> ${esc(dom || formatDom())}</span>
      </div>
      <div class="row"><b>MRP:</b> ${esc(mrpText)} Incl of all tax</div>
      <div class="row"><b>Category:</b> ${esc(categoryText || "—")}</div>
      <div class="row"><b>SKU:</b> ${esc(sku || "—")}</div>
      <div class="barcode-wrap">
        <svg class="barcode" id="barcode-${i}"></svg>
        <div class="barcode-fallback err" hidden>—</div>
      </div>
      <div class="sku-line">${esc(sku || "—")}</div>
      <div class="mfg">Manufactured by ${esc(manufacturer)}</div>
    </div>
  </div>`;

  // Pair panels left/right. copies=1 → identical pair (matches TSPL dual print).
  const slots = [];
  if (count === 1) {
    slots.push([0, 0]);
  } else {
    for (let i = 0; i < count; i += 2) {
      slots.push([i, i + 1 < count ? i + 1 : null]);
    }
  }

  const labelsHtml = slots
    .map(([a, b], rowIdx) => {
      const left = oneLabel(rowIdx * 2);
      const right =
        b == null
          ? `<div class="label label-empty"></div>`
          : oneLabel(rowIdx * 2 + 1);
      return `<div class="label-row">${left}${right}</div>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    /* TSPL: SIZE ${pageWmm} mm, ${pageHmm} mm — landscape, never rotate */
    @page {
      size: ${PAGE_W} ${PAGE_H};
      margin: 0;
    }
    @media print {
      @page {
        size: ${PAGE_W} ${PAGE_H};
        margin: 0;
      }
      html, body {
        width: ${PAGE_W} !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .label-row {
        page-break-after: always;
        break-after: page;
      }
      .label-row:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${PAGE_W};
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-row {
      width: ${PAGE_W};
      height: ${PAGE_H};
      max-height: ${PAGE_H};
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: stretch;
      justify-content: flex-start;
      overflow: hidden;
      /* Roll GAP ${gapHmm} mm between successive labels */
      margin-bottom: ${gapHmm}mm;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .label-row:last-child {
      margin-bottom: 0;
      page-break-after: auto;
      break-after: auto;
    }
    .label {
      width: ${PANEL_W};
      min-width: ${PANEL_W};
      max-width: ${PANEL_W};
      height: ${LABEL_H};
      max-height: ${LABEL_H};
      padding: 1.8mm 2mm 1.4mm;
      overflow: hidden;
      display: flex;
      align-items: stretch;
      flex: 0 0 ${PANEL_W};
      /* Keep content upright (landscape sheet, not rotated text) */
      writing-mode: horizontal-tb;
      text-orientation: mixed;
      transform: none;
    }
    .label-empty {
      width: ${PANEL_W};
      min-width: ${PANEL_W};
      height: ${LABEL_H};
      flex: 0 0 ${PANEL_W};
    }
    .label-body {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 0.5mm;
      overflow: hidden;
    }
    .name {
      font-size: 8.5pt;
      font-weight: 700;
      line-height: 1.1;
      max-height: 6.5mm;
      overflow: hidden;
      word-break: break-word;
    }
    .row-line {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      gap: 1mm;
      font-size: 6.5pt;
      line-height: 1.2;
    }
    .row {
      font-size: 6.5pt;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row b, .pair b {
      font-weight: 700;
      margin-right: 0.6mm;
    }
    .pair {
      flex: 1 1 50%;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .barcode-wrap {
      margin-top: auto;
      width: 100%;
      height: 11mm;
      max-height: 11mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .barcode-wrap svg {
      width: 100% !important;
      max-width: 44mm;
      height: 9mm !important;
      max-height: 9mm !important;
      display: block;
      /* Bars must run vertically across a horizontal scan path */
      transform: none !important;
    }
    .sku-line {
      margin-top: 0.3mm;
      font-size: 6.5pt;
      line-height: 1.1;
      text-align: center;
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mfg {
      margin-top: 0.2mm;
      font-size: 5pt;
      line-height: 1.1;
      color: #222;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .err {
      font-size: 5pt;
      text-align: center;
    }
  </style>
</head>
<body>
  ${labelsHtml}
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    (function () {
      var code = ${JSON.stringify(code)};
      function doPrint() {
        setTimeout(function () { window.focus(); window.print(); }, 200);
      }
      function render() {
        var nodes = document.querySelectorAll(".barcode");
        for (var i = 0; i < nodes.length; i++) {
          var svg = nodes[i];
          var fallback = svg.parentNode.querySelector(".barcode-fallback");
          if (!code) {
            if (fallback) {
              fallback.hidden = false;
              fallback.textContent = "—";
            }
            continue;
          }
          try {
            if (typeof JsBarcode === "undefined") throw new Error("JsBarcode missing");
            // CODE128 ("128M" in TSPL) — flat, wide, short bars for 40mm height stock
            JsBarcode(svg, code, {
              format: "CODE128",
              width: 1.2,
              height: 34,
              displayValue: false,
              margin: 0,
              flat: true
            });
            svg.removeAttribute("width");
            svg.removeAttribute("height");
            svg.style.width = "100%";
            svg.style.height = "9mm";
            svg.style.maxHeight = "9mm";
            svg.style.transform = "none";
          } catch (e) {
            if (fallback) {
              fallback.hidden = false;
              fallback.textContent = code;
            }
          }
        }
        doPrint();
      }
      if (document.readyState === "complete") render();
      else window.onload = render;
    })();
  <\/script>
</body>
</html>`;
}

/**
 * @returns {Promise<{ ok: true, copies: number } | { ok: false, error: string }>}
 */
export async function printProductBarcodeLabel({
  product,
  variant,
  copies = 1,
  categories: categoriesProp,
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

  // Open immediately (before await) so the browser does not block the popup
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
  const html = buildProductBarcodeLabelHtml({
    productName,
    sizeText: resolveLabelSize(variant),
    categoryText: resolveLabelCategory(product, categories),
    dom: formatDom(),
    mrp: resolveLabelMrp(product, variant),
    sku,
    barcode: code,
    manufacturer: "Urban Aana",
    copies: count,
  });

  w.document.open();
  w.document.write(html);
  w.document.close();
  return { ok: true, copies: count };
}

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
