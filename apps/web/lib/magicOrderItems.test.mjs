import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ensureGuestId, toMagicOrderItems } from "./magicOrderItems.js";

describe("toMagicOrderItems", () => {
  it("maps a buy-now line to the API shape", () => {
    const [line] = toMagicOrderItems([
      { _id: "p1", productName: "Mandala", size: "M", price: "999", thumbnails: ["/m.webp"] },
    ]);
    assert.deepEqual(line, { name: "Mandala", qty: 1, image: "/m.webp", price: 999, product: "p1", size: "M", color: "" });
  });
});

describe("ensureGuestId", () => {
  it("creates one id and then reuses it", () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const first = ensureGuestId(storage);
    assert.match(first, /^guest_/);
    assert.equal(ensureGuestId(storage), first);
  });
});
