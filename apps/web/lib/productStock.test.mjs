import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterInStock,
  isProductInStock,
  isProductSoldOut,
  productStock,
  variantStock,
} from "./productStock.js";

describe("productStock", () => {
  it("sums live variants", () => {
    assert.equal(
      productStock({ variants: [{ quantity: 2 }, { quantity: 3 }] }),
      5
    );
  });

  it("accepts either quantity or stock on a variant", () => {
    assert.equal(productStock({ variants: [{ stock: 4 }] }), 4);
    assert.equal(productStock({ variants: [{ quantity: 0, stock: 7 }] }), 0);
  });

  it("ignores deleted variants", () => {
    assert.equal(
      productStock({ variants: [{ quantity: 5, isDeleted: true }, { quantity: 1 }] }),
      1
    );
  });

  it("prefers variants over a stale totalStock", () => {
    // totalStock is denormalized and can lag the ledger.
    assert.equal(productStock({ totalStock: 99, variants: [{ quantity: 0 }] }), 0);
    assert.equal(productStock({ totalStock: 0, variants: [{ quantity: 3 }] }), 3);
  });

  it("falls back to totalStock when there are no variants", () => {
    assert.equal(productStock({ totalStock: 6 }), 6);
    assert.equal(productStock({ totalStock: 6, variants: [] }), 6);
    assert.equal(productStock({}), 0);
  });
});

describe("isProductSoldOut", () => {
  it("treats zero and missing stock as sold out", () => {
    assert.equal(isProductSoldOut({ variants: [{ quantity: 0 }] }), true);
    assert.equal(isProductSoldOut({ totalStock: 0 }), true);
    assert.equal(isProductSoldOut({}), true);
    assert.equal(isProductSoldOut(null), true);
    assert.equal(isProductSoldOut(undefined), true);
  });

  it("treats any remaining unit as available", () => {
    assert.equal(isProductSoldOut({ totalStock: 1 }), false);
    assert.equal(isProductInStock({ variants: [{ quantity: 0 }, { stock: 2 }] }), true);
  });

  it("does not go negative on odd data", () => {
    assert.equal(isProductSoldOut({ totalStock: -3 }), true);
  });
});

describe("filterInStock", () => {
  it("drops sold-out products and keeps order", () => {
    const list = [
      { _id: "a", totalStock: 2 },
      { _id: "b", totalStock: 0 },
      { _id: "c", variants: [{ quantity: 1 }] },
      { _id: "d", variants: [{ quantity: 0, isDeleted: false }] },
    ];
    assert.deepEqual(
      filterInStock(list).map((p) => p._id),
      ["a", "c"]
    );
  });

  it("survives a missing or malformed list", () => {
    assert.deepEqual(filterInStock(null), []);
    assert.deepEqual(filterInStock(undefined), []);
    assert.deepEqual(filterInStock([]), []);
  });
});
