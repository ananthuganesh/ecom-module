import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import User from '../models/userModel.js';
import Order from '../models/orderModel.js';

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users (admin)
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  // Do not include admin accounts in the user listing
  const users = await User.find({ isAdmin: false }).select('-password').sort({ createdAt: -1 });
  res.json(users);
});

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get user by ID (admin)
 */
export const getUserById = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }
  const user = await User.findById(req.params.id).select('-password');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  res.json(user);
});

/**
 * @route   PATCH /api/admin/users/:id/block
 * @desc    Block or unblock user (admin)
 */
export const blockUnblockUser = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.isAdmin) {
    res.status(400);
    throw new Error('Cannot block an admin user');
  }
  user.isBlocked = !user.isBlocked;
  await user.save();
  const updated = await User.findById(user._id).select('-password');
  res.json({ message: user.isBlocked ? 'User blocked' : 'User unblocked', user: updated });
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user (admin)
 */
export const deleteUser = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.isAdmin) {
    res.status(400);
    throw new Error('Cannot delete an admin user');
  }
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'User removed' });
});

/**
 * @route   GET /api/admin/users/:id/orders
 * @desc    Get all orders for a user (admin)
 */
export const getUserOrders = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }
  const orders = await Order.find({ customerId: req.params.id })
    .populate('customerId', 'name email')
    .sort({ createdAt: -1 });
  res.json(orders);
});
