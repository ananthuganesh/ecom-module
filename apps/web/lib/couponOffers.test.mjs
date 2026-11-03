import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { offerLines } from "./couponOffers.js";

describe("offerLines", () => {
  it("describes a capped product discount", () => {
    assert.deepEqual(
      offerLines({ kind: "products", discountType: "percentage", discountValue: 50, maxDiscount: 80 }),
      { title: "On this product", subtitle: "Get 50% off", note: "Up to ₹80" }
    );
  });

  it("leads with the minimum order when there is one", () => {
    assert.deepEqual(
      offerLines({ kind: "order", discountType: "fixed", discountValue: 200, minOrderAmount: 1999 }),
      { title: "Orders above ₹1,999", subtitle: "Get ₹200 off", note: null }
    );
  });

  it("describes buy X get Y", () => {
    assert.deepEqual(
      offerLines({ kind: "bxgy", buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 }),
      { title: "Buy 2", subtitle: "Get 1 free", note: null }
    );
    assert.equal(
      offerLines({ kind: "bxgy", buyQuantity: 3, getQuantity: 1, getDiscountPercent: 50 }).subtitle,
      "Get 1 at 50% off"
    );
  });

  it("has a plain sitewide line and ignores a cap on fixed amounts", () => {
    assert.deepEqual(
      offerLines({ discountType: "fixed", discountValue: 100, maxDiscount: 50 }),
      { title: "On your order", subtitle: "Get ₹100 off", note: null }
    );
  });
});
