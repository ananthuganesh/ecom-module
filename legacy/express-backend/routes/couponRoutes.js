import express from 'express';
const router = express.Router();
import { validateCoupon, getPublicCoupons } from '../controllers/couponController.js';
import { protect } from '../middleware/authMiddleware.js';

router.get('/', getPublicCoupons);
router.post('/validate', validateCoupon);

export default router;
