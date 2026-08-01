import asyncHandler from '../middleware/asyncHandler.js';
import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import ShiprocketService from '../services/shiprocketService.js';
import paymentService from '../modules/payment/payment.service.js';
import Coupon from '../models/couponModel.js';

// @desc    Create new order (supports Cash on Delivery and Razorpay as method option)
// @route   POST /api/orders
// @access  Private
const addOrderItems = asyncHandler(async (req, res) => {
    const { orderItems, shippingAddress, paymentMethod, shippingPrice, totalPrice, isGift, giftMessage, couponCode } = req.body;
    if (!orderItems || orderItems.length === 0) {
        res.status(400);
        throw new Error('No order items');
    }

    // Enhance items with price safety and STOCK VALIDATION
    const items = await Promise.all(orderItems.map(async (oi) => {
        const product = await Product.findById(oi.product);
        if (!product) {
            res.status(404);
            throw new Error(`Product not found: ${oi.product}`);
        }

        const requestedQty = Number(oi.qty) || 1;
        const color = oi.color || '';
        const size = oi.size || '';

        // Check stock for specific variant if color is provided
        let availableStock = product.totalStock || 0;
        if (color) {
            const variant = product.variants?.find(v => v.color === color);
            if (variant) {
                availableStock = variant.quantity || 0;
            }
        }

        if (availableStock < requestedQty) {
            res.status(400);
            const name = product.productName || product.name || 'Product';
            throw new Error(`Insufficient stock for ${name}${color ? ` (${color})` : ''}. Only ${availableStock} left.`);
        }

        let price = Number(oi.price) || 0;
        // Price Safety: If price is 0 or mismatch, fetch correct price from Product model
        const correctPrice = product.pricing?.offerPrice ?? product.pricing?.sellingPrice ?? product.price ?? 0;
        if (price === 0 || price !== correctPrice) {
            price = correctPrice;
        }

        return {
            productId: oi.product,
            color: color,
            size: size,
            quantity: requestedQty,
            price: price,
            _productRef: product // Keep ref to update stock later
        };
    }));

    const totalAmount = Number(totalPrice) || 0;
    const deliveryAmount = Number(shippingPrice) || 0;
    const giftFee = isGift ? 39 : 0;

    // Recalculate true subtotal from safe items to ensure Shiprocket sync
    const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // Handle Coupon
    let discountAmount = 0;
    let appliedCouponCode = null;

    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: 'active' });
        if (coupon) {
            const isExpired = new Date() > new Date(coupon.expiryDate);
            const isLimitReached = coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit;
            const isMinAmountMet = subtotal >= coupon.minOrderAmount;

            if (!isExpired && !isLimitReached && isMinAmountMet) {
                if (coupon.discountType === 'percentage') {
                    discountAmount = (subtotal * coupon.discountValue) / 100;
                    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
                        discountAmount = coupon.maxDiscount;
                    }
                } else {
                    discountAmount = coupon.discountValue;
                }
                appliedCouponCode = coupon.code;
                
                // Increment usage count
                coupon.usedCount += 1;
                await coupon.save();
            }
        }
    }

    const finalPrice = Math.max(0, subtotal + deliveryAmount + giftFee - discountAmount);
    
    const payment = (paymentMethod && String(paymentMethod).toLowerCase()) || 'cod';
    const order = new Order({
        customerId: req.user._id,
        items,
        shippingAddress: shippingAddress || {},
        status: 'order placed',
        total: subtotal,
        discount: discountAmount,
        finalPrice: finalPrice, // Use recalculated final price for consistency
        deliveryAmount,
        isGift: Boolean(isGift),
        giftFee: giftFee,
        giftMessage: giftMessage || '',
        couponCode: appliedCouponCode,
        discountAmount: discountAmount,
        transactionDetails: {
            paymentMethod: payment,
            paymentStatus: payment === 'cod' ? 'pay_on_delivery' : 'pending',
        },
        paymentMethod: payment,
    });
    const createdOrder = await order.save();

    // Deduct Stock
    for (const item of items) {
        const product = item._productRef;
        if (product) {
            // Update variant stock if applicable
            if (item.color) {
                const variantIndex = product.variants?.findIndex(v => v.color === item.color);
                if (variantIndex !== -1) {
                    product.variants[variantIndex].quantity = Math.max(0, product.variants[variantIndex].quantity - item.quantity);
                }
            }
            // Update total stock
            product.totalStock = Math.max(0, product.totalStock - item.quantity);
            await product.save();
        }
    }
 
    // ── Abandoned Checkout Conversion ───
    try {
        const { guestId } = req.body;
        const AbandonedCheckout = (await import('../models/abandonedCheckoutModel.js')).default;
        
        let abandonedQuery = { status: 'abandoned' };
        if (req.user) {
            abandonedQuery.userId = req.user._id;
        } else if (guestId) {
            abandonedQuery.guestId = guestId;
        }

        if (req.user || guestId) {
            await AbandonedCheckout.findOneAndUpdate(
                abandonedQuery,
                { 
                    status: 'converted', 
                    orderId: createdOrder._id,
                    lastActivityAt: Date.now()
                }
            );
        }
    } catch (err) {
        console.error('[OrderController] Abandoned checkout conversion failed:', err.message);
    }

    // ── Shiprocket Integration (Only for COD - Prepaid syncs after payment) ───
    if (payment === 'cod') {
        try {
            await ShiprocketService.processFullOrderFlow(createdOrder, req.user);
        } catch (srError) {
            console.error('[Checkout] Shiprocket sync failed:', srError.message);
            // Non-fatal: Allow checkout to finish, admin can retry later
            createdOrder.shippingStatus = 'Shipping Sync Failed';
            await createdOrder.save();
        }
    } else {
        // Prepaid order - waiting for payment
        createdOrder.shippingStatus = 'Payment Pending';
        await createdOrder.save();
    }
    // ─────────────────────────────────────────────────────────────────────────

    res.status(201).json(createdOrder);
});

