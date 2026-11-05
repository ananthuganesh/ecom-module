import { test } from "node:test";
import assert from "node:assert/strict";

import { courierUpdateText, pickupSummary } from "./shipmentPickup.js";

const delhivery = (extra = {}, status = "Ready To Ship") => ({
  carrier: "delhivery",
  awb: "63413910000066",
  shippingStatus: status,
  transactionDetails: { delhivery: { waybill: "63413910000066", ...extra } },
});

test("flags a Delhivery shipment with no pickup request", () => {
  const s = pickupSummary(delhivery());
  assert.equal(s.problem, true);
  assert.match(s.text, /No pickup requested/);
});

test("shows the scheduled pickup day and time", () => {
  const s = pickupSummary(delhivery({ pickup: { date: "2026-11-06", time: "14:00:00", id: "987" } }));
  assert.equal(s.problem, false);
  assert.match(s.text, /6 Nov/);
  assert.match(s.text, /14:00/);
  assert.match(s.text, /#987/);
});

test("surfaces a failed pickup request", () => {
  const s = pickupSummary(delhivery({ pickup: { date: "2026-11-06", error: "Invalid pickup date" } }));
  assert.equal(s.problem, true);
  assert.match(s.text, /Invalid pickup date/);
});

test("no pickup line once the parcel has moved, or for DTDC", () => {
  assert.equal(pickupSummary(delhivery({}, "In Transit")), null);
  assert.equal(pickupSummary({ carrier: "dtdc", awb: "7X1", shippingStatus: "Ready To Ship" }), null);
});

test("courier update joins status, remark and location", () => {
  const order = delhivery({
    lastScan: {
      status: "Not Picked",
      remark: "Shipment not received from client",
      location: "Kazhakkoottam_Rdiosttn_D (Kerala)",
    },
  });
  assert.equal(
    courierUpdateText(order),
    "Not Picked — Shipment not received from client (Kazhakkoottam Rdiosttn D (Kerala))"
  );
  const dtdc = {
    carrier: "dtdc",
    transactionDetails: {
      dtdc: { lastScan: { status: "Reached At Hub", remark: "RECEIVER NOT AVAILABLE", location: "AVANAVANCHERY" } },
    },
  };
  assert.equal(courierUpdateText(dtdc), "Reached At Hub — RECEIVER NOT AVAILABLE (AVANAVANCHERY)");
  assert.equal(courierUpdateText({}), "");
});
