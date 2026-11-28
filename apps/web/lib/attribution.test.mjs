import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTouchFromLocation,
  applyTouchToState,
  FIRST_TOUCH_TTL_MS,
} from "./attribution.js";

describe("parseTouchFromLocation", () => {
  it("returns null without utm or click ids", () => {
    assert.equal(
      parseTouchFromLocation({ search: "", pathname: "/shop" }),
      null
    );
  });

  it("parses utm and click ids", () => {
    const t = parseTouchFromLocation({
      search: "?utm_source=ig&utm_medium=cpc&utm_campaign=summer&gclid=g1",
      pathname: "/shop",
      nowIso: "2026-07-26T00:00:00.000Z",
    });
    assert.equal(t.source, "ig");
    assert.equal(t.medium, "cpc");
    assert.equal(t.campaign, "summer");
    assert.equal(t.gclid, "g1");
    assert.equal(t.landingPath, "/shop?utm_source=ig&utm_medium=cpc&utm_campaign=summer&gclid=g1");
    assert.equal(t.landedAt, "2026-07-26T00:00:00.000Z");
  });

  it("keeps only attribution params in landingPath", () => {
    const t = parseTouchFromLocation({
      search: "?utm_source=ig&token=secret&utm_campaign=summer&email=user@example.com",
      pathname: "/shop",
      nowIso: "2026-07-26T00:00:00.000Z",
    });
    assert.equal(t.source, "ig");
    assert.equal(t.campaign, "summer");
    assert.equal(t.landingPath, "/shop?utm_source=ig&utm_campaign=summer");
    assert.ok(!t.landingPath.includes("token="));
    assert.ok(!t.landingPath.includes("email="));
  });

  it("attaches referrer when a touch is captured", () => {
    const t = parseTouchFromLocation({
      search: "?utm_source=ig",
      pathname: "/shop",
      referrer: "https://instagram.com/",
      nowIso: "2026-07-26T00:00:00.000Z",
    });
    assert.equal(t.referrer, "https://instagram.com/");
  });
});

describe("applyTouchToState", () => {
  it("sets first and last when empty", () => {
    const touch = {
      source: "ig",
      medium: "cpc",
      landedAt: "2026-07-26T00:00:00.000Z",
      landingPath: "/?utm_source=ig",
    };
    const next = applyTouchToState(null, touch, Date.parse(touch.landedAt));
    assert.deepEqual(next.firstTouch, touch);
    assert.deepEqual(next.lastTouch, touch);
  });

  it("keeps first within TTL and updates last", () => {
    const first = {
      source: "ig",
      medium: "cpc",
      landedAt: "2026-07-01T00:00:00.000Z",
      landingPath: "/?utm_source=ig",
    };
    const last = {
      source: "google",
      medium: "cpc",
      landedAt: "2026-07-20T00:00:00.000Z",
      landingPath: "/?utm_source=google",
    };
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    const next = applyTouchToState({ firstTouch: first, lastTouch: first }, last, now);
    assert.equal(next.firstTouch.source, "ig");
    assert.equal(next.lastTouch.source, "google");
  });

  it("resets first when older than TTL", () => {
    const old = {
      source: "old",
      medium: "cpc",
      landedAt: "2026-01-01T00:00:00.000Z",
      landingPath: "/?utm_source=old",
    };
    const neu = {
      source: "new",
      medium: "cpc",
      landedAt: "2026-07-26T00:00:00.000Z",
      landingPath: "/?utm_source=new",
    };
    const now = Date.parse(neu.landedAt);
    assert.ok(now - Date.parse(old.landedAt) > FIRST_TOUCH_TTL_MS);
    const next = applyTouchToState({ firstTouch: old, lastTouch: old }, neu, now);
    assert.equal(next.firstTouch.source, "new");
    assert.equal(next.lastTouch.source, "new");
  });
});
