import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, unique: true },
    summary: { type: String, trim: true },
    image: { type: String, trim: true },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    slug: { type: String, unique: true, trim: true },
  },
  { timestamps: true }
);

// Pre-save hook to generate slug
collectionSchema.pre('save', async function () {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
});

const Collection = mongoose.model('Collection', collectionSchema);
export default Collection;
