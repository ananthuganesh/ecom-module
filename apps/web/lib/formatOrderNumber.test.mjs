import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatOrderNumber } from "../utils/formatOrderNumber.js";

describe("formatOrderNumber", () => {
  it("shows the UA number with a single #", () => {
    assert.equal(formatOrderNumber({ orderNumber: "UA1597" }), "#UA1597");
    assert.equal(formatOrderNumber({ orderNumber: "#UA1597" }), "#UA1597");
  });

  it("labels an unpaid checkout instead of faking a number", () => {
    assert.equal(
      formatOrderNumber({ _id: "6aa8131ecf0293783c2c868b", orderNumber: null }),
      "Unpaid · 2C868B"
    );
  });

  it("is null without anything to show", () => {
    assert.equal(formatOrderNumber({}), null);
  });
});
