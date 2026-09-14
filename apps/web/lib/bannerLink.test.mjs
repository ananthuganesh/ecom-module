import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveBannerLink } from "./bannerLink.js";

const SITE = { siteUrl: "https://urbanaana.com" };

describe("resolveBannerLink — site paths", () => {
  it("keeps a leading-slash path", () => {
    assert.deepEqual(resolveBannerLink("/shop", SITE), { href: "/shop", external: false });
  });

  it("adds the slash to a bare path", () => {
    assert.deepEqual(resolveBannerLink("shop", SITE), { href: "/shop", external: false });
    assert.deepEqual(resolveBannerLink("category/tees", SITE), {
      href: "/category/tees",
      external: false,
    });
  });

  it("keeps query strings and hashes", () => {
    assert.deepEqual(resolveBannerLink("/all-products?sort=newest#top", SITE), {
      href: "/all-products?sort=newest#top",
      external: false,
    });
  });

  it("trims surrounding whitespace", () => {
    assert.deepEqual(resolveBannerLink("  /shop  ", SITE), { href: "/shop", external: false });
  });
});

describe("resolveBannerLink — this store's own full URLs", () => {
  it("turns a pasted full URL into an in-app path", () => {
    assert.deepEqual(resolveBannerLink("https://urbanaana.com/shop", SITE), {
      href: "/shop",
      external: false,
    });
  });

  it("treats www as the same store", () => {
    assert.deepEqual(resolveBannerLink("https://www.urbanaana.com/product/x", SITE), {
      href: "/product/x",
      external: false,
    });
  });

  it("maps the bare domain to the homepage", () => {
    assert.deepEqual(resolveBannerLink("https://urbanaana.com", SITE), {
      href: "/",
      external: false,
    });
  });
});

describe("resolveBannerLink — other sites", () => {
  it("marks another domain as external", () => {
    assert.deepEqual(resolveBannerLink("https://instagram.com/urbanaana", SITE), {
      href: "https://instagram.com/urbanaana",
      external: true,
    });
  });

  it("adds https to a www address", () => {
    assert.deepEqual(resolveBannerLink("www.instagram.com/urbanaana", SITE), {
      href: "https://www.instagram.com/urbanaana",
      external: true,
    });
  });

  it("does not confuse a lookalike host with the store", () => {
    const link = resolveBannerLink("https://urbanaana.com.evil.test/x", SITE);
    assert.equal(link.external, true);
  });
});

describe("resolveBannerLink — refuses dangerous links", () => {
  for (const hostile of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.test/phish",
    "mailto:someone@example.com",
  ]) {
    it(`drops ${JSON.stringify(hostile)}`, () => {
      assert.equal(resolveBannerLink(hostile, SITE), null);
    });
  }
});

describe("resolveBannerLink — empty input", () => {
  it("returns null for nothing to link", () => {
    assert.equal(resolveBannerLink("", SITE), null);
    assert.equal(resolveBannerLink("   ", SITE), null);
    assert.equal(resolveBannerLink(null, SITE), null);
    assert.equal(resolveBannerLink(undefined, SITE), null);
  });
});
