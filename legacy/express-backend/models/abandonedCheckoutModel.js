import mongoose from 'mongoose';

const abandonedCheckoutItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  color: { type: String },
  size: { type: String },
  image: { type: String }
}, { _id: false });

const abandonedCheckoutSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  guestId: {
    type: String,
    default: null
  },
  items: [abandonedCheckoutItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    default: 0
  },
  customerDetails: {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true }
  },
  status: {
    type: String,
    enum: ['abandoned', 'converted'],
    default: 'abandoned'
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for performance and cleanup
abandonedCheckoutSchema.index({ userId: 1 });
abandonedCheckoutSchema.index({ guestId: 1 });
abandonedCheckoutSchema.index({ status: 1 });
abandonedCheckoutSchema.index({ createdAt: -1 });

const AbandonedCheckout = mongoose.model('AbandonedCheckout', abandonedCheckoutSchema);

export default AbandonedCheckout;
