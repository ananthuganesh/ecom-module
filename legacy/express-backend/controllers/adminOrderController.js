import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import Order from '../models/orderModel.js';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
const VALID_STATUSES = [
  'order placed',
  'processing',
  'shipped',
  'out for delivery',
  'delivered',
  'return requested',
  'returned',
  'cancelled',
];

/**
 * @route   GET /api/admin/orders
 * @desc    Get all orders (admin)
 */
export const getAllOrders = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status && VALID_STATUSES.includes(status) ? { status } : {};
  const orders = await Order.find(filter)
    .populate('customerId', 'name email phone')
    .populate('items.productId', 'productName productId thumbnails variants.images')
    .sort({ createdAt: -1 });
  res.json(orders);
});

/**
 * @route   GET /api/admin/orders/:id
 * @desc    Get single order (admin)
 */
export const getOrderById = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid order ID');
  }
  const order = await Order.findById(req.params.id)
    .populate('customerId', 'name email phone addresses')
    .populate('items.productId', 'productName productId thumbnails variants.images');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  res.json(order);
});

/**
 * @route   PATCH /api/admin/orders/:id/status
 * @desc    Update order status (admin)
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.includes(status)) {
    res.status(400);
    throw new Error(`Invalid status. Use one of: ${VALID_STATUSES.join(', ')}`);
  }

  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid order ID');
  }
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.status = status;
  if (status === 'delivered' && !order.deliveryDate) {
    order.deliveryDate = new Date();
  }
  await order.save();

  const updated = await Order.findById(order._id)
    .populate('customerId', 'name email phone');
  res.json(updated);
});

/**
 * @route   PATCH /api/admin/orders/:id/delivery-date
 * @desc    Update delivery date (admin)
 */
export const updateDeliveryDate = asyncHandler(async (req, res) => {
  const { deliveryDate } = req.body;
  if (!deliveryDate) {
    res.status(400);
    throw new Error('deliveryDate is required');
  }
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid order ID');
  }
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.deliveryDate = new Date(deliveryDate);
  await order.save();
  res.json(order);
});

/**
 * @route   PATCH /api/admin/orders/:id/return
 * @desc    Handle return request – set status to return requested or returned (admin)
 */
export const handleReturnRequest = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid order ID');
  }
  const { action } = req.body; // 'approve' | 'reject'
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.status !== 'return requested' && order.status !== 'delivered') {
    res.status(400);
    throw new Error('Order must be delivered or have return requested to process return');
  }

  if (action === 'approve') {
    order.status = 'returned';
  } else if (action === 'reject') {
    order.status = 'delivered';
  } else {
    res.status(400);
    throw new Error('Provide action: approve or reject');
  }

  await order.save();
  res.json(order);
});

/**
 * @route   PATCH /api/admin/orders/bulk-update
 * @desc    Bulk update order statuses (admin)
 */
export const bulkUpdateOrderStatus = asyncHandler(async (req, res) => {
  const { orderIds, status } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400);
    throw new Error('No order IDs provided');
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    res.status(400);
    throw new Error(`Invalid status. Use one of: ${VALID_STATUSES.join(', ')}`);
  }

  const result = await Order.updateMany(
    { _id: { $in: orderIds } },
    { $set: { status } }
  );

  // If status is delivered, we might want to update deliveryDate too
  if (status === 'delivered') {
    await Order.updateMany(
      { _id: { $in: orderIds }, deliveryDate: { $exists: false } },
      { $set: { deliveryDate: new Date() } }
    );
  }

  res.json({ message: 'Bulk update successful', modifiedCount: result.modifiedCount });
});

/**
 * @route   PATCH /api/admin/orders/:id/payment-status
 * @desc    Update order payment status (admin)
 */
export const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

  if (!paymentStatus || !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    res.status(400);
    throw new Error(`Invalid payment status. Use one of: ${VALID_PAYMENT_STATUSES.join(', ')}`);
  }

  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid order ID');
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.paymentStatus = paymentStatus;
  
  // Also update the nested field for compatibility if needed
  if (order.transactionDetails) {
    order.transactionDetails.paymentStatus = paymentStatus;
  } else {
    order.transactionDetails = { paymentStatus };
  }

  await order.save();
  
  const updated = await Order.findById(order._id)
    .populate('customerId', 'name email phone');
  res.json(updated);
});

/**
 * @route   POST /api/admin/orders
 * @desc    Create new order (admin wizard)
 */
export const createOrder = asyncHandler(async (req, res) => {
  const { 
    customerId, 
    customerDetails, 
    items, 
    paymentMethod, 
    shippingAddress,
    isGift,
    giftMessage,
    deliveryAmount
  } = req.body;

  let targetUserId = customerId;

  // 1. Handle Customer (Find or Create Shadow User)
  if (!targetUserId && customerDetails?.phone) {
    let user = await User.findOne({ phone: customerDetails.phone });
    if (!user) {
      // Create a guest/shadow user
      user = await User.create({
        name: customerDetails.name || 'Admin Created Guest',
        phone: customerDetails.phone,
        isAdmin: false,
      });
    }
    targetUserId = user._id;
  }

  if (!targetUserId) {
    res.status(400);
    throw new Error('Customer information is required');
  }

  // 2. Process Items
  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('No items in order');
  }

  const processedItems = await Promise.all(items.map(async (item) => {
    if (item.isCustom) {
      return {
        name: item.name,
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        isCustom: true,
        color: item.color || 'N/A',
        size: item.size || 'N/A'
      };
    } else {
      const product = await Product.findById(item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      
      return {
        productId: item.productId,
        name: product.productName || product.name,
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || (product.pricing?.offerPrice ?? product.pricing?.sellingPrice ?? product.price ?? 0),
        color: item.color || 'Standard',
        size: item.size || 'Standard',
        isCustom: false
      };
    }
  }));

  // 3. Calculate Totals
  const subtotal = processedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const giftFee = isGift ? 39 : 0;
  const deliveryFee = Number(deliveryAmount) || 0;
  const finalPrice = subtotal + deliveryFee + giftFee;

  const payment = (paymentMethod && String(paymentMethod).toLowerCase()) || 'cod';

  // 4. Create Order
  const order = new Order({
    customerId: targetUserId,
    items: processedItems,
    shippingAddress: shippingAddress || {
        name: customerDetails?.name || '',
        phone: customerDetails?.phone || '',
        address: customerDetails?.address || '',
    },
    status: 'order placed',
    total: subtotal,
    discount: 0,
    finalPrice: finalPrice,
    deliveryAmount: deliveryFee,
    isGift: Boolean(isGift),
    giftFee: giftFee,
    giftMessage: giftMessage || '',
    transactionDetails: {
      paymentMethod: payment,
      paymentStatus: payment === 'cod' ? 'pay_on_delivery' : (payment === 'prepaid' ? 'paid' : 'pending'),
    },
    paymentStatus: payment === 'prepaid' ? 'paid' : (payment === 'cod' ? 'pending' : 'pending'),
    paymentMethod: payment,
  });

  const createdOrder = await order.save();
  res.status(201).json(createdOrder);
});
