import asyncHandler from '../middleware/asyncHandler.js';
import Order from '../models/orderModel.js';

// @desc    Get tracking details for an order
// @route   GET /api/shipping/track/:id
// @access  Private
const getTrackingDetails = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (!order) {
        res.status(404);
        throw new Error('Order not found');
    }

    if (!order.awbCode) {
        return res.json({ status: 'Shipping label not yet generated', details: null });
    }

    res.json({
        status: order.shippingStatus || 'In transit',
        details: null,
        message: 'Use DTDC tracking with the AWB on this order.',
        awbCode: order.awbCode,
        courierName: order.courierName || null,
    });
});

// @desc    Retry shipping for a failed order (legacy stub)
// @route   POST /api/shipping/retry/:id
// @access  Private/Admin
const retryShipping = asyncHandler(async (req, res) => {
    res.status(410).json({
        message: 'Automatic shipping retry is no longer available. Create consignments via DTDC from the admin order page.',
    });
});

export { getTrackingDetails, retryShipping };
