import asyncHandler from '../middleware/asyncHandler.js';
import ShiprocketService from '../services/shiprocketService.js';
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

    try {
        const trackingData = await ShiprocketService.trackAWB(order.awbCode);
        
        // Update order status if it has changed in tracking
        const latestStatus = trackingData.tracking_data?.shipment_track?.[0]?.current_status;
        if (latestStatus && latestStatus.toLowerCase() !== order.shippingStatus?.toLowerCase()) {
            order.shippingStatus = latestStatus;
            await order.save();
        }

        res.json(trackingData);
    } catch (error) {
        console.error('[Tracking Error]:', error.message);
        // Return 200 with message if tracking is just not available yet
        res.json({ 
            status: 'Tracking information not yet available', 
            details: null,
            message: 'Shipping partner has not updated the tracking details yet. Please check back in a few hours.'
        });
    }
});

// @desc    Retry Shiprocket integration for a failed order
// @route   POST /api/shipping/retry/:id
// @access  Private/Admin
const retryShipping = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
        res.status(404);
        throw new Error('Order not found');
    }

    const User = (await import('../models/userModel.js')).default;
    const user = await User.findById(order.customerId);

    if (!user) {
        res.status(404);
        throw new Error('Customer not found for this order');
    }

    try {
        if (!order.shiprocketOrderId) {
            const srOrder = await ShiprocketService.createOrder(order, user);
            order.shiprocketOrderId = srOrder.order_id;
            order.shipmentId = srOrder.shipment_id;
        }

        // Always attempt to assign AWB if missing
        if (!order.awbCode && order.shipmentId) {
            try {
                const awbData = await ShiprocketService.assignAWB(order.shipmentId);
                // Shiprocket AWB assignment response structure can vary by plan
                if (awbData.response?.data?.awb_code) {
                    order.awbCode = awbData.response.data.awb_code;
                    order.courierName = awbData.response.data.courier_name;
                } else if (awbData.awb_assign_status === 1) {
                    order.awbCode = awbData.response.data.awb_code;
                }
            } catch (awbError) {
                console.warn('[Retry] AWB assignment failed:', awbError.message);
                // Continue to pickup if possible, or exit with partial success
            }
        }

        if (order.shipmentId && order.shippingStatus !== 'Pickup Scheduled') {
            try {
                await ShiprocketService.generatePickup(order.shipmentId);
                order.shippingStatus = 'Pickup Scheduled';
            } catch (pickupError) {
                console.warn('[Retry] Pickup generation failed:', pickupError.message);
            }
        }

        await order.save();
        res.json({ message: 'Shipping retried. Current status updated.', order });
    } catch (error) {
        console.error('[Shipping Retry Error]:', error.response?.data || error.message);
        
        const message = error.response?.data?.message || error.message || 'Unknown shipping error';
        res.status(500).json({ 
            message: `Shipping partner error: ${message}`,
            details: error.response?.data || null
        });
    }
});

export { getTrackingDetails, retryShipping };
