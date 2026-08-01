import asyncHandler from 'express-async-handler';
import Coupon from '../models/couponModel.js';

// @desc    Validate a coupon for user checkout
// @route   POST /api/coupons/validate
// @access  Private
export const validateCoupon = asyncHandler(async (req, res) => {
  const { code, amount } = req.body;

  const coupon = await Coupon.findOne({ code: code.toUpperCase(), status: 'active' });

  if (!coupon) {
    res.status(400);
    throw new Error('Invalid or inactive coupon code');
  }

  if (new Date() > new Date(coupon.expiryDate)) {
    res.status(400);
    throw new Error('Coupon has expired');
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    res.status(400);
    throw new Error('Coupon usage limit reached');
  }

  if (amount < coupon.minOrderAmount) {
    res.status(400);
    throw new Error(`Minimum order amount of ₹${coupon.minOrderAmount} required`);
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = (amount * coupon.discountValue) / 100;
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = coupon.discountValue;
  }

  res.json({
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: discount,
  });
});

// @desc    Get active public coupons
// @route   GET /api/coupons
// @access  Private
export const getPublicCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({
    status: 'active',
    expiryDate: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  res.json(coupons);
});
