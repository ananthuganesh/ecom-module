import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, trim: true },
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    isCustom: { type: Boolean, default: false }
  },
  { _id: true }
);

const transactionDetailsSchema = new mongoose.Schema(
  {
    paymentMethod: { type: String, trim: true },
    paymentStatus: { type: String, trim: true },
  },
  { _id: false }
);

// ── Razorpay payment tracking fields ──────────────────────────────────────────
// These are added directly to the order for quick lookups.
// Full payment history lives in the PaymentTransaction collection.

const shippingAddressSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    address2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    cartId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cart' },
    items: [orderItemSchema],
    shippingAddress: { type: shippingAddressSchema },
    status: {
      type: String,
      enum: [
        'order placed',
        'processing',
        'shipped',
        'out for delivery',
        'delivered',
        'return requested',
        'returned',
        'cancelled',
      ],
      default: 'order placed',
    },
    orderDate: { type: Date, default: Date.now },
    shippingMethod: { type: String, trim: true },
    isGift: { type: Boolean, default: false },
    giftFee: { type: Number, default: 0, min: 0 },
    giftMessage: { type: String, trim: true, default: '' },
    total: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    finalPrice: { type: Number, required: true, min: 0 },
    deliveryAmount: { type: Number, default: 0, min: 0 },
    transactionId: { type: String, trim: true },
    transactionDetails: { type: transactionDetailsSchema },
    deliveryDate: { type: Date },
    profit: { type: Number, default: 0 },

    // ── Razorpay fields ──────────────────────────────────────────────────────
    // razorpayOrderId: set when payment is initiated (from PaymentService.createRazorpayOrder)
    razorpayOrderId: { type: String, trim: true, default: null },
    // razorpayPaymentId: set after successful payment verification
    razorpayPaymentId: { type: String, trim: true, default: null },
    // paymentStatus: tracks whether payment has been received
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    // paymentMethod: 'razorpay', 'cod', 'wallet', etc.
    paymentMethod: { type: String, trim: true, default: null },
    shipmentId: { type: String, trim: true, default: null },
    awbCode: { type: String, trim: true, default: null },
    courierName: { type: String, trim: true, default: null },
    shippingStatus: { type: String, trim: true, default: null },
    // ── Coupon fields ────────────────────────────────────────────────────────
    couponCode: { type: String, trim: true, default: null },
    discountAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderDate: -1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;
