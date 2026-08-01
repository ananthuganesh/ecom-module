import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    supplier: {
      type: String,
      required: true,
      trim: true,
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0,
    },
    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Pre-save hook to calculate total cost
inventorySchema.pre('save', function (next) {
  this.totalCost = this.purchasePrice * this.quantity;
  next();
});

const Inventory = mongoose.model('Inventory', inventorySchema);
export default Inventory;
