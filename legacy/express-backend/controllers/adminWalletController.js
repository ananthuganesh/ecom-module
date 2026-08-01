import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import Wallet from '../models/walletModel.js';
import User from '../models/userModel.js';

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

/**
 * @route   GET /api/admin/wallet/:userId
 * @desc    View user wallet (admin)
 */
export const getWalletByUserId = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.userId)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }
  const wallet = await Wallet.findOne({ userId: req.params.userId });
  if (!wallet) {
    res.status(404);
    throw new Error('Wallet not found for this user');
  }
  const user = await User.findById(req.params.userId).select('name email').lean();
  res.json({ wallet, user });
});

/**
 * @route   POST /api/admin/wallet/refund
 * @desc    Issue refund to user wallet (admin) – credits balance and adds transaction
 */
export const issueRefund = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;

  if (!userId || amount == null || amount <= 0) {
    res.status(400);
    throw new Error('userId and positive amount are required');
  }
  if (!isValidId(userId)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId, balance: 0, transactions: [] });
  }

  wallet.balance += Number(amount);
  wallet.transactions.push({
    type: 'credit',
    amount: Number(amount),
    reason: reason || 'Refund issued by admin',
    date: new Date(),
  });
  await wallet.save();

  // Optionally sync User.walletBalance if you use it
  await User.findByIdAndUpdate(userId, { walletBalance: wallet.balance });

  const updated = await Wallet.findOne({ userId });
  res.json({ message: 'Refund issued', wallet: updated });
});

/**
 * @route   GET /api/admin/wallet/:userId/transactions
 * @desc    View wallet transactions (admin)
 */
export const getWalletTransactions = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.userId)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }
  const wallet = await Wallet.findOne({ userId: req.params.userId });
  if (!wallet) {
    res.status(404);
    throw new Error('Wallet not found for this user');
  }
  const transactions = wallet.transactions || [];
  res.json({ transactions, balance: wallet.balance });
});
