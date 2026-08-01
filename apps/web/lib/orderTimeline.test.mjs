import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrderTimeline,
  formatTimelineDayLabel,
  formatTimelineTime,
  formatTouchLabel,
  groupTimelineByDay,
  touchesEqual,
} from "./orderTimeline.js";

describe("formatTouchLabel", () => {
  it("joins source/medium/campaign", () => {
    assert.equal(
      formatTouchLabel({ source: "ig", medium: "cpc", campaign: "summer" }),
      "ig / cpc / summer"
    );
  });
});

describe("touchesEqual", () => {
  it("treats content and term as part of equality", () => {
    const base = {
      source: "ig",
      medium: "cpc",
      campaign: "summer",
      gclid: "g1",
      fbclid: "f1",
    };
    assert.equal(
      touchesEqual(
        { ...base, content: "banner-a", term: "abaya" },
        { ...base, content: "banner-b", term: "abaya" }
      ),
      false
    );
  });
});

describe("buildOrderTimeline", () => {
  it("builds placed → confirmation → payment → DTDC flow", () => {
    const steps = buildOrderTimeline({
      orderNumber: "UA1242",
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-28T18:00:00.000Z",
      customerName: "Ananthu",
      paymentStatus: "paid",
      paymentMethod: "razorpay",
      finalPrice: 1299,
      transactionDetails: {
        paymentStatus: "paid",
        paidAt: "2026-07-26T12:05:00.000Z",
        dtdc: { createdAt: "2026-07-27T10:30:00.000Z", courier_partner: "DTDC" },
      },
      awb: "7X117566894",
      shippingStatus: "In Transit",
      status: "shipped",
    });
    assert.deepEqual(
      steps.map((s) => s.id),
      [
        "order_placed",
        "confirmation",
        "payment",
        "fulfilled",
        "dtdc_awb",
        "dtdc_shipped",
      ]
    );
    assert.equal(
      steps.find((s) => s.id === "confirmation").title,
      "Confirmation #UA1242 was generated for this order."
    );
    assert.equal(steps.find((s) => s.id === "order_placed").title, "Order placed");
    assert.match(steps.find((s) => s.id === "dtdc_awb").title, /DTDC assigned AWB 7X117566894/);
    assert.equal(steps.find((s) => s.id === "dtdc_shipped").title, "DTDC shipped");
  });

  it("includes delivered and refund/cancel when present", () => {
    const steps = buildOrderTimeline({
      orderNumber: "UA100",
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
      paymentStatus: "refunded",
      status: "cancelled",
      awb: "AWB1",
      shippingStatus: "Delivered",
      isDelivered: true,
      deliveredAt: "2026-07-29T00:00:00.000Z",
      refundedAmount: 500,
      transactionDetails: {
        dtdc: { createdAt: "2026-07-27T10:00:00.000Z" },
        refundedAmount: 500,
      },
    });
    const ids = steps.map((s) => s.id);
    assert.ok(ids.includes("dtdc_delivered"));
    assert.ok(ids.includes("cancelled"));
    assert.ok(ids.includes("refund"));
  });

  it("unfulfilled paid order has no DTDC rows", () => {
    const steps = buildOrderTimeline({
      orderNumber: "UA1242",
      createdAt: "2026-07-26T12:00:00.000Z",
      paymentStatus: "paid",
      status: "order placed",
      finalPrice: 100,
    });
    assert.deepEqual(
      steps.map((s) => s.id),
      ["order_placed", "confirmation", "payment"]
    );
  });

  it("orders DTDC lifecycle Delivered → Shipped → AWB → Fulfilled", () => {
    const steps = buildOrderTimeline({
      orderNumber: "UA1",
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-31T20:00:00.000Z",
      paymentStatus: "paid",
      finalPrice: 100,
      transactionDetails: {
        paidAt: "2026-07-26T12:05:00.000Z",
        // missing dtdc.createdAt on purpose — old orders
      },
      awb: "7X117566880",
      courier: "DTDC Express",
      shippingStatus: "Delivered",
      status: "delivered",
      isDelivered: true,
      deliveredAt: "2026-07-30T06:30:00.000Z",
    });
    const groups = groupTimelineByDay(steps, new Date("2026-07-31T12:00:00"));
    const ids = groups.flatMap((g) => g.steps.map((s) => s.id));
    const iDelivered = ids.indexOf("dtdc_delivered");
    const iShipped = ids.indexOf("dtdc_shipped");
    const iAwb = ids.indexOf("dtdc_awb");
    const iFulfilled = ids.indexOf("fulfilled");
    assert.ok(iDelivered < iShipped);
    assert.ok(iShipped < iAwb);
    assert.ok(iAwb < iFulfilled);
  });
});

describe("formatTimelineDayLabel", () => {
  const now = new Date("2026-07-30T12:00:00");

  it("returns Today / Yesterday / month day", () => {
    assert.equal(formatTimelineDayLabel("2026-07-30T09:00:00", now), "Today");
    assert.equal(formatTimelineDayLabel("2026-07-29T09:00:00", now), "Yesterday");
    assert.equal(formatTimelineDayLabel("2026-07-26T09:00:00", now), "July 26");
  });
});

describe("formatTimelineTime", () => {
  it("formats time only", () => {
    const label = formatTimelineTime("2026-07-26T16:25:00.000Z");
    assert.match(label, /^\d{1,2}:\d{2}\s?(AM|PM)$/i);
  });
});

describe("groupTimelineByDay", () => {
  it("groups newest-first by calendar day with labels on groups", () => {
    const groups = groupTimelineByDay(
      [
        { id: "a", title: "A", at: "2026-07-29T21:55:00" },
        { id: "b", title: "B", at: "2026-07-29T21:50:00" },
        { id: "c", title: "C", at: "2026-07-26T21:54:00" },
      ],
      new Date("2026-07-30T12:00:00")
    );
    assert.equal(groups.length, 2);
    assert.equal(groups[0].label, "Yesterday");
    assert.deepEqual(
      groups[0].steps.map((s) => s.id),
      ["a", "b"]
    );
  });

  it("keeps last activity on top using sortAt when display at is missing", () => {
    const groups = groupTimelineByDay(
      [
        { id: "payment", title: "Paid", at: "2026-07-26T12:00:00.000Z" },
        {
          id: "shipped",
          title: "Shipped",
          at: null,
          sortAt: "2026-07-28T18:00:00.000Z",
        },
      ],
      new Date("2026-07-30T12:00:00")
    );
    assert.deepEqual(
      groups.flatMap((g) => g.steps.map((s) => s.id)),
      ["shipped", "payment"]
    );
  });
});
