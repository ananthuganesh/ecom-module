import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProductJsonLd,
  productBreadcrumbJsonLd,
  productJsonLdScript,
} from "./productJsonLd.js";
import { buildBreadcrumbJsonLd, buildOrganizationJsonLd } from "./structuredData.js";

const SIZED = {
  _id: "6aa5418979baf9a158a3227e",
  productId: "GSRGDMXGKR",
  productName: "Luffy - The Onepiece",
  slug: "luffy-the-onepiece",
  category: "T-Shirt",
  description: "<p>Heavy cotton</p>",
  thumbnails: ["https://images.urbanaana.com/a.webp", "https://images.urbanaana.com/b.webp"],
  pricing: { mrp: 1399, sellingPrice: 999 },
  variants: [
    { size: "S", quantity: 8, sku: "GSRGDM-S" },
    { size: "M", quantity: 0, sku: "GSRGDM-M" },
    { size: "L", quantity: 3, sku: "" },
    { size: "XL", quantity: 5, sku: "GSRGDM-XL", isDeleted: true },
  ],
};

describe("buildProductJsonLd", () => {
  it("returns null without a product name", () => {
    assert.equal(buildProductJsonLd(null), null);
    assert.equal(buildProductJsonLd({ slug: "tee" }), null);
  });

  it("describes a sized product as a ProductGroup of size variants", () => {
    const data = buildProductJsonLd(SIZED);
    assert.equal(data["@type"], "ProductGroup");
    assert.equal(data.productGroupID, "GSRGDMXGKR");
    assert.deepEqual(data.variesBy, ["https://schema.org/size"]);
    assert.equal(data.description, "Heavy cotton");
    assert.equal(data.image.length, 2);
    assert.deepEqual(
      data.hasVariant.map((v) => [v.size, v.sku]),
      [
        ["S", "GSRGDM-S"],
        ["M", "GSRGDM-M"],
        ["L", "GSRGDMXGKR-L"], // no saved SKU: derived, never blank
      ]
    );
  });

  it("gives each size its own URL, stock and price", () => {
    const [small, medium] = buildProductJsonLd(SIZED).hasVariant;
    assert.equal(small.url, "https://urbanaana.com/product/luffy-the-onepiece?size=S");
    assert.equal(small.offers.url, small.url);
    assert.equal(small.offers.availability, "https://schema.org/InStock");
    assert.equal(medium.offers.availability, "https://schema.org/OutOfStock");
    assert.equal(small.offers.price, "999.00");
    assert.equal(small.offers.priceCurrency, "INR");
  });

  it("shows MRP as the strikethrough price", () => {
    const spec = buildProductJsonLd(SIZED).hasVariant[0].offers.priceSpecification;
    assert.deepEqual(spec[1], {
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/StrikethroughPrice",
      price: "1399.00",
      priceCurrency: "INR",
    });
  });

  it("omits the strikethrough when MRP isn't higher", () => {
    const data = buildProductJsonLd({ ...SIZED, pricing: { mrp: 999, sellingPrice: 999 } });
    assert.equal("priceSpecification" in data.hasVariant[0].offers, false);
  });

  it("carries shipping and the 3-day return policy on every offer", () => {
    const offer = buildProductJsonLd(SIZED).hasVariant[0].offers;
    assert.equal(offer.shippingDetails.shippingRate.value, 0);
    assert.equal(offer.shippingDetails.shippingDestination.addressCountry, "IN");
    assert.equal(offer.shippingDetails.deliveryTime.transitTime.maxValue, 6);
    assert.equal(offer.hasMerchantReturnPolicy.merchantReturnDays, 3);
    assert.equal(
      offer.hasMerchantReturnPolicy.returnPolicyCategory,
      "https://schema.org/MerchantReturnFiniteReturnWindow"
    );
  });

  it("falls back to a plain Product when there are no sizes", () => {
    const data = buildProductJsonLd({
      productName: "Urban Tee",
      slug: "urban-tee",
      totalStock: 0,
      pricing: { sellingPrice: 1299, offerPrice: 999 },
    });
    assert.equal(data["@type"], "Product");
    assert.equal(data.offers.price, "999.00");
    assert.equal(data.offers.availability, "https://schema.org/OutOfStock");
    assert.equal(data.offers.hasMerchantReturnPolicy.merchantReturnDays, 3);
  });
});

describe("aggregateRating", () => {
  it("is added from published review totals", () => {
    const data = buildProductJsonLd({ ...SIZED, ratingAverage: 4.333, ratingCount: 3 });
    assert.deepEqual(data.aggregateRating, {
      "@type": "AggregateRating",
      ratingValue: "4.3",
      reviewCount: 3,
      bestRating: "5",
      worstRating: "1",
    });
  });

  it("is omitted when there are no reviews", () => {
    assert.equal("aggregateRating" in buildProductJsonLd({ ...SIZED, ratingCount: 0 }), false);
    assert.equal("aggregateRating" in buildProductJsonLd({ productName: "Tee", price: 9 }), false);
  });
});

describe("breadcrumbs", () => {
  it("runs Home › Category › Product", () => {
    const data = productBreadcrumbJsonLd(SIZED);
    assert.deepEqual(
      data.itemListElement.map((i) => [i.position, i.name, i.item]),
      [
        [1, "Home", "https://urbanaana.com"],
        [2, "T-Shirt", "https://urbanaana.com/category/t-shirt"],
        [3, "Luffy - The Onepiece", "https://urbanaana.com/product/luffy-the-onepiece"],
      ]
    );
  });

  it("uses All products when there's no category", () => {
    const data = productBreadcrumbJsonLd({ productName: "Tee", slug: "tee" });
    assert.equal(data.itemListElement[1].item, "https://urbanaana.com/all-products");
  });

  it("needs at least two crumbs", () => {
    assert.equal(buildBreadcrumbJsonLd([{ name: "Home", path: "/" }]), null);
  });
});

describe("organization", () => {
  it("names the store with logo, contact and socials", () => {
    const [store, site] = buildOrganizationJsonLd()["@graph"];
    assert.equal(store["@type"], "OnlineStore");
    assert.equal(store.logo, "https://urbanaana.com/urban/logo.png");
    assert.equal(store.email, "info@urbanaana.com");
    assert.ok(store.sameAs.some((u) => u.includes("instagram.com")));
    assert.equal(store.hasMerchantReturnPolicy.merchantReturnDays, 3);
    assert.equal(site["@type"], "WebSite");
    assert.deepEqual(site.publisher, { "@id": store["@id"] });
  });

  it("links offers to the store as seller", () => {
    const offer = buildProductJsonLd(SIZED).hasVariant[0].offers;
    assert.deepEqual(offer.seller, { "@id": "https://urbanaana.com/#organization" });
  });
});

describe("productJsonLdScript", () => {
  it("escapes script-breaking characters", () => {
    const html = productJsonLdScript({ productName: "Tee a < b", slug: "tee", price: 100 });
    assert.equal(html.includes("< b"), false);
    assert.equal(html.includes("\\u003c"), true);
  });
});
