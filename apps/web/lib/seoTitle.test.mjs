import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitTitle } from "./seoTitle.js";

describe("fitTitle", () => {
  it("leaves short titles alone", () => {
    assert.equal(fitTitle("Mandala | Urban Aana"), "Mandala | Urban Aana");
  });

  it("drops the middle segment when too long", () => {
    assert.equal(
      fitTitle("Indian Elephant Oversized T-Shirt | Cotton Graphic Tee | Urban Aana"),
      "Indian Elephant Oversized T-Shirt | Urban Aana"
    );
  });

  it("drops the brand if name + brand is still too long, and never cuts mid-word", () => {
    const long = "An Extremely Long Product Name That Keeps Going On And On Forever | Urban Aana";
    const out = fitTitle(long);
    assert.ok(out.length <= 60);
    assert.ok(!out.endsWith(" "));
    assert.ok("An Extremely Long Product Name That Keeps Going On And On Forever".startsWith(out));
  });
});
