import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { adminOnly } from '../../middleware/adminMiddleware.js';
import {
  getAllUsers,
  getUserById,
  blockUnblockUser,
  deleteUser,
  getUserOrders,
} from '../../controllers/adminUserController.js';
import {
  getAllProducts,
  getProductById,
  addProduct,
  editProduct,
  updateProductPricing,
  updateStock,
  updateVariant,
  deleteProduct,
  bulkUpdateProducts,
  importProductsFromCSV,
} from '../../controllers/adminProductController.js';
import {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updateDeliveryDate,
  handleReturnRequest,
  bulkUpdateOrderStatus,
  updatePaymentStatus,
  createOrder,
} from '../../controllers/adminOrderController.js';
import {
  getWalletByUserId,
  issueRefund,
  getWalletTransactions,
} from '../../controllers/adminWalletController.js';
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../../controllers/adminBrandController.js';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories,
} from '../../controllers/adminCategoryController.js';
import { uploadProductImage as uploadProductImageHandler } from '../../controllers/uploadController.js';
import {
  getRazorpaySettings,
  saveRazorpaySettings,
  disconnectRazorpay,
} from '../../controllers/adminRazorpayController.js';
import {
  getAbandonedCheckouts,
  getAbandonedCheckoutById
} from '../../controllers/abandonedCheckoutController.js';
import {
  getCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
} from '../../controllers/adminCollectionController.js';
import {
  getInventoryEntries,
  getInventoryById,
  createInventoryEntry,
  updateInventoryEntry,
  deleteInventoryEntry,
} from '../../controllers/adminInventoryController.js';
import {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCouponAdmin,
} from '../../controllers/adminCouponController.js';
import { 
  uploadProductImage as uploadProductImageMiddleware,
  uploadCSV as uploadCSVMiddleware
} from '../../middleware/uploadMiddleware.js';

const router = express.Router();

// Temporarily bypass authentication for admin API endpoints
// router.use(protect, adminOnly);

// ---------- Users ----------
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.get('/users/:id/orders', getUserOrders);
router.patch('/users/:id/block', blockUnblockUser);
router.delete('/users/:id', deleteUser);

// ---------- Upload (before /products/:id) ----------
router.post('/upload/image', uploadProductImageMiddleware, uploadProductImageHandler);

// ---------- Products ----------
router.get('/products', getAllProducts);
router.post('/products', addProduct);
router.post('/products/import', uploadCSVMiddleware, importProductsFromCSV);
router.patch('/products/bulk-update', bulkUpdateProducts);
router.get('/products/:id', getProductById);
router.put('/products/:id', editProduct);
router.patch('/products/:id/pricing', updateProductPricing);
router.patch('/products/:id/stock', updateStock);
router.patch('/products/:id/variant', updateVariant);
router.delete('/products/:id', deleteProduct);

// ---------- Orders ----------
router.get('/orders', getAllOrders);
router.post('/orders', createOrder);
router.patch('/orders/bulk-update', bulkUpdateOrderStatus);
router.get('/orders/:id', getOrderById);
router.patch('/orders/:id/status', updateOrderStatus);
router.patch('/orders/:id/payment-status', updatePaymentStatus);
router.patch('/orders/:id/delivery-date', updateDeliveryDate);
router.patch('/orders/:id/return', handleReturnRequest);

// ---------- Abandoned Checkouts ----------
router.get('/abandoned-checkouts', getAbandonedCheckouts);
router.get('/abandoned-checkouts/:id', getAbandonedCheckoutById);

// ---------- Wallet (refund before :userId) ----------
router.post('/wallet/refund', issueRefund);
router.get('/wallet/:userId/transactions', getWalletTransactions);
router.get('/wallet/:userId', getWalletByUserId);

// ---------- Brands ----------
router.get('/brands', getBrands);
router.post('/brands', createBrand);
router.put('/brands/:id', updateBrand);
router.delete('/brands/:id', deleteBrand);

// ---------- Categories ----------
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);
router.get('/categories/:parentId/subcategories', getSubcategories);

// ---------- Collections ----------
router.get('/collections', getCollections);
router.post('/collections', createCollection);
router.get('/collections/:id', getCollectionById);
router.put('/collections/:id', updateCollection);
router.delete('/collections/:id', deleteCollection);

// ---------- Inventory ----------
router.get('/inventory', getInventoryEntries);
router.post('/inventory', createInventoryEntry);
router.get('/inventory/:id', getInventoryById);
router.put('/inventory/:id', updateInventoryEntry);
router.delete('/inventory/:id', deleteInventoryEntry);

// ---------- Razorpay Settings ----------
router.get('/razorpay/settings', getRazorpaySettings);
router.post('/razorpay/settings', saveRazorpaySettings);
router.post('/razorpay/disconnect', disconnectRazorpay);

// ---------- Coupons ----------
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.post('/coupons/validate', validateCouponAdmin);
router.get('/coupons/:id', getCouponById);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

export default router;
