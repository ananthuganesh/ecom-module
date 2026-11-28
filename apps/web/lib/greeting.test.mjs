import { test } from "node:test";
import assert from "node:assert/strict";

import { greeting, greetingForHour, greetingName } from "./greeting.js";

test("greeting changes with the time of day", () => {
  assert.equal(greetingForHour(5), "Good morning");
  assert.equal(greetingForHour(11), "Good morning");
  assert.equal(greetingForHour(12), "Good afternoon");
  assert.equal(greetingForHour(16), "Good afternoon");
  assert.equal(greetingForHour(17), "Good evening");
  assert.equal(greetingForHour(2), "Good evening");
});

test("greets by full name, falling back to first + last, then email", () => {
  assert.equal(greetingName({ firstName: "Urban", name: "Urban Aana" }), "Urban Aana");
  assert.equal(greetingName({ name: "  Priya   Nair " }), "Priya Nair");
  assert.equal(greetingName({ firstName: "Ananthu", lastName: "Ganesh" }), "Ananthu Ganesh");
  assert.equal(greetingName({ email: "orders@urbanaana.com" }), "orders");
  assert.equal(greetingName(null), "");
});

test("full greeting", () => {
  const morning = new Date(2026, 10, 6, 9, 30);
  assert.equal(greeting({ name: "Urban Aana" }, morning), "Good morning, Urban Aana");
  assert.equal(greeting({}, new Date(2026, 10, 6, 14)), "Good afternoon");
});
