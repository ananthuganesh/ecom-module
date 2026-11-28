import { describe, it } from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = globalThis.localStorage || {
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

const { persistableCustomer, stripAuthToken } = await import("./persistAuth.js");

const PROFILE = {
  _id: "66aa11bb22cc33dd44ee55ff",
  name: "Arjun Menon",
  firstName: "Arjun",
  lastName: "Menon",
  email: "arjun@example.com",
  phone: "9876543210",
  addresses: [{ line1: "4/985 Riz Tower", pincode: "695581" }],
  token: "eyJhbGciOiJIUzI1NiJ9.secret",
};

describe("persistableCustomer", () => {
  it("keeps only what the header needs", () => {
    assert.deepEqual(persistableCustomer(PROFILE), {
      authenticated: true,
      _id: PROFILE._id,
      name: "Arjun Menon",
      firstName: "Arjun",
      lastName: "Menon",
    });
  });

  it("never writes contact details or the token", () => {
    const stored = JSON.stringify(persistableCustomer(PROFILE));
    for (const secret of ["arjun@example.com", "9876543210", "Riz Tower", "eyJ"]) {
      assert.equal(stored.includes(secret), false, secret);
    }
  });

  it("passes signed-out state through", () => {
    assert.equal(persistableCustomer(null), null);
  });
});

describe("stripAuthToken", () => {
  it("removes the token but keeps the in-memory profile", () => {
    const out = stripAuthToken(PROFILE);
    assert.equal("token" in out, false);
    assert.equal(out.email, "arjun@example.com");
  });
});
