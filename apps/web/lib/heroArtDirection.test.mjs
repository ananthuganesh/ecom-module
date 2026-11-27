import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { heroUsesMobileArt } from "./heroArtDirection.js";

describe("heroUsesMobileArt", () => {
  it("is on when every slide has mobile art", () => {
    assert.equal(heroUsesMobileArt([{ src: "/a", mobileSrc: "/am" }, { src: "/b", mobileSrc: "/bm" }]), true);
  });

  it("is off when any slide lacks mobile art", () => {
    assert.equal(heroUsesMobileArt([{ src: "/a", mobileSrc: "/am" }, { src: "/b", mobileSrc: null }]), false);
  });

  it("is off for empty or missing input", () => {
    assert.equal(heroUsesMobileArt([]), false);
    assert.equal(heroUsesMobileArt(undefined), false);
  });
});
