import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeRelated, relatedQueries } from "./relatedProducts.js";

describe("related products", () => {
  it("merges lists in order, skipping the product itself and repeats", () => {
    const out = mergeRelated("a", [[{ _id: "a" }, { _id: "b" }], [{ _id: "b" }, { _id: "c" }]]);
    assert.deepEqual(out.map((p) => p._id), ["b", "c"]);
  });

  it("queries group, then category, then newest", () => {
    assert.deepEqual(relatedQueries({ product: "T-Shirt", category: { name: "Tees" } }), [
      { product: "T-Shirt", pageSize: 12 },
      { category: "Tees", pageSize: 12 },
      { pageSize: 12 },
    ]);
    assert.deepEqual(relatedQueries({}), [{ pageSize: 12 }]);
  });
});
