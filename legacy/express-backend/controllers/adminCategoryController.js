import asyncHandler from '../middleware/asyncHandler.js';
import Category from '../models/categoryModel.js';

// @route   GET /api/admin/categories
// @desc    Get all categories with subcategories
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({}).sort({ name: 1 });
  res.json(categories);
});

// @route   POST /api/admin/categories
// @desc    Create category (no subcategories)
export const createCategory = asyncHandler(async (req, res) => {
  const { name, slug, description, isActive, parent } = req.body;
  if (!name || !slug) {
    res.status(400);
    throw new Error('Category name and slug are required');
  }

  // Check if same name exists under same parent
  const parentId = parent || null;
  const existing = await Category.findOne({ name: name.trim(), parent: parentId });
  if (existing) {
    res.status(400);
    throw new Error(`Category "${name}" already exists in this level`);
  }

  // Check slug globally
  const slugExisting = await Category.findOne({ slug: slug.trim() });
  if (slugExisting) {
    res.status(400);
    throw new Error('Slug already exists');
  }

  const cat = await Category.create({
    name: name.trim(),
    slug: slug.trim(),
    description: description || '',
    isActive: isActive !== undefined ? !!isActive : true,
    parent: parentId,
  });
  res.status(201).json(cat);
});

// @route   PUT /api/admin/categories/:id
// @desc    Update category (no subcategories)
export const updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) {
    res.status(404);
    throw new Error('Category not found');
  }
  const { name, slug, description, isActive, parent } = req.body;
  
  if (name) cat.name = name.trim();
  if (slug) cat.slug = slug.trim();
  if (description !== undefined) cat.description = description;
  if (isActive !== undefined) cat.isActive = !!isActive;
  if (parent !== undefined) cat.parent = parent || null;

  const updated = await cat.save();
  res.json(updated);
});

// @route   DELETE /api/admin/categories/:id
// @desc    Delete category
export const deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) {
    res.status(404);
    throw new Error('Category not found');
  }

  // Check if has subcategories
  const hasSub = await Category.findOne({ parent: cat._id });
  if (hasSub) {
    res.status(400);
    throw new Error('Cannot delete category with subcategories');
  }

  await cat.deleteOne();
  res.json({ message: 'Category removed' });
});

// @route   GET /api/admin/categories/:parentId/subcategories
// @desc    Get subcategories by categoryId
export const getSubcategories = asyncHandler(async (req, res) => {
  const subcategories = await Category.find({ parent: req.params.parentId }).sort({ name: 1 });
  res.json(subcategories);
});

