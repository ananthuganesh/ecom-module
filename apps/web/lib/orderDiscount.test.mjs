import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateDiscount,
  discountLabel,
  orderCouponCode,
  orderDiscountAmount,
} from "./orderDiscount.js";

describe("orderCouponCode", () => {
  it("reads the coupon the order was placed with", () => {
    assert.equal(orderCouponCode({ couponCode: "save80" }), "SAVE80");
  });

  it("falls back to the Magic Checkout promotion", () => {
    assert.equal(
      orderCouponCode({ transactionDetails: { magicPromotion: { code: "AANA10" } } }),
      "AANA10"
    );
  });

  it("is empty when no coupon was used", () => {
    assert.equal(orderCouponCode({}), "");
    assert.equal(orderCouponCode(null), "");
  });
});

describe("discountLabel", () => {
  it("names the coupon on the bill", () => {
    assert.equal(discountLabel({ couponCode: "SAVE80" }), "Coupon (SAVE80)");
  });

  it("stays generic for a manual discount", () => {
    assert.equal(discountLabel({ discount: 50 }), "Discount");
  });
});

describe("orderDiscountAmount", () => {
  it("prefers discountAmount and never goes negative", () => {
    assert.equal(orderDiscountAmount({ discountAmount: 80, discount: 10 }), 80);
    assert.equal(orderDiscountAmount({ discount: -5 }), 0);
  });
});

describe("allocateDiscount", () => {
  it("splits by value and sums to the paise", () => {
    const shares = allocateDiscount([2598, 499], 100);
    assert.deepEqual(shares, [83.89, 16.11]);
  });

  it("caps at the line total and skips free lines", () => {
    assert.deepEqual(allocateDiscount([500], 900), [500]);
    assert.deepEqual(allocateDiscount([1000, 0], 50), [50, 0]);
  });

  it("returns zeros with no discount", () => {
    assert.deepEqual(allocateDiscount([1299], 0), [0]);
  });
});

describe("automatic discount names", () => {
  it("names codes and automatic titles with an item discount", () => {
    const order = {
      couponCode: "SAVE80",
      transactionDetails: {
        discounts: [
          { title: "Diwali 10", code: null, amount: 100 },
          { code: "SAVE80", amount: 80 },
          { title: "Free shipping", code: null, amount: 0, shipping: 60 },
        ],
      },
    };
    assert.equal(discountLabel(order), "Discount (Diwali 10, SAVE80)");
  });

  it("keeps the coupon wording for a code on its own", () => {
    assert.equal(
      discountLabel({ couponCode: "SAVE80", transactionDetails: { discounts: [{ code: "SAVE80", amount: 80 }] } }),
      "Coupon (SAVE80)"
    );
  });
});
