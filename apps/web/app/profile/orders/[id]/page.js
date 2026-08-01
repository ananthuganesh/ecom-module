"use client";

import { Clock, MapPin, Printer, RefreshCw, RotateCcw } from "lucide-react";
import {
  CardIcon,
  CheckBurstIcon,
  ChevronLeftIcon,
  ErrorIcon,
  InfoIcon,
  PackageIcon,
  TruckIcon
} from "@/components/icons/storeIcons";
import { useState, useEffect, use } from "react";
import { orderService } from "@/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import Invoice from "@/components/order/Invoice";

const STATUS_CONFIG = {
    "order placed": { icon: Clock, color: "text-amber-500", label: "Order Received" },
    "processing": { icon: RefreshCw, color: "text-blue-400", label: "Processing" },
    "shipped": { icon: TruckIcon, color: "text-purple-500", label: "Shipped" },
    "out for delivery": { icon: TruckIcon, color: "text-blue-500", label: "Out for Delivery" },
    "delivered": { icon: CheckBurstIcon, color: "text-emerald-500", label: "Delivered" },
    "cancelled": { icon: ErrorIcon, color: "text-red-500", label: "Cancelled" },
    "return requested": { icon: RotateCcw, color: "text-amber-600", label: "Return Requested" },
    "returned": { icon: RotateCcw, color: "text-gray-500", label: "Returned" },
};

