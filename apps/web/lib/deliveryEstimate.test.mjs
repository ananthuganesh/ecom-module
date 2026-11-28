import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_MAX_DAYS,
  DELIVERY_MIN_DAYS,
  estimateDeliveryWindow,
  formatDeliveryDate,
  ordinal,
} from "./deliveryEstimate.js";

describe("ordinal", () => {
  it("uses st/nd/rd for 1, 2, 3", () => {
    assert.equal(ordinal(1), "1st");
    assert.equal(ordinal(2), "2nd");
    assert.equal(ordinal(3), "3rd");
    assert.equal(ordinal(4), "4th");
  });

  it("uses th for the teens, not st/nd/rd", () => {
    assert.equal(ordinal(11), "11th");
    assert.equal(ordinal(12), "12th");
    assert.equal(ordinal(13), "13th");
  });

  it("handles the twenties and thirties", () => {
    assert.equal(ordinal(21), "21st");
    assert.equal(ordinal(22), "22nd");
    assert.equal(ordinal(23), "23rd");
    assert.equal(ordinal(30), "30th");
    assert.equal(ordinal(31), "31st");
  });

  it("returns empty for nonsense", () => {
    assert.equal(ordinal("x"), "");
    assert.equal(ordinal(undefined), "");
  });
});

describe("formatDeliveryDate", () => {
  it("renders weekday, month and ordinal day", () => {
    // 2026-09-10 is a Thursday.
    assert.equal(formatDeliveryDate(new Date(2026, 8, 10)), "Thu, Sep 10th");
    assert.equal(formatDeliveryDate(new Date(2026, 8, 13)), "Sun, Sep 13th");
    assert.equal(formatDeliveryDate(new Date(2026, 0, 1)), "Thu, Jan 1st");
  });

  it("returns empty for an invalid date", () => {
    assert.equal(formatDeliveryDate("not a date"), "");
  });
});

describe("estimateDeliveryWindow", () => {
  it("spans +3 to +6 days from the given date", () => {
    // Opened Mon 2026-09-07 -> Thu 10th to Sun 13th.
    assert.equal(
      estimateDeliveryWindow(new Date(2026, 8, 7)),
      "Thu, Sep 10th - Sun, Sep 13th"
    );
    assert.equal(DELIVERY_MIN_DAYS, 3);
    assert.equal(DELIVERY_MAX_DAYS, 6);
  });

  it("rolls over a month boundary", () => {
    // Opened Mon 2026-09-28 -> Thu Oct 1st to Sun Oct 4th.
    assert.equal(
      estimateDeliveryWindow(new Date(2026, 8, 28)),
      "Thu, Oct 1st - Sun, Oct 4th"
    );
  });

  it("rolls over a year boundary", () => {
    assert.equal(
      estimateDeliveryWindow(new Date(2026, 11, 30)),
      "Sat, Jan 2nd - Tue, Jan 5th"
    );
  });

  it("does not mutate the date it was given", () => {
    const opened = new Date(2026, 8, 7);
    estimateDeliveryWindow(opened);
    assert.equal(opened.getDate(), 7);
  });

  it("returns empty for an invalid date", () => {
    assert.equal(estimateDeliveryWindow("nope"), "");
  });
});
