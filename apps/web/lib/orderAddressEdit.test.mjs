import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lastAddressChange,
  normalizeStateName,
  orderAddressEditState,
  sameState,
  shipmentBooked,
  validateOrderAddressForm,
} from "./orderAddressEdit.js";

const paid = { status: "order placed", paymentStatus: "paid" };

describe("orderAddressEditState", () => {
  it("allows paid orders that aren't booked yet", () => {
    assert.equal(orderAddressEditState(paid, "customer").editable, true);
    assert.equal(orderAddressEditState(paid, "admin").editable, true);
  });

  it("customers need a paid order; staff don't", () => {
    const unpaid = { ...paid, paymentStatus: "pending" };
    assert.match(orderAddressEditState(unpaid, "customer").reason, /paid orders/);
    assert.equal(orderAddressEditState(unpaid, "admin").editable, true);
  });

  it("booked shipment: customer blocked, staff told to cancel it first", () => {
    for (const booked of [
      { ...paid, awb: "D1" },
      { ...paid, transactionDetails: { delhivery: { waybill: "W1" } } },
      { ...paid, transactionDetails: { dtdc: { reference_number: "R1" } } },
    ]) {
      assert.equal(shipmentBooked(booked), true);
      const customer = orderAddressEditState(booked, "customer");
      assert.equal(customer.editable, false);
      assert.equal(customer.code, "booked");
      assert.equal(customer.needsShipmentCancel, false);
      assert.equal(orderAddressEditState(booked, "admin").needsShipmentCancel, true);
    }
  });

  it("nobody can edit once the parcel moves or the order is closed", () => {
    for (const order of [
      { ...paid, awb: "D1", shippingStatus: "In Transit" },
      { ...paid, shippingStatus: "Out for Delivery" },
      { ...paid, status: "delivered" },
      { ...paid, isDelivered: true },
      { ...paid, status: "cancelled" },
      { ...paid, status: "return requested" },
    ]) {
      const state = orderAddressEditState(order, "admin");
      assert.equal(state.editable, false, JSON.stringify(order));
      assert.equal(state.needsShipmentCancel, false);
    }
  });

  it("a cancelled shipment (AWB cleared) can be edited again", () => {
    assert.equal(orderAddressEditState({ ...paid, shippingStatus: "Cancelled" }, "admin").editable, true);
  });
});

describe("sameState", () => {
  it("matches loosely and treats unknown as a match (the API decides)", () => {
    assert.equal(normalizeStateName("Jammu & Kashmir"), "jammuandkashmir");
    assert.equal(sameState("Tamil Nadu", "tamil nadu"), true);
    assert.equal(sameState("Karnataka", "Kerala"), false);
    assert.equal(sameState("", "Kerala"), true);
  });
});

describe("validateOrderAddressForm", () => {
  const form = { name: "Asha", phone: "9876543210", house: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560038" };
  it("requires a recipient and a courier phone on top of the address rules", () => {
    assert.equal(validateOrderAddressForm(form), "");
    assert.match(validateOrderAddressForm({ ...form, phone: "" }), /10-digit/);
    assert.match(validateOrderAddressForm({ ...form, name: " " }), /recipient/);
    assert.match(validateOrderAddressForm({ ...form, pincode: "1" }), /PIN/);
  });
});

describe("lastAddressChange", () => {
  it("returns the newest log entry", () => {
    assert.equal(lastAddressChange({}), null);
    const order = { transactionDetails: { addressChanges: [{ by: "admin" }, { by: "customer" }] } };
    assert.equal(lastAddressChange(order).by, "customer");
  });
});

import { orderAddressToForm } from "./orderAddressEdit.js";

describe("orderAddressToForm", () => {
  it("joins both street lines and reads checkout key names", () => {
    const form = orderAddressToForm({
      firstName: "Asha",
      lastName: "Rao",
      phone: "+919876543210",
      address: "Flat 4B, Lake View",
      address2: "Near Metro",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560038",
    });
    assert.equal(form.name, "Asha Rao");
    assert.equal(form.phone, "9876543210");
    assert.equal(form.house, "Flat 4B, Lake View, Near Metro");
    assert.equal(form.pincode, "560038");
  });
});
