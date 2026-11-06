import { test } from "node:test";
import assert from "node:assert/strict";

import { getColorHex, isLightColor } from "../utils/colorSwatch.js";

const FALLBACK = "#e5e7eb";

test("every colour in the shop filter gets a real swatch, not the grey fallback", () => {
  for (const name of ["Black", "Burgundy", "Denim", "Lavender", "Off-White", "Orange", "Purple", "Red", "White"]) {
    assert.notEqual(getColorHex(name), FALLBACK, name);
  }
});

test("names are matched loosely", () => {
  assert.equal(getColorHex("off_white"), getColorHex("Off White"));
  assert.equal(getColorHex("  OFF-WHITE "), getColorHex("off white"));
  assert.equal(getColorHex("Dark Burgundy"), getColorHex("burgundy"));
  assert.equal(getColorHex("Acid Wash Denim"), getColorHex("denim"));
  assert.equal(getColorHex("Navy Blue"), getColorHex("navy"));
});

test("unknown or empty names fall back to light grey", () => {
  assert.equal(getColorHex("Unicorn Sparkle"), FALLBACK);
  assert.equal(getColorHex(""), FALLBACK);
  assert.equal(getColorHex(null), FALLBACK);
});

test("light swatches are flagged so they get a visible edge", () => {
  assert.equal(isLightColor(getColorHex("White")), true);
  assert.equal(isLightColor(getColorHex("Off-White")), true);
  assert.equal(isLightColor(getColorHex("Black")), false);
  assert.equal(isLightColor(getColorHex("Lavender")), false);
  assert.equal(isLightColor("not a colour"), false);
});
