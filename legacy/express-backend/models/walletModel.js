import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ['credit', 'debit'] },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true },
    date: { type: Date, default: Date.now },
  },
  { _id: true }
);

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', unique: true },
    balance: { type: Number, required: true, default: 0, min: 0 },
    transactions: [transactionSchema],
  },
  { timestamps: true }
);

const Wallet = mongoose.model('Wallet', walletSchema);
export default Wallet;
