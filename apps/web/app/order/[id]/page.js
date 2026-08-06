"use client";

import { Clock, MapPin, Smartphone } from "lucide-react";
import {
  CheckBurstIcon,
  ChevronLeftIcon,
  InfoIcon,
  PackageIcon,
  SearchIcon,
  TruckIcon
} from "@/components/icons/storeIcons";
import { useState, useEffect, use, Suspense } from "react";
import { orderService, shippingService } from "@/api";

import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { resolveImageUrl } from "@/utils/imageResolver";

function OrderContent({ params: paramsPromise }) {
    const params = use(paramsPromise);
    const searchParams = useSearchParams();
    const paymentSuccess = searchParams.get("payment_success") === "true";

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tracking, setTracking] = useState(null);
    const [trackingLoading, setTrackingLoading] = useState(false);
    const [showTrackingModal, setShowTrackingModal] = useState(false);

    const fetchOrder = async () => {
        try {
            const data = await orderService.getById(params.id);
            setOrder(data);
        } catch (error) {
            console.error("Error fetching order:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTracking = async () => {
        if (!order?._id) return;
        setTrackingLoading(true);
        try {
            const data = await shippingService.getTrackingDetails(order._id);
            setTracking(data);
        } catch (error) {
            console.error("Error fetching tracking:", error);
        } finally {
            setTrackingLoading(false);
        }
    };

    useEffect(() => {
        fetchOrder();
    }, [params.id]);

    useEffect(() => {
        if (order?.awbCode && !tracking) {
            fetchTracking();
        }
    }, [order?.awbCode]);

    const paymentMethod = order?.transactionDetails?.paymentMethod || order?.paymentMethod || "razorpay";
    const isRazorpay = String(paymentMethod).toLowerCase().includes("razorpay") || paymentMethod === "prepaid";

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );

    if (!order) return (
        <div className="min-h-screen pt-40 text-center">
            <h1 className="text-2xl font-bold uppercase tracking-widest mb-4">Order Not Found</h1>
            <Link href="/all-products" className="btn-primary">Back to All Products</Link>
        </div>
    );

    return (
        <section className="pt-28 pb-12">
            <div className="container mx-auto px-6 max-w-4xl">
                <Link href="/all-products" className="flex items-center space-x-2 text-[10px] uppercase tracking-widest font-bold text-gray-400 hover:text-primary transition-colors mb-6">
                    <ChevronLeftIcon className="w-3 h-3" />
                    <span>Continue Shopping</span>
                </Link>

                {paymentSuccess && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-emerald-50 border border-emerald-100 p-8 text-center mb-12 shadow-sm"
                    >
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckBurstIcon className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold uppercase tracking-tight text-emerald-900 mb-2">Payment Successful!</h2>
                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest">Thank you for your purchase. Your order is now being processed.</p>
                    </motion.div>
                )}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-tight mb-1">
                            {order.isDelivered ? "Order Delivered" : order.awbCode ? "Order Shipped" : "Order Placed"}
                        </h1>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Order ID: #{order._id?.slice(-8)}</p>
                    </div>
                    <div className="flex items-center space-x-3 bg-white px-4 py-2 border border-gray-100 shadow-sm">
                        {order.isPaid ? (
                            <div className="flex items-center space-x-2 text-emerald-600">
                                <CheckBurstIcon className="w-5 h-5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Payment Received</span>
                            </div>
                        ) : (
                            <div className="flex items-center space-x-2 text-amber-500">
                                <Clock className="w-5 h-5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Payment Pending</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Details */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Status Timeline */}
                        <div className="bg-white p-6 border border-gray-100 shadow-sm">
                            <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-100">
                                <h2 className="text-[10px] font-bold uppercase tracking-widest flex items-center space-x-3">
                                    <TruckIcon className="w-4 h-4" />
                                    <span>Delivery Status</span>
                                </h2>
                                {order.shippingStatus && (
                                    <div className="flex items-center space-x-2 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                                        <span className="text-[9px] font-black uppercase tracking-tighter text-primary">
                                            {order.shippingStatus}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="relative flex justify-between items-center px-6">
                                <div className="absolute left-6 right-6 top-4 h-[1px] bg-gray-100 z-0"></div>
                                <div className={`absolute left-6 top-4 h-[1px] bg-primary z-0 transition-all duration-1000 ${order.awbCode ? 'w-1/2' : 'w-0'} ${order.isDelivered ? 'w-[calc(100%-48px)]' : ''}`}></div>

                                <div className="relative z-10 flex flex-col items-center">
                                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center mb-3">
                                        <CheckBurstIcon className="w-4 h-4" />
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Placed</span>
                                </div>

                                <div className="relative z-10 flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 transition-colors ${order.awbCode ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-gray-100 text-gray-400'}`}>
                                        <PackageIcon className="w-4 h-4" />
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Shipped</span>
                                </div>

                                <div className="relative z-10 flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 transition-colors ${order.isDelivered ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-gray-100 text-gray-400'}`}>
                                        <TruckIcon className="w-4 h-4" />
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Delivered</span>
                                </div>
                            </div>

                            {order.awbCode && (
                                <div className="mt-10 p-4 border border-gray-100 rounded-lg bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100">
                                            <PackageIcon className="w-5 h-5 text-gray-600" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Courier: {order.courierName || 'DTDC'}</p>
                                            <p className="text-xs font-bold uppercase tracking-tight">AWB: {order.awbCode}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowTrackingModal(true)}
                                        className="w-full sm:w-auto px-6 py-2 bg-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center space-x-2"
                                    >
                                        <SearchIcon className="w-3 h-3" />
                                        <span>Track Live Status</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Order Items */}
                        <div className="bg-white p-8 border border-gray-100 shadow-sm">
                            <h2 className="text-sm font-bold uppercase tracking-widest mb-8 pb-4 border-b border-gray-100">Ordered Items</h2>
                            <div className="space-y-8">
                                {(order.orderItems || []).map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-6">
                                            <div className="relative w-24 h-28 bg-gray-50 overflow-hidden rounded flex-shrink-0">
                                                <SafeImage src={resolveImageUrl(item.image)} alt={item.name} fill className="object-cover" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest mb-1">{item.name}</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{item.qty} x ₹{Number(item.price).toFixed(2)}</p>
                                                {(item.color || item.size) && (
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                                        {[item.size, item.color].filter(Boolean).join(" · ")}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold">₹{((item.qty || 0) * (Number(item.price) || 0)).toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar info */}
                    <div className="space-y-6 h-fit lg:sticky lg:top-28">
                        <div className="bg-white p-6 border border-gray-100 shadow-sm">
                            <h3 className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-4 flex items-center space-x-2">
                                <MapPin className="w-2.5 h-2.5" />
                                <span>Shipping Address</span>
                            </h3>
                            <div className="text-sm font-bold uppercase tracking-tight mb-2">{order.user.name}</div>
                            <div className="text-xs text-gray-600 space-y-1">
                                <p>{order.shippingAddress.address}</p>
                                <p>{order.shippingAddress.city}, {order.shippingAddress.state}, {order.shippingAddress.postalCode}</p>
                                <p>{order.shippingAddress.country}</p>
                            </div>
                        </div>

                        {order.isGift && (
                            <div className="bg-emerald-50 border border-emerald-100 p-6 shadow-sm">
                                <h3 className="text-[9px] uppercase tracking-widest font-bold text-emerald-600 mb-2 flex items-center space-x-2">
                                    <PackageIcon className="w-2.5 h-2.5" />
                                    <span>Gift Order</span>
                                </h3>
                                {order.giftMessage ? (
                                    <p className="text-xs text-emerald-900 italic font-medium">&ldquo;{order.giftMessage}&rdquo;</p>
                                ) : (
                                    <p className="text-[10px] text-emerald-600/70 italic uppercase tracking-widest font-bold">No message provided</p>
                                )}
                            </div>
                        )}

                        <div className="bg-white p-6 border border-gray-100 shadow-sm">
                            <h3 className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-3 border-b border-gray-100 pb-3">Payment</h3>
                            <div className="mb-6 flex items-center gap-2">
                                {isRazorpay ? (
                                    <>
                                        <Smartphone className="w-4 h-4 text-gray-600" />
                                        <span className="text-sm font-bold uppercase tracking-widest">Razorpay</span>
                                    </>
                                ) : (
                                    <span className="text-sm font-bold uppercase tracking-widest">{paymentMethod}</span>
                                )}
                            </div>
                            {isRazorpay && !order.isPaid && (
                                <p className="text-xs text-gray-500 mb-6">Complete payment online to confirm your order.</p>
                            )}

                            <div className="space-y-4 mb-8">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                    <span className="text-gray-400 font-normal">Subtotal</span>
                                    <span>₹{(order.itemsPrice ?? order.total).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                    <span className="text-gray-400 font-normal">Shipping</span>
                                    <span>{(order.shippingPrice ?? order.deliveryAmount ?? 0) === 0 ? "FREE" : `₹${(order.shippingPrice ?? order.deliveryAmount).toFixed(2)}`}</span>
                                </div>
                                {order.isGift && (
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                        <span className="text-emerald-600 font-normal">Gift Wrap</span>
                                        <span className="text-emerald-600">+₹{(order.giftFee || 39).toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between text-base font-bold uppercase tracking-widest border-t border-gray-100 pt-6">
                                <span>Total Amount</span>
                                <span className="text-accent">₹{(order.totalPrice ?? order.finalPrice).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

                {/* Tracking Modal */}
                <AnimatePresence>
                    {showTrackingModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowTrackingModal(false)}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="relative w-full max-w-lg bg-white shadow-2xl overflow-hidden"
                            >
                                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-tight">Live Tracking</h3>
                                        {order.awbCode && (
                                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                                AWB: {order.awbCode}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setShowTrackingModal(false)}
                                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                    >
                                        <ChevronLeftIcon className="w-4 h-4 rotate-180" />
                                    </button>
                                </div>

                                <div className="p-6 max-h-[60vh] overflow-y-auto">
                                    {trackingLoading ? (
                                        <div className="py-12 flex flex-col items-center justify-center space-y-4">
                                            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Fetching live status...</p>
                                        </div>
                                    ) : tracking?.tracking_data?.shipment_track?.[0] ? (
                                        <div className="space-y-8">
                                            {/* Status Header */}
                                            <div className="bg-primary/5 p-4 border border-primary/10 flex items-center justify-between">
                                                <div className="flex items-center space-x-3">
                                                    <PackageIcon className="w-5 h-5 text-primary" />
                                                    <div>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Current Status</p>
                                                        <p className="text-xs font-black uppercase tracking-tight text-primary">
                                                            {tracking.tracking_data.shipment_track[0].current_status}
                                                        </p>
                                                    </div>
                                                </div>
                                                <MapPin className="w-4 h-4 text-primary opacity-20" />
                                            </div>

                                            {/* Activity List */}
                                            <div className="space-y-6">
                                                {tracking.tracking_data.shipment_track_activities.map((activity, idx) => (
                                                    <div key={idx} className="relative flex space-x-4">
                                                        {idx !== tracking.tracking_data.shipment_track_activities.length - 1 && (
                                                            <div className="absolute left-2 top-5 bottom-[-24px] w-[1px] bg-gray-100"></div>
                                                        )}
                                                        <div className={`relative z-10 w-4 h-4 rounded-full mt-1 flex-shrink-0 ${idx === 0 ? 'bg-primary border-4 border-primary/20 shadow-lg shadow-primary/30' : 'bg-gray-200'}`}></div>
                                                        <div className="flex-1 pb-2">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                                                                <p className={`text-[10px] font-bold uppercase tracking-wide ${idx === 0 ? 'text-primary' : 'text-gray-900'}`}>
                                                                    {activity.activity}
                                                                </p>
                                                                <p className="text-[9px] text-gray-400 font-medium">
                                                                    {activity.date}
                                                                </p>
                                                            </div>
                                                            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">
                                                                {activity.location}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-12 text-center">
                                            <InfoIcon className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Tracking information not yet available from the carrier.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 bg-gray-50 flex items-center justify-end border-t border-gray-100 mt-2">
                                    <button
                                        onClick={() => setShowTrackingModal(false)}
                                        className="text-[9px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-gray-200 transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
        </section>
    );
}

export default function OrderPage({ params: paramsPromise }) {
    return (
        <main className="min-h-screen bg-[#fcfcfc]">
            <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            }>
                <OrderContent params={paramsPromise} />
            </Suspense>
        </main>
    );
}
