import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initialGalleryImages, isOptimizedImageUrl, orderProductImages } from "./productGallery.js";

const product = {
  thumbnails: ["/a.webp", "/b.webp"],
  variants: [{ size: "S", images: ["/b.webp", "/c.webp"] }, { size: "M", images: ["/d.webp"], isDeleted: true }],
};

describe("product gallery order", () => {
  it("de-duplicates and keeps product media first", () => {
    assert.deepEqual(orderProductImages(product), ["/a.webp", "/b.webp", "/c.webp"]);
  });

  it("moves the selected variant's first photo to the front", () => {
    assert.deepEqual(orderProductImages(product, ["/c.webp"]), ["/c.webp", "/a.webp", "/b.webp"]);
  });

  it("starts from the first variant's photo before a size is picked", () => {
    assert.equal(initialGalleryImages(product)[0], "/b.webp");
  });
});

describe("isOptimizedImageUrl", () => {
  it("matches SafeImage's optimizer rules", () => {
    assert.equal(isOptimizedImageUrl("https://images.urbanaana.com/x.webp"), true);
    assert.equal(isOptimizedImageUrl("/uploads/x.webp"), true);
    assert.equal(isOptimizedImageUrl("https://cdn.example.com/x.webp"), false);
  });
});

import { productImageAlt } from "./productGallery.js";

describe("productImageAlt", () => {
  const base = { title: "Indian Elephant", productType: "Oversized T-shirt" };
  it("names the view from the file name", () => {
    assert.equal(
      productImageAlt({ ...base, url: "https://images.urbanaana.com/p/Indian-Elephant-Back-5f02b2ab.webp", index: 1 }),
      "Indian Elephant Oversized T-shirt – back view"
    );
    assert.equal(
      productImageAlt({ ...base, url: "/p/Indian-Elephant-Front-Closeup-2e15d08b.webp", index: 2 }),
      "Indian Elephant Oversized T-shirt – close-up"
    );
  });

  it("falls back to the photo number", () => {
    assert.equal(productImageAlt({ ...base, url: "/p/07-07db400e.webp", index: 4 }), "Indian Elephant Oversized T-shirt – photo 5");
  });
});
