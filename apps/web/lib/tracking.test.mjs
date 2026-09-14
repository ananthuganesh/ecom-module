import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

// tracking.js reads window.dataLayer; give it a minimal browser global.
globalThis.window = globalThis.window || {};
globalThis.sessionStorage = globalThis.sessionStorage || {
  _s: new Map(),
  getItem(k) {
    return this._s.has(k) ? this._s.get(k) : null;
  },
  setItem(k, v) {
    this._s.set(k, String(v));
  },
  removeItem(k) {
    this._s.delete(k);
  },
};

const {
  getTrackingUserId,
  pushEcommerceEvent,
  setTrackingUser,
  trackPurchase,
} = await import("./tracking.js");

function lastEvent() {
  const dl = window.dataLayer;
  for (let i = dl.length - 1; i >= 0; i -= 1) {
    if (dl[i] && dl[i].event) return dl[i];
  }
  return null;
}

beforeEach(() => {
  window.dataLayer = [];
  setTrackingUser(null);
  window.dataLayer = [];
});

describe("setTrackingUser", () => {
  it("pushes the signed-in id", () => {
    setTrackingUser("66aa11bb22cc33dd44ee55ff");
    assert.equal(getTrackingUserId(), "66aa11bb22cc33dd44ee55ff");
    assert.deepEqual(window.dataLayer.at(-1), {
      event: "user_data",
      user_id: "66aa11bb22cc33dd44ee55ff",
    });
  });

  it("pushes an explicit null on sign-out", () => {
    setTrackingUser("abc");
    window.dataLayer = [];
    setTrackingUser(null);
    assert.equal(getTrackingUserId(), null);
    assert.deepEqual(window.dataLayer.at(-1), { event: "user_data", user_id: null });
  });

  it("does not re-push an unchanged id", () => {
    setTrackingUser("abc");
    const before = window.dataLayer.length;
    setTrackingUser("abc");
    assert.equal(window.dataLayer.length, before);
  });
});

describe("ecommerce events carry user_id", () => {
  it("attaches user_id when signed in", () => {
    setTrackingUser("u1");
    pushEcommerceEvent("add_to_cart", { items: [{ _id: "p1", productName: "Tee", price: 499 }] });
    assert.equal(lastEvent().user_id, "u1");
  });

  it("omits user_id for anonymous shoppers", () => {
    pushEcommerceEvent("view_item", { items: [{ _id: "p1", productName: "Tee", price: 499 }] });
    assert.equal("user_id" in lastEvent(), false);
  });

  it("never sends an email as the user id", () => {
    setTrackingUser("u1");
    pushEcommerceEvent("add_to_cart", { items: [] });
    assert.doesNotMatch(JSON.stringify(window.dataLayer), /@/);
  });
});

describe("purchase deduplicates with the server", () => {
  it("sends event_id equal to transaction_id", () => {
    trackPurchase({
      transactionId: "66aa11bb22cc33dd44ee55ff",
      value: 1199,
      items: [{ _id: "p1", productName: "Indian Elephant", price: 1199, qty: 1 }],
    });
    const evt = lastEvent();
    assert.equal(evt.event, "purchase");
    assert.equal(evt.event_id, "66aa11bb22cc33dd44ee55ff");
    assert.equal(evt.ecommerce.transaction_id, "66aa11bb22cc33dd44ee55ff");
    assert.equal(evt.ecommerce.event_id, "66aa11bb22cc33dd44ee55ff");
  });

  it("clears the previous ecommerce object first", () => {
    trackPurchase({ transactionId: "t1", value: 10, items: [] });
    const dl = window.dataLayer;
    assert.deepEqual(dl.at(-2), { ecommerce: null });
  });

  it("is skipped without a transaction id", () => {
    trackPurchase({ value: 10, items: [] });
    assert.equal(window.dataLayer.length, 0);
  });
});

describe("events without an event_id stay unchanged", () => {
  it("does not invent an event_id", () => {
    pushEcommerceEvent("view_cart", { items: [] });
    assert.equal("event_id" in lastEvent(), false);
  });
});