export default function OrderDetailsPage({ params: paramsPromise }) {
    const params = use(paramsPromise);
    const orderId = params.id;
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrderDetails = async () => {
            try {
                const data = await orderService.getById(orderId);
                console.log("Order status received:", data.status);
                setOrder(data);
            } catch (error) {
                console.error("Error fetching order details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchOrderDetails();
        
        // Polling for updates
        const interval = setInterval(fetchOrderDetails, 10000); // 10 seconds
        return () => clearInterval(interval);
    }, [orderId]);

    const handlePrintInvoice = () => {
        window.print();
    };

    if (loading) return (
        <DashboardLayout>
            <div className="py-20 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        </DashboardLayout>
    );

    if (!order) return (
        <DashboardLayout>
            <div className="bg-white p-20 text-center border border-gray-100">
                <InfoIcon className="w-12 h-12 text-gray-200 mx-auto mb-6" />
                <p className="text-gray-500 uppercase tracking-widest font-bold text-xs mb-8">Order not found.</p>
                <Link href="/profile/orders" className="btn-primary">Back to Orders</Link>
            </div>
        </DashboardLayout>
    );

    const items = order.orderItems || order.items || [];
    const status = order.orderStatus || order.status || "order placed";
    const config = STATUS_CONFIG[status] || STATUS_CONFIG["order placed"];

    return (
        <DashboardLayout>
            <div className="mb-8 no-print">
                <Link href="/profile/orders" className="flex items-center space-x-2 text-[10px] uppercase tracking-widest font-black text-gray-400 hover:text-primary transition-colors">
                    <ChevronLeftIcon className="w-4 h-4" />
                    <span>Back to Orders</span>
                </Link>
            </div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-12 no-print">
                <div className="no-print">
                    <h1 className="text-3xl font-black uppercase tracking-tight text-primary mb-2">
                        Order #{order._id?.slice(-8)}
                    </h1>
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">
                        Placed on {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 no-print">
                    <button 
                        onClick={handlePrintInvoice}
                        className="flex items-center space-x-2 px-6 py-2 bg-white border border-gray-100 shadow-sm text-primary hover:border-accent transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Print Invoice</span>
                    </button>
                    <div className={`flex items-center space-x-2 px-6 py-2 bg-white border border-gray-100 shadow-sm ${config.color}`}>
                        <config.icon className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{config.label}</span>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    #admin-sidebar, header, footer, nav, aside, .sidebar-info { display: none !important; }
                    main { padding: 0 !important; margin: 0 !important; background: white !important; }
                    .container { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
                    body { background: white !important; }
                }
            `}</style>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 no-print">
                {/* Product List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-50">
                            <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-primary">Items in current order</h2>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {items.map((item, idx) => (
                                <div key={idx} className="p-6 flex items-center space-x-6">
                                    <div className="relative w-20 h-28 bg-gray-50 border border-gray-50 shrink-0">
                                        <SafeImage src={item.image} alt={item.name} fill className="object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold text-primary uppercase mb-1 truncate">{item.name}</h3>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-4">
                                            Qty: {item.qty}
                                        </p>
                                        <div className="text-sm font-black text-primary uppercase tracking-tight">
                                            ₹{item.price?.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Detailed Timeline */}
                    <div className="bg-white p-8 border border-gray-100 shadow-sm">
                        <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-primary mb-8 border-b border-gray-50 pb-4">Real-time Tracking</h2>
                        <div className="space-y-8">
                            {[
                                { 
                                    date: order.createdAt, 
                                    label: "Order Placed", 
                                    desc: "Your order has been received and is being processed.", 
                                    done: true 
                                },
                                { 
                                    date: null, 
                                    label: "Processing", 
                                    desc: "We are preparing your items for shipment.", 
                                    done: ["processing", "shipped", "out for delivery", "delivered"].includes(status.toLowerCase()) 
                                },
                                { 
                                    date: null, 
                                    label: "Shipped", 
                                    desc: "Order has been handed over to the courier.", 
                                    done: ["shipped", "out for delivery", "delivered"].includes(status.toLowerCase()) 
                                },
                                { 
                                    date: null, 
                                    label: "Out for Delivery", 
                                    desc: "Your package is with the delivery agent and will reach you today.", 
                                    done: ["out for delivery", "delivered"].includes(status.toLowerCase()) 
                                },
                                { 
                                    date: order.deliveryDate, 
                                    label: "Delivered", 
                                    desc: "PackageIcon delivered to your address.", 
                                    done: status.toLowerCase() === "delivered" 
                                },
                            ].map((step, idx, arr) => (
                                <div key={idx} className="flex space-x-6 relative">
                                    {idx !== arr.length - 1 && (
                                        <div className={`absolute left-[7px] top-6 w-[2px] h-[calc(100%+8px)] ${step.done ? 'bg-emerald-500' : 'bg-gray-100'}`} />
                                    )}
                                    <div className={`w-4 h-4 rounded-full border-2 bg-white z-10 shrink-0 ${step.done ? 'border-emerald-500' : 'border-gray-200'}`}>
                                        {step.done && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mx-auto mt-[1px]" />}
                                    </div>
                                    <div className="-mt-1">
                                        <p className={`text-[10px] uppercase tracking-widest font-black ${step.done ? 'text-primary' : 'text-gray-300'}`}>
                                            {step.label}
                                        </p>
                                        <p className="text-[9px] text-gray-400 font-medium mb-1">{step.desc}</p>
                                        {step.date && (
                                            <p className="text-[8px] font-bold text-gray-400 uppercase">{new Date(step.date).toLocaleString()}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sidebar InfoIcon */}
                <div className="space-y-8 no-print">
                    {/* Summary */}
                    <div className="bg-white p-8 border border-gray-100 shadow-sm">
                        <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-primary mb-6 border-b border-gray-50 pb-4">Order Summary</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                                <span>Subtotal</span>
                                <span>₹{(order.totalPrice - (order.shippingPrice || 0) - (order.taxPrice || 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                                <span>Shipping</span>
                                <span>₹{order.shippingPrice?.toFixed(2) || "0.00"}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                                <span>Tax</span>
                                <span>₹{order.taxPrice?.toFixed(2) || "0.00"}</span>
                            </div>
                            {order.isGift && (
                                <div className="flex justify-between text-xs font-bold text-emerald-600 uppercase tracking-widest">
                                    <span>Gift Wrap</span>
                                    <span>+₹{(order.giftFee || 39).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="pt-4 border-t border-gray-50 flex justify-between text-lg font-black text-primary uppercase tracking-tight">
                                <span>Total</span>
                                <span className="text-accent">₹{order.totalPrice?.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Gift Details */}
                    {order.isGift && (
                        <div className="bg-emerald-50 p-8 border border-emerald-100 shadow-sm">
                            <div className="flex items-center space-x-2 text-emerald-600 mb-4">
                                <PackageIcon className="w-4 h-4 text-emerald-500" />
                                <h2 className="text-[10px] uppercase tracking-[0.2em] font-black">Gift Order</h2>
                            </div>
                            {order.giftMessage ? (
                                <p className="text-xs text-emerald-900 italic font-medium">"{order.giftMessage}"</p>
                            ) : (
                                <p className="text-[10px] text-emerald-600/70 italic uppercase tracking-widest font-bold">No message provided</p>
                            )}
                        </div>
                    )}

                    {/* Shipping Address */}
                    <div className="bg-white p-8 border border-gray-100 shadow-sm">
                        <div className="flex items-center space-x-2 text-primary mb-4">
                            <MapPin className="w-4 h-4 text-accent" />
                            <h2 className="text-[10px] uppercase tracking-[0.2em] font-black">Shipping Address</h2>
                        </div>
                        <div className="text-xs text-gray-600 leading-relaxed font-medium">
                            {order.shippingAddress?.address}<br />
                            {order.shippingAddress?.city}, {order.shippingAddress?.postalCode}<br />
                            {order.shippingAddress?.country}
                        </div>
                    </div>

                    {/* Payment InfoIcon */}
                    <div className="bg-white p-8 border border-gray-100 shadow-sm">
                        <div className="flex items-center space-x-2 text-primary mb-4">
                            <CardIcon className="w-4 h-4 text-accent" />
                            <h2 className="text-[10px] uppercase tracking-[0.2em] font-black">Payment Details</h2>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-primary uppercase">
                                {order.paymentMethod || "COD"}
                            </p>
                            <div className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full ${order.isPaid ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                                {order.isPaid ? <CheckBurstIcon className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                <span className="text-[9px] font-black uppercase tracking-widest">
                                    {order.isPaid ? 'Payment Received' : 'Payment Pending'}
                                </span>
                            </div>
                            {order.transactionId && (
                                <p className="text-[9px] font-mono text-gray-400 mt-2 break-all">
                                    ID: {order.transactionId}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <Invoice order={order} />
        </DashboardLayout>
    );
}
