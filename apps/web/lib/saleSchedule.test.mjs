import assert from "node:assert/strict";
import test from "node:test";

import {
  countdownParts,
  formatClock,
  showLiveCountdown,
  fromDateTimeLocal,
  saleCountdownTarget,
  percentOff,
  salePayload,
  saleStatus,
  toDateTimeLocal,
} from "./saleSchedule.js";

test("local datetime round-trips through the API's UTC strings", () => {
  const local = "2026-11-01T18:30";
  const iso = fromDateTimeLocal(local);
  assert.equal(toDateTimeLocal(iso), local);
  // Naive API datetimes are read as UTC.
  assert.equal(toDateTimeLocal(iso.replace("Z", "").replace(/\.\d+$/, "")), local);
  assert.equal(fromDateTimeLocal(""), null);
  assert.equal(toDateTimeLocal(null), "");
});

test("salePayload clears on empty or invalid price", () => {
  assert.equal(salePayload({ price: "" }), null);
  assert.equal(salePayload({ price: "0" }), null);
  assert.deepEqual(salePayload({ price: "949.50", startsAt: "", endsAt: "" }), {
    price: 949.5,
    startsAt: null,
    endsAt: null,
    dailyStart: null,
    dailyEnd: null,
  });
  // A half-filled daily window is dropped rather than sent.
  assert.equal(salePayload({ price: "949", dailyStart: "10:00" }).dailyStart, null);
  assert.equal(salePayload({ price: "949", dailyStart: "10:00", dailyEnd: "16:00" }).dailyEnd, "16:00");
});

test("saleStatus reads live, scheduled and ended sales", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  assert.equal(saleStatus(null, now), null);
  assert.equal(saleStatus({ price: 949, live: true }, now), "live");
  assert.equal(saleStatus({ price: 949, endsAt: "2026-11-01T00:00:00Z" }, now), "ended");
  assert.equal(saleStatus({ price: 949, startsAt: "2026-11-05T00:00:00Z" }, now), "scheduled");
});

test("percentOff rounds and ignores price rises", () => {
  assert.equal(percentOff(1899, 949), 50);
  assert.equal(percentOff(1199, 1299), 0);
  assert.equal(percentOff(0, 100), 0);
});

test("countdownParts splits the time left and stops at the end", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  assert.deepEqual(countdownParts("2026-11-03T03:04:05Z", now), {
    days: 2,
    hours: 3,
    minutes: 4,
    seconds: 5,
    ms: ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000,
  });
  assert.equal(countdownParts("2026-11-01T00:00:00Z", now), null);
  assert.equal(countdownParts(null, now), null);
});

test("countdown targets today's window close before the sale end", () => {
  assert.equal(
    saleCountdownTarget({ liveUntil: "2026-11-01T10:30:00Z", endsAt: "2026-11-15T00:00:00Z" }),
    "2026-11-01T10:30:00Z"
  );
  assert.equal(saleCountdownTarget({ endsAt: "2026-11-15T00:00:00Z" }), "2026-11-15T00:00:00Z");
  assert.equal(saleCountdownTarget({}), null);
});

test("formatClock reads 24h times as 12h", () => {
  assert.equal(formatClock("10:00"), "10:00 AM");
  assert.equal(formatClock("16:30"), "4:30 PM");
  assert.equal(formatClock("00:15"), "12:15 AM");
  assert.equal(formatClock(""), "");
});

test("the live timer only shows in the final 24 hours", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(showLiveCountdown(countdownParts("2026-11-13T00:00:00Z", now)), false);
  assert.equal(showLiveCountdown(countdownParts("2026-11-01T23:59:00Z", now)), true);
  assert.equal(showLiveCountdown(null), false);
});
