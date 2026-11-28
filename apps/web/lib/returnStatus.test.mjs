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

describe("return refunds in the timeline", () => {
  it("shows the refund with amount and Razorpay id", () => {
    const steps = returnTimelineSteps({
      returns: [
        {
          number: "RR-202609-00001",
          status: "received",
          requestedAt: "2026-09-18T05:34:03Z",
          receivedAt: "2026-09-22T08:00:00Z",
          refundStatus: "refunded",
          refundedAmount: 1199,
          refundedAt: "2026-09-22T09:00:00Z",
          refundId: "rfnd_ABC",
        },
      ],
    });
    const refund = steps.find((s) => s.type === "refund");
    assert.equal(refund.title, "Refund ₹1,199 issued for return RR-202609-00001");
    assert.equal(refund.subtitle, "Razorpay · rfnd_ABC");
  });

  it("flags a failed refund", () => {
    const steps = returnTimelineSteps({
      returns: [
        {
          number: "RR-2",
          status: "received",
          requestedAt: "2026-09-18T05:00:00Z",
          receivedAt: "2026-09-19T05:00:00Z",
          refundStatus: "failed",
          refundError: "BAD_REQUEST_ERROR",
        },
      ],
    });
    assert.equal(steps.at(-1).title, "Refund for return RR-2 failed");
  });
});

describe("order timeline with a return refund", () => {
  it("shows the return refund once, not also as a generic refund", async () => {
    const { buildOrderTimeline } = await import("./orderTimeline.js");
    const steps = buildOrderTimeline({
      _id: "o1",
      orderNumber: "UA1586",
      createdAt: "2026-09-12T13:13:15Z",
      paymentStatus: "partially_refunded",
      finalPrice: 2398,
      transactionDetails: {
        paymentStatus: "partially_refunded",
        refundedAmount: 1199,
        refundedAt: "2026-09-22T09:00:00Z",
        refunds: [{ id: "rfnd_ABC", amount: 1199, returnNumber: "RR-202609-00001" }],
      },
      returns: [
        {
          number: "RR-202609-00001",
          status: "received",
          requestedAt: "2026-09-18T05:34:03Z",
          receivedAt: "2026-09-22T08:00:00Z",
          refundStatus: "refunded",
          refundedAmount: 1199,
          refundedAt: "2026-09-22T09:00:00Z",
          refundId: "rfnd_ABC",
        },
      ],
    });
    const refundSteps = steps.filter((s) => s.type === "refund");
    assert.equal(refundSteps.length, 1);
    assert.match(refundSteps[0].title, /RR-202609-00001/);
  });
});
