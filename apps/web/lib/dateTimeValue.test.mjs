import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalValue,
  formatLocalValue,
  minuteOptions,
  nowLocalValue,
  parseLocalValue,
} from "./dateTimeValue.js";

test("parse and build round-trip through the 12-hour clock", () => {
  for (const value of ["2026-11-01T00:00", "2026-11-01T09:05", "2026-11-01T12:30", "2026-11-01T23:59"]) {
    const p = parseLocalValue(value);
    assert.equal(buildLocalValue(p.date, p.hour12, p.minute, p.meridiem), value);
  }
  assert.deepEqual(
    (({ hour12, minute, meridiem }) => ({ hour12, minute, meridiem }))(parseLocalValue("2026-11-01T22:05")),
    { hour12: 10, minute: 5, meridiem: "PM" }
  );
  assert.equal(parseLocalValue(""), null);
  assert.equal(buildLocalValue(null, 10, 0, "AM"), "");
});

test("12 AM is midnight and 12 PM is noon", () => {
  const day = new Date(2026, 10, 1);
  assert.equal(buildLocalValue(day, 12, 0, "AM"), "2026-11-01T00:00");
  assert.equal(buildLocalValue(day, 12, 0, "PM"), "2026-11-01T12:00");
});

test("nowLocalValue and formatLocalValue", () => {
  assert.equal(nowLocalValue(new Date(2026, 10, 1, 15, 7)), "2026-11-01T15:07");
  const label = formatLocalValue("2026-11-01T15:07");
  assert.match(label, /1 Nov,? 2026/);
  assert.match(label, /3:07 PM$/);
  assert.equal(formatLocalValue(""), "");
});

test("minuteOptions steps by 5 and keeps an existing odd minute", () => {
  assert.equal(minuteOptions().length, 12);
  assert.deepEqual(minuteOptions(7).slice(0, 4), [0, 5, 7, 10]);
});
