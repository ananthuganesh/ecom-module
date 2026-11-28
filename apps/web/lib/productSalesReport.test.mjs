import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterSalesRows,
  istToday,
  rangeError,
  rangeForPreset,
  reportParams,
  salesCsvFilename,
  salesCsvRows,
  variantSummary,
} from "./productSalesReport.js";

// 11 Nov 2026 20:00 UTC is already 12 Nov 01:30 in India.
const LATE_UTC = new Date("2026-11-11T20:00:00Z");
const MID_MARCH = new Date("2026-03-15T06:00:00Z");

describe("istToday", () => {
  it("uses the Indian calendar day, not UTC", () => {
    assert.deepEqual(istToday(LATE_UTC), { y: 2026, m: 11, d: 12 });
  });
});

describe("rangeForPreset", () => {
  it("builds inclusive IST ranges", () => {
    assert.deepEqual(rangeForPreset("7d", LATE_UTC), { from: "2026-11-06", to: "2026-11-12" });
    assert.deepEqual(rangeForPreset("30d", LATE_UTC), { from: "2026-10-14", to: "2026-11-12" });
    assert.deepEqual(rangeForPreset("month", LATE_UTC), { from: "2026-11-01", to: "2026-11-12" });
    assert.deepEqual(rangeForPreset("year", LATE_UTC), { from: "2026-01-01", to: "2026-11-12" });
    assert.deepEqual(rangeForPreset("all", LATE_UTC), { from: null, to: null });
    assert.equal(rangeForPreset("custom", LATE_UTC), null);
  });

  it("handles last month across short months and year boundaries", () => {
    assert.deepEqual(rangeForPreset("lastMonth", MID_MARCH), { from: "2026-02-01", to: "2026-02-28" });
    assert.deepEqual(rangeForPreset("lastMonth", new Date("2026-01-10T06:00:00Z")), {
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("reportParams / rangeError", () => {
  it("drops empty bounds", () => {
    assert.deepEqual(reportParams({ from: null, to: null }), {});
    assert.deepEqual(reportParams({ from: "2026-10-01", to: "" }), { from: "2026-10-01" });
  });

  it("rejects backwards or malformed ranges", () => {
    assert.equal(rangeError({ from: "2026-10-01", to: "2026-10-31" }), "");
    assert.match(rangeError({ from: "2026-11-01", to: "2026-10-01" }), /on or before/);
    assert.match(rangeError({ from: "01/10/2026" }), /Start date/);
  });
});

const rows = [
  {
    productId: "p1",
    productUrlId: "100000000001",
    productName: 'Mandala Tee, "Black"',
    unitsSold: 6,
    returnedUnits: 1,
    netUnits: 5,
    orders: 3,
    grossSales: 4794,
    variants: [
      { label: "M / Black", units: 4 },
      { label: "L / Black", units: 2 },
    ],
  },
  { productId: "p2", productName: "Kolam Hoodie", unitsSold: 1, returnedUnits: 0, netUnits: 1, orders: 1, grossSales: 1999, variants: [{ label: "XL", units: 1 }] },
];

describe("filterSalesRows", () => {
  it("matches product names and variant labels", () => {
    assert.equal(filterSalesRows(rows, "").length, 2);
    assert.deepEqual(filterSalesRows(rows, "hoodie").map((r) => r.productId), ["p2"]);
    assert.deepEqual(filterSalesRows(rows, "xl").map((r) => r.productId), ["p2"]);
    assert.deepEqual(filterSalesRows(rows, "m / black").map((r) => r.productId), ["p1"]);
  });
});

describe("CSV export", () => {
  it("flattens variants and prefers the public product id", () => {
    assert.equal(variantSummary(rows[0].variants), "M / Black × 4, L / Black × 2");
    const [first, second] = salesCsvRows(rows);
    assert.equal(first["Product ID"], "100000000001");
    assert.equal(first["Pieces sold"], 6);
    assert.equal(first["Net pieces"], 5);
    assert.equal(first["Gross sales (INR)"], "4794.00");
    assert.equal(second["Product ID"], "p2");
  });

  it("names the file after the range", () => {
    assert.equal(salesCsvFilename({ from: "2026-10-01", to: "2026-10-31" }), "product-sales-2026-10-01-to-2026-10-31.csv");
    assert.equal(salesCsvFilename({ from: null, to: null }), "product-sales-all-time.csv");
  });
});
