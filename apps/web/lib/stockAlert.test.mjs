import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isValidAlertEmail, soldOutSizes, stockAlertMessage } from "./stockAlert.js";

describe("soldOutSizes", () => {
  it("keeps only sizes with no stock", () => {
    const sizes = [
      { size: "S", stock: 0 },
      { size: "M", stock: 4 },
      { size: "L", quantity: 0 },
      { size: "XL" },
    ];
    assert.deepEqual(soldOutSizes(sizes), ["S", "L", "XL"]);
  });

  it("is empty when everything is in stock", () => {
    assert.deepEqual(soldOutSizes([{ size: "M", stock: 1 }]), []);
  });
});

describe("isValidAlertEmail", () => {
  it("accepts a normal address", () => {
    assert.equal(isValidAlertEmail(" shopper@example.com "), true);
  });

  for (const bad of ["", "a@b", "@example.com", "no-at.com", null]) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      assert.equal(isValidAlertEmail(bad), false);
    });
  }
});

describe("stockAlertMessage", () => {
  it("confirms a new subscription", () => {
    const msg = stockAlertMessage({ subscribed: true, alreadyWaiting: false }, "S");
    assert.equal(msg.tone, "success");
    assert.match(msg.text, /size S is back/);
  });

  it("says when they're already waiting", () => {
    assert.match(stockAlertMessage({ subscribed: true, alreadyWaiting: true }, "S").text, /already/);
  });

  it("points out a size that is in stock after all", () => {
    assert.equal(stockAlertMessage({ subscribed: false, inStock: true }, "M").tone, "info");
  });

  it("falls back to an error", () => {
    assert.equal(stockAlertMessage(null).tone, "error");
  });
});
