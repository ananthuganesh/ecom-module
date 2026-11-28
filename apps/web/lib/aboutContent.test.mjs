import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ABOUT_DESCRIPTION, ABOUT_FAQ, ABOUT_TITLE, FOUNDER_PROFILES, SHOP_WITH_CONFIDENCE, aboutJsonLd, initials } from "./aboutContent.js";

describe("about page content", () => {
  it("keeps title and description within search-result limits", () => {
    // The chosen title matches the H1 (63 chars); Google may trim the last few on narrow results.
    assert.ok(ABOUT_TITLE.length <= 65, `${ABOUT_TITLE.length}`);
    assert.ok(ABOUT_DESCRIPTION.length <= 160, `${ABOUT_DESCRIPTION.length}`);
  });

  it("never publishes the doc's unconfirmed [placeholders]", () => {
    const texts = [];
    const walk = (v) => {
      if (typeof v === "string") texts.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk([ABOUT_TITLE, ABOUT_DESCRIPTION, ABOUT_FAQ, SHOP_WITH_CONFIDENCE, aboutJsonLd("https://urbanaana.com")]);
    for (const t of texts) assert.ok(!t.includes("["), t);
  });

  it("builds Organization and FAQPage data", () => {
    const [org, faq] = aboutJsonLd("https://urbanaana.com");
    assert.equal(org["@type"], "Organization");
    assert.equal(org.founder.length, 3);
    assert.equal(faq["@type"], "FAQPage");
    assert.equal(faq.mainEntity.length, ABOUT_FAQ.length);
  });
});

describe("founder cards", () => {
  it("lists the three founders with initials for the placeholder", () => {
    assert.deepEqual(FOUNDER_PROFILES.map((f) => f.name), ["Vipin VS", "Amal V", "Akarsh U"]);
    assert.deepEqual(FOUNDER_PROFILES.map((f) => initials(f.name)), ["VV", "AV", "AU"]);
  });
});

describe("about page wording", () => {
  it("doesn't call the brand premium", () => {
    assert.doesNotMatch(JSON.stringify([ABOUT_TITLE, ABOUT_DESCRIPTION, ABOUT_FAQ, aboutJsonLd("https://urbanaana.com")]), /premium/i);
  });
});
