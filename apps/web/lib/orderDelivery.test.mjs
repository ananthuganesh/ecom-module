import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canMarkDelivered, isOrderDelivered, markDeliveredConfirmText } from "./orderDelivery.js";

const paid = { status: "shipped", paymentStatus: "paid", shippingStatus: "In Transit" };

describe("canMarkDelivered", () => {
  it("offers it for paid orders still on the way", () => {
    assert.equal(canMarkDelivered(paid), true);
    assert.equal(
      canMarkDelivered({ status: "processing", awb: "D1", transactionDetails: { paymentStatus: "paid" } }),
      true
    );
  });

  it("hides it once delivered, however that was recorded", () => {
    assert.equal(canMarkDelivered({ ...paid, status: "delivered" }), false);
    assert.equal(canMarkDelivered({ ...paid, isDelivered: true }), false);
    assert.equal(canMarkDelivered({ ...paid, shippingStatus: "Delivered" }), false);
    assert.equal(isOrderDelivered({ shippingStatus: "Delivered" }), true);
  });

  it("hides it for unpaid, cancelled, abandoned and return orders", () => {
    assert.equal(canMarkDelivered({ ...paid, paymentStatus: "pending" }), false);
    for (const status of ["cancelled", "abandoned", "return requested", "returned"]) {
      assert.equal(canMarkDelivered({ ...paid, status }), false, status);
    }
    assert.equal(canMarkDelivered({ ...paid, shippingStatus: "Returned" }), false);
    assert.equal(canMarkDelivered(null), false);
  });
});

describe("canMarkDelivered before fulfilment", () => {
  it("hides it until the order is fulfilled", () => {
    assert.equal(canMarkDelivered({ status: "order placed", paymentStatus: "paid" }), false);
    assert.equal(canMarkDelivered({ status: "processing", paymentStatus: "paid" }), false);
  });

  it("offers it once there is an AWB or the order is packed by hand", () => {
    assert.equal(canMarkDelivered({ status: "order placed", paymentStatus: "paid", awb: "D1" }), true);
    assert.equal(canMarkDelivered({ status: "shipped", paymentStatus: "paid" }), true);
    assert.equal(canMarkDelivered({ status: "out for delivery", paymentStatus: "paid" }), true);
  });
});

describe("markDeliveredConfirmText", () => {
  it("warns that tracking stops when there is an AWB", () => {
    assert.match(markDeliveredConfirmText({ awb: "D1", courier: "DTDC" }), /Tracking with DTDC will stop/);
    assert.doesNotMatch(markDeliveredConfirmText({}), /Tracking/);
  });
});
