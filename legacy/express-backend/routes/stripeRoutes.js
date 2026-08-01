import express from 'express';
import Stripe from 'stripe';
import asyncHandler from '../middleware/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Get Stripe publishable key
// @route   GET /api/stripe/config
// @access  Public
router.get('/config', (req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// @desc    Create payment intent
// @route   POST /api/stripe/create-payment-intent
// @access  Private
router.post(
    '/create-payment-intent',
    protect,
    asyncHandler(async (req, res) => {
        const { amount } = req.body;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // in cents
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    })
);

export default router;
