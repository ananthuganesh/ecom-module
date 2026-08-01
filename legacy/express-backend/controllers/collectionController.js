import asyncHandler from '../middleware/asyncHandler.js';
import Collection from '../models/collectionModel.js';
import Category from '../models/categoryModel.js';

/**
 * @desc    Get collections by category slug
 * @route   GET /api/collections/category/:slug
 * @access  Public
 */
export const getCollectionsByCategory = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    console.log('[Backend] Public: Fetching collections for category slug:', slug);

    // 1. Find the category by slug
    const category = await Category.findOne({ slug, isActive: true });
    console.log('[Backend] Category found:', category ? category.name : 'NONE');
    
    if (!category) {
        res.status(404);
        throw new Error('Category not found');
    }

    // 2. Find all collections that belong to this category or its subcategories
    // First, get all subcategory IDs if it's a parent
    const subcategories = await Category.find({ parent: category._id });
    const categoryIds = [category._id, ...subcategories.map(s => s._id)];

    const collections = await Collection.find({ category: { $in: categoryIds } })
        .populate({
            path: 'products',
            select: 'productName productId thumbnails variants pricing status',
            match: { status: 'active' }
        })
        .sort({ createdAt: -1 });

    res.json({
        category: {
            name: category.name,
            slug: category.slug,
            description: category.description
        },
        collections
    });
});

/**
 * @desc    Get all collections (public)
 * @route   GET /api/collections
 * @access  Public
 */
export const getAllCollections = asyncHandler(async (req, res) => {
    const collections = await Collection.find({})
        .populate('category', 'name slug')
        .populate({
            path: 'products',
            select: 'productName productId thumbnails variants pricing status',
            match: { status: 'active' }
        })
        .sort({ createdAt: -1 });

    res.json(collections);
});

/**
 * @desc    Get single collection by slug
 * @route   GET /api/collections/:slug
 * @access  Public
 */
export const getCollectionBySlug = asyncHandler(async (req, res) => {
    const collection = await Collection.findOne({ slug: req.params.slug })
        .populate('category', 'name slug')
        .populate({
            path: 'products',
            select: 'productName productId thumbnails variants pricing status',
            match: { status: 'active' }
        });

    if (!collection) {
        res.status(404);
        throw new Error('Collection not found');
    }

    res.json(collection);
});
