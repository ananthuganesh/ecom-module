import asyncHandler from '../middleware/asyncHandler.js';
import Brand from '../models/brandModel.js';

// @route   GET /api/admin/brands
// @desc    Get all brands
export const getBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find({}).sort({ name: 1 });
  res.json(brands);
});

// @route   POST /api/admin/brands
// @desc    Create brand
export const createBrand = asyncHandler(async (req, res) => {
  const { name, slug, description, isActive } = req.body;
  if (!name || !slug) {
    res.status(400);
    throw new Error('Brand name and slug are required');
  }
  const existing = await Brand.findOne({ $or: [{ name }, { slug }] });
  if (existing) {
    res.status(400);
    throw new Error('Brand with this name or slug already exists');
  }
  const brand = await Brand.create({
    name: name.trim(),
    slug: slug.trim(),
    description: description || '',
    isActive: isActive !== undefined ? !!isActive : true,
  });
  res.status(201).json(brand);
});

// @route   PUT /api/admin/brands/:id
// @desc    Update brand
export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    res.status(404);
    throw new Error('Brand not found');
  }
  const { name, slug, description, isActive } = req.body;
  if (name) brand.name = name.trim();
  if (slug) brand.slug = slug.trim();
  if (description !== undefined) brand.description = description;
  if (isActive !== undefined) brand.isActive = !!isActive;
  const updated = await brand.save();
  res.json(updated);
});

// @route   DELETE /api/admin/brands/:id
// @desc    Delete brand
export const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    res.status(404);
    throw new Error('Brand not found');
  }
  await brand.deleteOne();
  res.json({ message: 'Brand removed' });
});

