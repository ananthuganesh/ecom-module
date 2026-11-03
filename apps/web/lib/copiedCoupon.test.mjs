import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COPIED_COUPON_TTL_MS,
  clearCopiedCoupon,
  readCopiedCoupon,
  rememberCopiedCoupon,
} from "./copiedCoupon.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe("copied coupon", () => {
  it("remembers the last copied code, upper-cased", () => {
    const storage = memoryStorage();
    rememberCopiedCoupon("save50", { storage, now: 1000 });
    rememberCopiedCoupon(" fest10 ", { storage, now: 2000 });
    assert.equal(readCopiedCoupon({ storage, now: 3000 }), "FEST10");
  });

  it("forgets it after the TTL and when cleared", () => {
    const storage = memoryStorage();
    rememberCopiedCoupon("SAVE50", { storage, now: 0 });
    assert.equal(readCopiedCoupon({ storage, now: COPIED_COUPON_TTL_MS }), null);

    rememberCopiedCoupon("SAVE50", { storage, now: 0 });
    clearCopiedCoupon({ storage });
    assert.equal(readCopiedCoupon({ storage, now: 1 }), null);
  });

  it("survives missing or broken storage", () => {
    assert.equal(readCopiedCoupon({ storage: null }), null);
    const storage = memoryStorage();
    storage.setItem("urban-aana-copied-coupon", "{not json");
    assert.equal(readCopiedCoupon({ storage }), null);
    rememberCopiedCoupon("", { storage });
    assert.doesNotThrow(() => rememberCopiedCoupon("X", { storage: { setItem() { throw new Error("full"); } } }));
  });
});
