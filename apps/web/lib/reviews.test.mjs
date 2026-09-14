import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  productRating,
  ratingBreakdown,
  reviewCountLabel,
  reviewDraftError,
  starSlots,
} from "./reviews.js";

describe("productRating", () => {
  it("is null without reviews", () => {
    assert.equal(productRating({}), null);
    assert.equal(productRating({ ratingAverage: 0, ratingCount: 0 }), null);
  });

  it("rejects an out-of-range average", () => {
    assert.equal(productRating({ ratingAverage: 7, ratingCount: 2 }), null);
  });

  it("rounds to one decimal", () => {
    assert.deepEqual(productRating({ ratingAverage: 4.349, ratingCount: 12 }), {
      average: 4.3,
      count: 12,
    });
  });
});

describe("starSlots", () => {
  it("draws whole and half stars", () => {
    assert.deepEqual(starSlots(4.5), ["full", "full", "full", "full", "half"]);
    assert.deepEqual(starSlots(3.2), ["full", "full", "full", "empty", "empty"]);
    assert.deepEqual(starSlots(3.8), ["full", "full", "full", "full", "empty"]);
  });

  it("clamps nonsense", () => {
    assert.deepEqual(starSlots(-1), Array(5).fill("empty"));
    assert.deepEqual(starSlots(9), Array(5).fill("full"));
    assert.deepEqual(starSlots(undefined), Array(5).fill("empty"));
  });
});

describe("ratingBreakdown", () => {
  it("lists 5 to 1 with percentages", () => {
    const rows = ratingBreakdown({ 5: 3, 4: 1 }, 4);
    assert.deepEqual(rows.map((r) => r.star), [5, 4, 3, 2, 1]);
    assert.equal(rows[0].percent, 75);
    assert.equal(rows[1].percent, 25);
    assert.equal(rows[4].percent, 0);
  });

  it("handles no reviews", () => {
    assert.equal(ratingBreakdown({}, 0)[0].percent, 0);
  });
});

describe("reviewCountLabel", () => {
  it("pluralises", () => {
    assert.equal(reviewCountLabel(1), "1 review");
    assert.equal(reviewCountLabel(1200), "1,200 reviews");
  });
});

describe("reviewDraftError", () => {
  it("needs a star rating", () => {
    assert.match(reviewDraftError({}), /star/);
    assert.match(reviewDraftError({ rating: 4.5 }), /star/);
  });

  it("enforces lengths", () => {
    assert.match(reviewDraftError({ rating: 5, title: "x".repeat(121) }), /Title/);
    assert.match(reviewDraftError({ rating: 5, body: "x".repeat(2001) }), /Review/);
  });

  it("passes a good draft", () => {
    assert.equal(reviewDraftError({ rating: 5, title: "Solid", body: "Great" }), null);
  });
});
