import assert from "node:assert/strict";
import test from "node:test";

import { collectionSlug, pickableProducts } from "./collectionForm.js";

test("collectionSlug matches the API slug rule", () => {
  assert.equal(collectionSlug("  Kerala Prints & More! "), "kerala-prints-more");
  assert.equal(collectionSlug("T-Shirt"), "t-shirt");
  assert.equal(collectionSlug("!!!"), "");
});

test("pickableProducts skips members and matches every search word", () => {
  const products = [
    { _id: "1", productName: "Mandala Tee", type: "Oversized T-Shirt" },
    { _id: "2", productName: "Elephant Tee", type: "Regular T-Shirt" },
    { _id: "3", productName: "Mandala Hoodie", type: "Hoodie" },
    { productName: "No id" },
  ];
  const ids = (list) => list.map((p) => p._id);

  assert.deepEqual(ids(pickableProducts(products)), ["1", "2", "3"]);
  assert.deepEqual(ids(pickableProducts(products, { query: "mandala" })), ["1", "3"]);
  assert.deepEqual(ids(pickableProducts(products, { query: "mandala oversized" })), ["1"]);
  assert.deepEqual(ids(pickableProducts(products, { excludeIds: ["1"] })), ["2", "3"]);
  assert.deepEqual(ids(pickableProducts(products, { limit: 1 })), ["1"]);
});
