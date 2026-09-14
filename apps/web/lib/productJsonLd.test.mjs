import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProductJsonLd, productJsonLdScript } from "./productJsonLd.js";

describe("buildProductJsonLd", () => {
  it("returns null without a product name", () => {
    assert.equal(buildProductJsonLd(null), null);
    assert.equal(buildProductJsonLd({ slug: "tee" }), null);
  });

  it("emits Product + Offer with INR price and stock", () => {
    const data = buildProductJsonLd({
      productName: "Urban Tee",
      slug: "urban-tee",
      description: "<p>Soft cotton</p>",
      totalStock: 4,
      pricing: { sellingPrice: 1299, offerPrice: 999 },
    });
    assert.equal(data["@type"], "Product");
    assert.equal(data.name, "Urban Tee");
    assert.equal(data.offers.priceCurrency, "INR");
    assert.equal(data.offers.price, "999.00");
    assert.equal(data.offers.availability, "https://schema.org/InStock");
    assert.equal(data.brand.name, "Urban Aana");
    assert.equal(data.description, "Soft cotton");
  });

  it("marks out of stock when totalStock is 0", () => {
    const data = buildProductJsonLd({
      name: "Sold Tee",
      slug: "sold",
      totalStock: 0,
      price: 500,
    });
    assert.equal(data.offers.availability, "https://schema.org/OutOfStock");
  });
});

describe("aggregateRating", () => {
  it("is added from published review totals", () => {
    const data = buildProductJsonLd({
      productName: "Rated Tee",
      price: 999,
      ratingAverage: 4.333,
      ratingCount: 3,
    });
    assert.deepEqual(data.aggregateRating, {
      "@type": "AggregateRating",
      ratingValue: "4.3",
      reviewCount: 3,
      bestRating: "5",
      worstRating: "1",
    });
  });

  it("is omitted when there are no reviews", () => {
    const data = buildProductJsonLd({ productName: "New Tee", price: 999, ratingCount: 0 });
    assert.equal("aggregateRating" in data, false);
  });
});

describe("productJsonLdScript", () => {
  it("escapes script-breaking characters", () => {
    const html = productJsonLdScript({
      productName: "Tee a < b",
      slug: "tee",
      price: 100,
    });
    assert.equal(html.includes("< b"), false);
    assert.equal(html.includes("\\u003c"), true);
  });
});
