import express from 'express';
import { getTrackingDetails, retryShipping } from '../controllers/shippingController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/track/:id', protect, getTrackingDetails);
router.post('/retry/:id', protect, admin, retryShipping);

export default router;
