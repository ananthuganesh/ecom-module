import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DESCRIPTION_MAX, productMetaDescription } from "./productMeta.js";

const base =
  "Shop Indian Elephant oversized T-shirt from Urban Aana. A bold cotton graphic tee in black and red, designed for a relaxed oversized fit.";

describe("productMetaDescription", () => {
  it("adds sale price, MRP and a call to action within the limit", () => {
    const out = productMetaDescription({ metaDescription: base, pricing: { sellingPrice: 1199, mrp: 1699 } });
    assert.ok(out.endsWith(" Now ₹1,199 (MRP ₹1,699). Shop now."), out);
    assert.ok(out.length <= DESCRIPTION_MAX, `${out.length}`);
    assert.ok(out.startsWith("Shop Indian Elephant"));
    assert.ok(!out.includes("…"), "ends on a whole sentence");
  });

  it("shows just the price when there is no discount", () => {
    const out = productMetaDescription({ metaDescription: "Short copy.", pricing: { sellingPrice: 999 } });
    assert.equal(out, "Short copy. Now ₹999. Shop now.");
  });

  it("keeps an admin description that already has a price", () => {
    assert.equal(productMetaDescription({ metaDescription: "Only ₹999 today.", pricing: { sellingPrice: 999 } }), "Only ₹999 today.");
  });

  it("falls back to stripped product copy", () => {
    const out = productMetaDescription({ description: "<p>Soft <b>cotton</b></p>", pricing: { sellingPrice: 500 } });
    assert.equal(out, "Soft cotton. Now ₹500. Shop now.");
  });
});
