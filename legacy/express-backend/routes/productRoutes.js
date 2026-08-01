import express from 'express';
const router = express.Router();
import { getProducts, getFeaturedProducts, getProductById, getProductBySlug, createProduct, updateProduct, deleteProduct, createProductReview, getBrands, getColors, getSearchSuggestions } from '../controllers/productController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

router.get('/search/suggestions', getSearchSuggestions);
router.route('/').get(getProducts).post(protect, admin, createProduct);
router.get('/featured', getFeaturedProducts);
router.get('/brands', getBrands);
router.get('/colors', getColors);
router.get('/slug/:slug', getProductBySlug);
router.route('/:id/reviews').post(protect, createProductReview);
router.route('/:id').get(getProductById).put(protect, admin, updateProduct).delete(protect, admin, deleteProduct);

export default router;
