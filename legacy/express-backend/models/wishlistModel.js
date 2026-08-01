import mongoose from 'mongoose';

const wishlistProductSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
  },
  { _id: true }
);

const wishlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', unique: true },
    products: [wishlistProductSchema],
  },
  { timestamps: true }
);

wishlistSchema.index({ userId: 1 });

const Wishlist = mongoose.model('Wishlist', wishlistSchema);
export default Wishlist;
