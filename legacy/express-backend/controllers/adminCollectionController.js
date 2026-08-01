import asyncHandler from '../middleware/asyncHandler.js';
import Collection from '../models/collectionModel.js';

/**
 * @desc    Get all collections
 * @route   GET /api/admin/collections
 * @access  Private/Admin
 */
export const getCollections = asyncHandler(async (req, res) => {
  const collections = await Collection.find({})
    .populate('category', 'name slug')
    .populate('products', 'productName productId thumbnails variants')
    .sort({ createdAt: -1 });
  res.json(collections);
});

/**
 * @desc    Get single collection by ID
 * @route   GET /api/admin/collections/:id
 * @access  Private/Admin
 */
export const getCollectionById = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id).populate(
    'products',
    'productName productId thumbnails variants'
  );

  if (!collection) {
    res.status(404);
    throw new Error('Collection not found');
  }

  res.json(collection);
});

/**
 * @desc    Create new collection
 * @route   POST /api/admin/collections
 * @access  Private/Admin
 */
export const createCollection = asyncHandler(async (req, res) => {
  const { title, summary, image, products, category } = req.body;

  if (!title) {
    res.status(400);
    throw new Error('Collection title is required');
  }

  if (!category) {
    res.status(400);
    throw new Error('Category is required');
  }

  const collectionExists = await Collection.findOne({ title });
  if (collectionExists) {
    res.status(400);
    throw new Error('Collection with this title already exists');
  }

  const collection = await Collection.create({
    title,
    summary,
    image,
    products: products || [],
    category,
  });

  res.status(201).json(collection);
});

/**
 * @desc    Update collection
 * @route   PUT /api/admin/collections/:id
 * @access  Private/Admin
 */
export const updateCollection = asyncHandler(async (req, res) => {
  const { title, summary, image, products, category } = req.body;

  const collection = await Collection.findById(req.params.id);

  if (!collection) {
    res.status(404);
    throw new Error('Collection not found');
  }

  collection.title = title || collection.title;
  collection.summary = summary !== undefined ? summary : collection.summary;
  collection.image = image !== undefined ? image : collection.image;
  collection.products = products || collection.products;
  if (category) collection.category = category;

  const updatedCollection = await collection.save();
  res.json(updatedCollection);
});

/**
 * @desc    Delete collection
 * @route   DELETE /api/admin/collections/:id
 * @access  Private/Admin
 */
export const deleteCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id);

  if (!collection) {
    res.status(404);
    throw new Error('Collection not found');
  }

  await Collection.findByIdAndDelete(req.params.id);
  res.json({ message: 'Collection removed' });
});
