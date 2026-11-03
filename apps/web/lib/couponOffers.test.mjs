import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { offerLines } from "./couponOffers.js";

describe("offerLines", () => {
  it("describes a product discount without its cap", () => {
    assert.deepEqual(
      offerLines({ kind: "products", discountType: "percentage", discountValue: 50, maxDiscount: 80 }),
      { title: "On this product", subtitle: "Get 50% off" }
    );
  });

  it("does not show the minimum order", () => {
    assert.deepEqual(
      offerLines({ kind: "order", discountType: "fixed", discountValue: 200, minOrderAmount: 799 }),
      { title: "On your order", subtitle: "Get ₹200 off" }
    );
  });

  it("describes buy X get Y", () => {
    assert.deepEqual(
      offerLines({ kind: "bxgy", buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 }),
      { title: "Buy 2", subtitle: "Get 1 free" }
    );
    assert.equal(
      offerLines({ kind: "bxgy", buyQuantity: 3, getQuantity: 1, getDiscountPercent: 50 }).subtitle,
      "Get 1 at 50% off"
    );
  });
});
