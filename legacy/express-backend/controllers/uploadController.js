import asyncHandler from '../middleware/asyncHandler.js';

/**
 * @route   POST /api/admin/upload/image
 * @desc    Upload product image; saved to public/uploads/products. Returns URL for DB.
 */
export const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image file provided');
  }
  // Use request origin so the image URL loads when displayed on the same host (e.g. frontend)
  const url = `/uploads/products/${req.file.filename}`;
  res.json({ url });
});
