import asyncHandler from '../middleware/asyncHandler.js';
import Inventory from '../models/inventoryModel.js';
import Product from '../models/productModel.js';

/**
 * @desc    Get all inventory entries
 * @route   GET /api/admin/inventory
 * @access  Private/Admin
 */
export const getInventoryEntries = asyncHandler(async (req, res) => {
  const { productName, supplier } = req.query;
  const query = {};
  
  if (productName) query.productName = new RegExp(productName, 'i');
  if (supplier) query.supplier = new RegExp(supplier, 'i');

  const entries = await Inventory.find(query)
    .sort({ purchaseDate: -1 });
  res.json(entries);
});

/**
 * @desc    Get single inventory entry
 * @route   GET /api/admin/inventory/:id
 * @access  Private/Admin
 */
export const getInventoryById = asyncHandler(async (req, res) => {
  const entry = await Inventory.findById(req.params.id);
  if (!entry) {
    res.status(404);
    throw new Error('Inventory entry not found');
  }
  res.json(entry);
});

/**
 * @desc    Create inventory entry
 * @route   POST /api/admin/inventory
 * @access  Private/Admin
 */
export const createInventoryEntry = asyncHandler(async (req, res) => {
  const { productName, supplier, purchasePrice, quantity, purchaseDate, notes } = req.body;

  if (!productName || !supplier || !purchasePrice || !quantity) {
    res.status(400);
    throw new Error('Please provide all required fields: productName, supplier, purchasePrice, quantity');
  }

  const totalCost = purchasePrice * quantity;

  const entry = await Inventory.create({
    productName,
    supplier,
    purchasePrice,
    quantity,
    totalCost,
    purchaseDate: purchaseDate || Date.now(),
    notes,
  });

  res.status(201).json(entry);
});

/**
 * @desc    Update inventory entry
 * @route   PUT /api/admin/inventory/:id
 * @access  Private/Admin
 */
export const updateInventoryEntry = asyncHandler(async (req, res) => {
  const { productName, supplier, purchasePrice, quantity, purchaseDate, notes } = req.body;

  const entry = await Inventory.findById(req.params.id);

  if (!entry) {
    res.status(404);
    throw new Error('Inventory entry not found');
  }

  entry.productName = productName || entry.productName;
  entry.supplier = supplier || entry.supplier;
  entry.purchasePrice = purchasePrice !== undefined ? purchasePrice : entry.purchasePrice;
  entry.quantity = quantity !== undefined ? quantity : entry.quantity;
  entry.purchaseDate = purchaseDate || entry.purchaseDate;
  entry.notes = notes !== undefined ? notes : entry.notes;

  // Total cost is updated in pre-save hook
  const updatedEntry = await entry.save();
  res.json(updatedEntry);
});

/**
 * @desc    Delete inventory entry
 * @route   DELETE /api/admin/inventory/:id
 * @access  Private/Admin
 */
export const deleteInventoryEntry = asyncHandler(async (req, res) => {
  const entry = await Inventory.findById(req.params.id);
  if (!entry) {
    res.status(404);
    throw new Error('Inventory entry not found');
  }
  await Inventory.findByIdAndDelete(req.params.id);
  res.json({ message: 'Inventory entry removed' });
});
