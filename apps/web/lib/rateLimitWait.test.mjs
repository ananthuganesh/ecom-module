import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatWait, retryAfterSeconds } from "./rateLimitWait.js";

describe("retryAfterSeconds", () => {
  it("reads Retry-After from a 429", () => {
    assert.equal(retryAfterSeconds({ response: { status: 429, headers: { "retry-after": "760" } } }), 760);
  });

  it("falls back to a minute when the header is missing", () => {
    assert.equal(retryAfterSeconds({ response: { status: 429, headers: {} } }), 60);
  });

  it("is 0 for anything that isn't a rate limit", () => {
    assert.equal(retryAfterSeconds({ response: { status: 400 } }), 0);
    assert.equal(retryAfterSeconds(new Error("offline")), 0);
    assert.equal(retryAfterSeconds(null), 0);
  });
});

describe("formatWait", () => {
  it("shows seconds under a minute and m:ss above", () => {
    assert.equal(formatWait(45), "45s");
    assert.equal(formatWait(760), "12:40");
    assert.equal(formatWait(60), "1:00");
    assert.equal(formatWait(-5), "0s");
  });
});
