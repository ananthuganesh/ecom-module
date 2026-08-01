import express from 'express';
import { upsertCheckout } from '../controllers/abandonedCheckoutController.js';

const router = express.Router();

router.route('/').post(upsertCheckout);

export default router;
