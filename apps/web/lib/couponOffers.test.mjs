import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { offerLines } from "./couponOffers.js";

describe("offerLines", () => {
  it("describes a product discount without its cap", () => {
    const lines = offerLines({ kind: "products", discountType: "percentage", discountValue: 50, maxDiscount: 80 });
    assert.deepEqual([lines.title, lines.subtitle], ["On this product", "Get 50% off"]);
  });

  it("does not show the minimum order", () => {
    const lines = offerLines({ kind: "order", discountType: "fixed", discountValue: 200, minOrderAmount: 799 });
    assert.deepEqual([lines.title, lines.subtitle], ["On your order", "Get ₹200 off"]);
  });

  it("describes buy X get Y", () => {
    const lines = offerLines({ kind: "bxgy", buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 });
    assert.deepEqual([lines.title, lines.subtitle], ["Buy 2", "Get 1 free"]);
    assert.equal(
      offerLines({ kind: "bxgy", buyQuantity: 3, getQuantity: 1, getDiscountPercent: 50 }).subtitle,
      "Get 1 at 50% off"
    );
  });
});

describe("offerLines for automatic and newer offers", () => {
  it("says an automatic discount applies at checkout and never shows a code", () => {
    const lines = offerLines({ automatic: true, code: null, title: "Tee week", kind: "products", discountValue: 20 });
    assert.equal(lines.footer, "Applied at checkout");
    assert.equal(lines.subtitle, "Get 20% off");
  });

  it("shows the code for a code offer", () => {
    assert.equal(offerLines({ code: "SAVE10", kind: "order", discountValue: 10 }).footer, "Code: SAVE10");
  });

  it("describes free shipping, spend-based and amount-off Buy X get Y, and fixed off each", () => {
    assert.equal(offerLines({ kind: "shipping", automatic: true, title: "Free over ₹999" }).subtitle, "Free shipping");
    assert.deepEqual(
      (({ title, subtitle }) => [title, subtitle])(
        offerLines({ kind: "bxgy", buyRequirement: "amount", buyAmount: 2000, getQuantity: 1, getValueType: "amount", getAmountOff: 150 })
      ),
      ["Spend ₹2,000", "Get 1 at ₹150 off"]
    );
    assert.equal(
      offerLines({ kind: "products", discountType: "fixed", discountValue: 100, oncePerOrder: false }).subtitle,
      "Get ₹100 off each"
    );
  });
});
