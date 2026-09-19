import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { activeReturn, returnStatusDisplay, returnTimelineSteps } from "./returnStatus.js";

const DELIVERED = { status: "delivered", shippingStatus: "Delivered", isDelivered: true };

describe("returnStatusDisplay", () => {
  it("is null for a plain delivered order", () => {
    assert.equal(returnStatusDisplay(DELIVERED), null);
  });

  it("shows each return stage instead of Delivered", () => {
    const at = (status) => returnStatusDisplay({ ...DELIVERED, returns: [{ number: "RR-1", status }] });
    assert.equal(at("requested").label, "Return requested");
    assert.equal(at("approved").label, "Return approved");
    assert.equal(at("picked_up").label, "Return in transit");
    assert.equal(at("received").label, "Returned");
  });

  it("falls back to Delivered once a return is rejected", () => {
    assert.equal(
      returnStatusDisplay({ ...DELIVERED, returns: [{ number: "RR-1", status: "rejected" }] }),
      null
    );
  });

  it("uses the newest live return", () => {
    const order = {
      ...DELIVERED,
      returns: [
        { number: "RR-2", status: "approved" },
        { number: "RR-1", status: "received" },
      ],
    };
    assert.equal(activeReturn(order).number, "RR-2");
  });

  it("reads the order status when returns weren't loaded", () => {
    assert.equal(returnStatusDisplay({ status: "return requested" }).label, "Return requested");
  });
});

describe("returnTimelineSteps", () => {
  it("lists request, approval with pickup AWB, pickup and receipt", () => {
    const steps = returnTimelineSteps({
      returns: [
        {
          _id: "r1",
          number: "RR-202609-00001",
          status: "received",
          itemCount: 1,
          reason: "Wrong size",
          refundAmount: 1199,
          awb: "DL123",
          pickupServiceable: true,
          requestedAt: "2026-09-18T05:34:03Z",
          approvedAt: "2026-09-19T08:00:00Z",
          pickedUpAt: "2026-09-20T08:00:00Z",
          receivedAt: "2026-09-22T08:00:00Z",
        },
      ],
    });
    assert.deepEqual(
      steps.map((s) => s.title),
      [
        "Return RR-202609-00001 requested",
        "Return RR-202609-00001 approved",
        "Return RR-202609-00001 picked up",
        "Return RR-202609-00001 received",
      ]
    );
    assert.match(steps[0].subtitle, /Wrong size/);
    assert.match(steps[1].subtitle, /AWB DL123/);
  });

  it("flags a pickup Delhivery can't make", () => {
    const [, approved] = returnTimelineSteps({
      returns: [
        {
          number: "RR-2",
          status: "approved",
          requestedAt: "2026-09-18T05:00:00Z",
          approvedAt: "2026-09-19T05:00:00Z",
          pickupServiceable: false,
        },
      ],
    });
    assert.equal(approved.tone, "critical");
    assert.match(approved.subtitle, /manually/);
  });

  it("shows a rejection with its reason", () => {
    const steps = returnTimelineSteps({
      returns: [
        {
          number: "RR-3",
          status: "rejected",
          requestedAt: "2026-09-18T05:00:00Z",
          rejectedAt: "2026-09-19T05:00:00Z",
          rejectionReason: "Worn",
        },
      ],
    });
    assert.equal(steps[1].title, "Return RR-3 rejected");
    assert.equal(steps[1].subtitle, "Worn");
  });
});