const remapOrder = (order) => {
    const po = order.toObject();
    po.user = po.customerId;
    po.orderItems = (po.items || []).map((it) => {
        const p = it.productId;
        const name = p?.productName || p?.product || 'Product';
        const image = p?.thumbnails?.[0] || p?.variants?.[0]?.images?.[0];
        return { 
            name, 
            image, 
            qty: it.quantity, 
            price: it.price, 
            color: it.color, 
            size: it.size || '',
            product: it.productId?._id || it.productId
        };
    });
    po.totalPrice = po.finalPrice;
    po.itemsPrice = po.total;
    po.shippingPrice = po.deliveryAmount;
    po.isGift = po.isGift;
    po.giftFee = po.giftFee;
    po.giftMessage = po.giftMessage;
    po.orderStatus = po.status; // Add this for frontend compatibility
    po.isPaid = po.paymentStatus === 'paid' || po.transactionDetails?.paymentStatus === 'paid';
    po.paidAt = po.transactionId ? po.updatedAt : null;
    po.isDelivered = po.status === 'delivered';
    return po;
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({ customerId: req.user._id })
        .populate('items.productId', 'productName product thumbnails variants')
        .sort({ createdAt: -1 });
    
    const remappedOrders = orders.map(remapOrder);
    res.json(remappedOrders);
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
        .populate('customerId', 'name email')
        .populate('items.productId', 'productName product thumbnails variants');
    if (order) {
        res.json(remapOrder(order));
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
const updateOrderToPaid = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    try {
        const updatedOrder = await paymentService.verifyPayment(
            razorpay_order_id || req.body.id, // Fallback to id if razorpay_order_id not provided
            razorpay_payment_id || req.body.transactionId,
            razorpay_signature,
            req.params.id,
            req.user._id
        );

        res.json({ message: 'Order paid successfully', order: updatedOrder });
    } catch (error) {
        console.error('[OrderController.updateToPaid] Error:', error.message);
        res.status(error.message.includes('Unauthorized') ? 401 : 400);
        throw new Error(error.message || 'Payment verification failed');
    }
});

// @desc    Update order to delivered (Admin)
// @route   PUT /api/orders/:id/deliver
// @access  Private/Admin
const updateOrderToDelivered = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (order) {
        order.status = 'delivered';
        order.deliveryDate = new Date();
        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({}).populate('customerId', 'id name email').sort({ orderDate: -1 });
    res.json(orders);
});

// @desc    Get dashboard stats (Admin)
// @route   GET /api/orders/stats
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
    const orders = await Order.find({});
    const totalRevenue = orders.reduce((acc, order) => acc + (order.finalPrice || 0), 0);
    const totalOrders = orders.length;

    const User = (await import('../models/userModel.js')).default;
    const totalCustomers = await User.countDocuments({ isAdmin: false });
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({
        totalRevenue: totalRevenue.toFixed(2),
        totalOrders,
        totalCustomers,
        avgOrderValue: avgOrderValue.toFixed(2),
        trends: {
            revenue: "+12.5%",
            orders: "+3.2%",
            customers: "+5.0%",
            avgValue: "+8.4%"
        }
    });
});

export { addOrderItems, getMyOrders, getOrderById, updateOrderToPaid, updateOrderToDelivered, getOrders, getDashboardStats };
