"use client";

import { Clock } from "lucide-react";
import {
  CheckBurstIcon,
  ErrorIcon,
  PackageIcon,
  TruckIcon
} from "@/components/icons/storeIcons";
import { useState, useEffect } from "react";
import { orderService } from "@/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import Link from "next/link";
import SafeImage from "@/components/SafeImage";

const STATUS_ICONS = {
    "order placed": { icon: Clock, color: "text-amber-500", bg: "bg-amber-50" },
    "shipped": { icon: TruckIcon, color: "text-purple-500", bg: "bg-purple-50" },
    "out for delivery": { icon: TruckIcon, color: "text-blue-500", bg: "bg-blue-50" },
    "delivered": { icon: CheckBurstIcon, color: "text-emerald-500", bg: "bg-emerald-50" },
    "cancelled": { icon: ErrorIcon, color: "text-red-500", bg: "bg-red-50" },
    "return requested": { icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    "returned": { icon: Clock, color: "text-gray-500", bg: "bg-gray-50" },
};

export default function MyOrdersPage() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const data = await orderService.getMyOrders();
                setOrders(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Error fetching orders:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, []);

    return (
        <DashboardLayout title="My Orders">
            {loading ? (
                <div className="py-20 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : orders.length === 0 ? (
                <div className="bg-white p-20 text-center border border-gray-100 shadow-sm">
                    <PackageIcon className="w-12 h-12 text-gray-200 mx-auto mb-6" />
                    <p className="text-gray-500 uppercase tracking-widest font-bold text-xs mb-8">You haven't placed any orders yet.</p>
                    <Link href="/all-products" className="btn-primary">Start Shopping</Link>
                </div>
            ) : (
                <div className="space-y-6">
                    {orders.map((order) => {
                        const status = order.orderStatus || order.status || "order placed";
                        const config = STATUS_ICONS[status] || STATUS_ICONS["order placed"];
                        const StatusIcon = config.icon;
                        const statusColor = config.color;
                        const statusBg = config.bg;
                        const items = order.orderItems || order.items || [];
                        const price = order.totalPrice || order.finalPrice || 0;

                        return (
                            <div 
                                key={order._id}
                                className="bg-white p-6 md:p-8 border border-gray-100 shadow-sm hover:border-accent transition-all group"
                            >
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center space-x-3 mb-4">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-secondary px-2 py-1 flex items-center gap-2">
                                                <span>Order #{order._id?.slice(-8)}</span>
                                                {order.isGift && (
                                                    <span className="bg-emerald-100 text-emerald-700 text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-widest leading-none">GIFT</span>
                                                )}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                                {new Date(order.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        
                                        <div className="flex flex-wrap gap-3 mb-4">
                                            {items.slice(0, 4).map((item, idx) => (
                                                <div key={idx} className="relative w-12 h-16 bg-gray-50 border border-gray-50">
                                                    <SafeImage src={item.image} alt="product" fill className="object-cover" />
                                                </div>
                                            ))}
                                            {items.length > 4 && (
                                                <div className="w-12 h-16 bg-gray-50 flex items-center justify-center text-[10px] font-bold text-gray-400 border border-gray-50">
                                                    +{items.length - 4}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold truncate max-w-sm">
                                            {items.map(i => i.name).join(", ")}
                                        </p>
                                    </div>

                                    <div className="flex flex-col md:items-end gap-4 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-gray-50">
                                        <div className="text-xl font-black uppercase tracking-tight text-primary">
                                            ₹{Number(price).toFixed(2)}
                                        </div>
                                        
                                        <div className="flex items-center space-x-4">
                                            <div className={`flex items-center space-x-1.5 px-3 py-1 ${statusBg} ${statusColor} rounded-full`}>
                                                <StatusIcon className="w-3 h-3" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">{status}</span>
                                            </div>
                                            
                                            <Link 
                                                href={`/profile/orders/${order._id}`}
                                                className="text-[10px] font-black uppercase tracking-widest text-primary border-b-2 border-accent transition-all pb-1 hover:border-primary"
                                            >
                                                View Details
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </DashboardLayout>
    );
}
