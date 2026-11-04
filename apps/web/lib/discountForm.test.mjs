import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  couponStatus,
  couponSummary,
  detailLines,
  emptyForm,
  formFromCoupon,
  fromLocalParts,
  payloadFromForm,
  randomCode,
  toLocalParts,
  validateForm,
} from "./discountForm.js";

const NOW = new Date("2026-11-04T07:15:00Z");

function filled(kind, extra = {}) {
  return { ...emptyForm(kind, NOW), code: "SAVE10", ...extra };
}

describe("dates", () => {
  it("round-trips local date and time through UTC", () => {
    const iso = fromLocalParts("2026-11-05", "09:30");
    assert.deepEqual(toLocalParts(iso), { date: "2026-11-05", time: "09:30" });
  });

  it("reads naive UTC from the API as UTC", () => {
    assert.deepEqual(toLocalParts("2026-11-05T04:00:00"), toLocalParts("2026-11-05T04:00:00Z"));
  });

  it("is empty for no date", () => {
    assert.equal(fromLocalParts("", "10:00"), null);
    assert.deepEqual(toLocalParts(null), { date: "", time: "" });
  });
});

describe("randomCode", () => {
  it("makes 12 unambiguous characters", () => {
    const code = randomCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{12}$/);
  });
});

describe("validateForm", () => {
  it("asks for the code first", () => {
    assert.equal(validateForm({ ...emptyForm("order", NOW) }), "Enter a discount code.");
  });

  it("needs a value, targets and a sane percentage", () => {
    assert.equal(validateForm(filled("order")), "Enter a discount value.");
    assert.equal(validateForm(filled("order", { discountValue: "120" })), "Percentage must be 1–100.");
    assert.equal(validateForm(filled("products", { discountValue: "10" })), "Select at least one collection.");
    assert.equal(validateForm(filled("products", { discountValue: "10", collectionIds: ["c1"] })), "");
  });

  it("checks the chosen minimum", () => {
    const f = filled("order", { discountValue: "10", minRequirement: "quantity", minQuantity: "0" });
    assert.equal(validateForm(f), "Enter the minimum quantity of items.");
  });

  it("checks Buy X get Y in field order", () => {
    let f = filled("bxgy");
    assert.equal(validateForm(f), "Enter how many items the customer must buy.");
    f = { ...f, buyQuantity: "2" };
    assert.equal(validateForm(f), "Select the products the customer buys.");
    f = { ...f, buyProductIds: ["p1"], getQuantity: "1", getProductIds: ["p2"] };
    assert.equal(validateForm(f), "Enter a percentage between 1 and 100.");
    assert.equal(validateForm({ ...f, getValueType: "free" }), "");
  });

  it("needs customers, limits and an end after the start", () => {
    const base = filled("order", { discountValue: "10" });
    assert.equal(validateForm({ ...base, eligibility: "customers" }), "Select at least one customer.");
    assert.equal(validateForm({ ...base, limitTotal: true }), "Enter the total number of uses.");
    assert.equal(
      validateForm({ ...base, hasEnd: true, endDate: base.startDate, endTime: "00:00", startTime: "10:00" }),
      "End date must be after the start date."
    );
  });
});

