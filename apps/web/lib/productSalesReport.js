/**
 * Admin product-wise sales report helpers (page: app/admin/products/sales).
 * Dates are IST calendar days as YYYY-MM-DD, matching the API's `from`/`to`.
 */

export const SALES_RANGE_PRESETS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "90d", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Today's IST calendar date as {y, m (1-12), d}. */
export function istToday(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
}

function ymd(y, m, d) {
  // Date.UTC normalises overflow (day 0 = last day of previous month).
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

/** {from, to} (inclusive, YYYY-MM-DD) for a preset; nulls mean unbounded. */
export function rangeForPreset(preset, now = new Date()) {
  const { y, m, d } = istToday(now);
  const today = ymd(y, m, d);
  switch (preset) {
    case "7d":
      return { from: ymd(y, m, d - 6), to: today };
    case "30d":
      return { from: ymd(y, m, d - 29), to: today };
    case "90d":
      return { from: ymd(y, m, d - 89), to: today };
    case "month":
      return { from: ymd(y, m, 1), to: today };
    case "lastMonth":
      return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
    case "year":
      return { from: ymd(y, 1, 1), to: today };
    case "all":
      return { from: null, to: null };
    default:
      return null;
  }
}

/** Query params for the API, dropping empty bounds. */
export function reportParams(range) {
  const params = {};
  if (range?.from) params.from = range.from;
  if (range?.to) params.to = range.to;
  return params;
}

export function rangeError(range) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (range?.from && !re.test(range.from)) return "Start date is invalid.";
  if (range?.to && !re.test(range.to)) return "End date is invalid.";
  if (range?.from && range?.to && range.from > range.to) {
    return "Start date must be on or before end date.";
  }
  return "";
}

export function variantSummary(variants) {
  return (Array.isArray(variants) ? variants : [])
    .map((v) => `${v.label} × ${v.units}`)
    .join(", ");
}

/** Case-insensitive match on product name or a variant label. */
export function filterSalesRows(rows, query) {
  const q = String(query || "").trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];
  if (!q) return list;
  return list.filter(
    (row) =>
      String(row.productName || "").toLowerCase().includes(q) ||
      (row.variants || []).some((v) => String(v.label || "").toLowerCase().includes(q))
  );
}

export const SALES_CSV_HEADERS = [
  "Product",
  "Product ID",
  "Pieces sold",
  "Returned",
  "Net pieces",
  "Orders",
  "Gross sales (INR)",
  "Variants",
];

export function salesCsvRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    Product: row.productName || "",
    "Product ID": row.productUrlId || row.productId || "",
    "Pieces sold": Number(row.unitsSold || 0),
    Returned: Number(row.returnedUnits || 0),
    "Net pieces": Number(row.netUnits || 0),
    Orders: Number(row.orders || 0),
    "Gross sales (INR)": Number(row.grossSales || 0).toFixed(2),
    Variants: variantSummary(row.variants),
  }));
}

export function salesCsvFilename(range) {
  if (!range?.from && !range?.to) return "product-sales-all-time.csv";
  return `product-sales-${range.from || "start"}-to-${range.to || "today"}.csv`;
}
