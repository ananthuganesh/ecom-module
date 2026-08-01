import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
//Address Schema
const addressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    house: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, lowercase: true, trim: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    isPhoneVerified: { type: Boolean, default: false },
    password: { type: String, select: false },
    addresses: [addressSchema],
    cartId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cart', default: null },
    wishlistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wishlist', default: null },
    walletBalance: { type: Number, default: 0, min: 0 },
    isAdmin: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);


userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);
export default User;