describe("payloadFromForm", () => {
  it("sends only the targets for the chosen selection", () => {
    const payload = payloadFromForm(
      filled("products", { discountValue: "15", appliesTo: "collections", collectionIds: ["c1"], productIds: ["p9"] })
    );
    assert.equal(payload.code, "SAVE10");
    assert.equal(payload.name, "SAVE10");
    assert.deepEqual(payload.collectionIds, ["c1"]);
    assert.deepEqual(payload.productIds, []);
    assert.equal(payload.discountValue, 15);
    assert.equal(payload.expiryDate, null);
    assert.equal(payload.usageLimit, null);
  });

  it("maps Buy X get Y value types", () => {
    const f = filled("bxgy", {
      buyQuantity: "2", buyProductIds: ["p1"], getQuantity: "1", getProductIds: ["p2"], getValueType: "free",
      limitUsesPerOrder: true, maxUsesPerOrder: "3",
    });
    const payload = payloadFromForm(f);
    assert.equal(payload.getDiscountPercent, 100);
    assert.equal(payload.maxUsesPerOrder, 3);
    assert.equal(payload.minRequirement, "none");
    assert.equal(payloadFromForm({ ...f, getValueType: "amount", getAmountOff: "150" }).getAmountOff, 150);
  });

  it("keeps a legacy fixed product discount once per order", () => {
    const legacy = formFromCoupon({
      code: "OLD", kind: "products", discountType: "fixed", discountValue: 100, productIds: ["p1"],
    });
    assert.equal(legacy.oncePerOrder, true);
    assert.equal(payloadFromForm(legacy).oncePerOrder, true);
  });
});

describe("formFromCoupon", () => {
  it("reads a coupon saved by the old form", () => {
    const f = formFromCoupon({
      code: "B1G1", kind: "bxgy", buyQuantity: 1, getQuantity: 1, getDiscountPercent: 100,
      buyProductIds: ["p1"], minOrderAmount: 500, usageLimit: 0, expiryDate: "2026-12-01T00:00:00",
    });
    assert.equal(f.getValueType, "free");
    assert.equal(formFromCoupon({ kind: "bxgy", getValueType: "percentage", getDiscountPercent: 100 }).getValueType, "free");
    assert.equal(formFromCoupon({ kind: "bxgy", getValueType: "percentage", getDiscountPercent: 40 }).getValueType, "percentage");
    assert.deepEqual(f.getProductIds, ["p1"]);
    assert.equal(f.minRequirement, "amount");
    assert.equal(f.limitTotal, false);
    assert.equal(f.hasEnd, true);
  });
});

describe("detailLines", () => {
  it("summarises like Shopify's sidebar", () => {
    const lines = detailLines(filled("order", { discountValue: "10" }), NOW);
    assert.deepEqual(lines.slice(0, 5), [
      "10% off entire order",
      "All customers",
      "For Online Store",
      "No minimum purchase requirement",
      "No usage limits",
    ]);
    assert.ok(lines.includes("Can't combine with other discounts"));
    assert.ok(lines.at(-1).startsWith("Active from"));
  });

  it("describes limits and Buy X get Y", () => {
    const lines = detailLines(
      filled("bxgy", {
        buyQuantity: "2", getQuantity: "1", getValueType: "free", limitTotal: true, usageLimit: "100",
        oncePerCustomer: true,
      }),
      NOW
    );
    assert.equal(lines[0], "Buy 2 items, get 1 item free");
    assert.ok(lines.includes("Limit of 100 uses, one use per customer"));
    assert.ok(!lines.some((l) => l.includes("minimum")));
  });
});

describe("couponStatus", () => {
  it("is scheduled, active, expired or used up", () => {
    assert.equal(couponStatus({ startsAt: "2026-11-05T00:00:00" }, NOW).label, "Scheduled");
    assert.equal(couponStatus({ startsAt: "2026-11-01T00:00:00" }, NOW).label, "Active");
    assert.equal(couponStatus({ expiryDate: "2026-11-01T00:00:00" }, NOW).label, "Expired");
    assert.equal(couponStatus({ usageLimit: 5, usedCount: 5 }, NOW).label, "Used up");
    assert.equal(couponStatus({ status: "inactive" }, NOW).label, "Inactive");
  });
});

describe("couponSummary", () => {
  it("reads saved coupons", () => {
    assert.equal(couponSummary({ kind: "order", discountType: "fixed", discountValue: 200 }), "₹200 off entire order");
    assert.equal(
      couponSummary({ kind: "products", discountValue: 10, appliesTo: "collections", collectionIds: ["a", "b"] }),
      "10% off 2 collections"
    );
  });
});
