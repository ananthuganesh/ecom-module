import asyncHandler from '../middleware/asyncHandler.js';
import AbandonedCheckout from '../models/abandonedCheckoutModel.js';

/**
 * @desc    Upsert abandoned checkout session
 * @route   POST /api/abandoned-checkout
 * @access  Public
 */
export const upsertCheckout = asyncHandler(async (req, res) => {
  const { userId, guestId, items, totalAmount, customerDetails } = req.body;

  if (!userId && !guestId) {
    res.status(400);
    throw new Error('Either userId or guestId is required');
  }

  let query = { status: 'abandoned' };
  if (userId) {
    query.userId = userId;
  } else {
    query.guestId = guestId;
  }

  const update = {
    items,
    totalAmount,
    customerDetails,
    lastActivityAt: Date.now(),
  };

  if (userId) update.userId = userId;

  const checkout = await AbandonedCheckout.findOneAndUpdate(
    query,
    { $set: update },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(200).json(checkout);
});

/**
 * @desc    Get all abandoned checkouts (Admin)
 * @route   GET /api/admin/abandoned-checkouts
 * @access  Private/Admin
 */
export const getAbandonedCheckouts = asyncHandler(async (req, res) => {
  const { status, name, phone, email } = req.query;
  
  const filter = {};
  if (status) filter.status = status;
  
  if (name) filter['customerDetails.name'] = { $regex: name, $options: 'i' };
  if (phone) filter['customerDetails.phone'] = { $regex: phone, $options: 'i' };
  if (email) filter['customerDetails.email'] = { $regex: email, $options: 'i' };

  const checkouts = await AbandonedCheckout.find(filter)
    .populate('userId', 'name email phone')
    .sort({ lastActivityAt: -1 });

  res.json(checkouts);
});

/**
 * @desc    Get abandoned checkout by ID (Admin)
 * @route   GET /api/admin/abandoned-checkouts/:id
 * @access  Private/Admin
 */
export const getAbandonedCheckoutById = asyncHandler(async (req, res) => {
  const checkout = await AbandonedCheckout.findById(req.params.id)
    .populate('userId', 'name email phone')
    .populate('items.productId', 'productName thumbnails');

  if (checkout) {
    res.json(checkout);
  } else {
    res.status(404);
    throw new Error('Abandoned checkout not found');
  }
});
