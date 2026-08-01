import asyncHandler from 'express-async-handler';
import Coupon from '../models/couponModel.js';

// @desc    Get all coupons
// @route   GET /api/admin/coupons
// @access  Private/Admin
export const getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 });
  res.json(coupons);
});

// @desc    Get single coupon
// @route   GET /api/admin/coupons/:id
// @access  Private/Admin
export const getCouponById = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (coupon) {
    res.json(coupon);
  } else {
    res.status(404);
    throw new Error('Coupon not found');
  }
});

// @desc    Create a coupon
// @route   POST /api/admin/coupons
// @access  Private/Admin
export const createCoupon = asyncHandler(async (req, res) => {
  const {
    name,
    code,
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscount,
    usageLimit,
    expiryDate,
    status,
  } = req.body;

  const couponExists = await Coupon.findOne({ code: code.toUpperCase() });

  if (couponExists) {
    res.status(400);
    throw new Error('Coupon code already exists');
  }

  const coupon = await Coupon.create({
    name,
    code: code.toUpperCase(),
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscount,
    usageLimit,
    expiryDate,
    status,
  });

  if (coupon) {
    res.status(201).json(coupon);
  } else {
    res.status(400);
    throw new Error('Invalid coupon data');
  }
});

// @desc    Update a coupon
// @route   PUT /api/admin/coupons/:id
// @access  Private/Admin
export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (coupon) {
    coupon.name = req.body.name || coupon.name;
    if (req.body.code) {
      coupon.code = req.body.code.toUpperCase();
    }
    coupon.discountType = req.body.discountType || coupon.discountType;
    coupon.discountValue = req.body.discountValue ?? coupon.discountValue;
    coupon.minOrderAmount = req.body.minOrderAmount ?? coupon.minOrderAmount;
    coupon.maxDiscount = req.body.maxDiscount ?? coupon.maxDiscount;
    coupon.usageLimit = req.body.usageLimit ?? coupon.usageLimit;
    coupon.expiryDate = req.body.expiryDate || coupon.expiryDate;
    coupon.status = req.body.status || coupon.status;

    const updatedCoupon = await coupon.save();
    res.json(updatedCoupon);
  } else {
    res.status(404);
    throw new Error('Coupon not found');
  }
});

// @desc    Delete a coupon
// @route   DELETE /api/admin/coupons/:id
// @access  Private/Admin
export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (coupon) {
    await coupon.deleteOne();
    res.json({ message: 'Coupon removed' });
  } else {
    res.status(404);
    throw new Error('Coupon not found');
  }
});

// @desc    Validate a coupon (Internal use/Admin Order flow)
// @route   POST /api/admin/coupons/validate
// @access  Private/Admin
export const validateCouponAdmin = asyncHandler(async (req, res) => {
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
