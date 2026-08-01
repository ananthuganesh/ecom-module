"use client";

import { Clock } from "lucide-react";
import {
  BagIcon,
  CheckBurstIcon,
  ChevronRightIcon,
  HeartBagIcon
} from "@/components/icons/storeIcons";
import { useState, useEffect } from "react";
import { orderService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useWishlistStore } from "@/store/useWishlistStore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import Link from "next/link";
import { motion } from "framer-motion";
import SafeImage from "@/components/SafeImage";

export default function DashboardOverview() {
    const { userInfo } = useAuthStore();
    const wishlistCount = useWishlistStore((s) => s.wishlistItems.length);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const data = await orderService.getMyOrders();
                setOrders(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Error fetching dashboard data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    const stats = {
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => !o.isPaid && o.orderStatus !== "Cancelled").length,
        completedOrders: orders.filter(o => o.orderStatus === "Delivered").length,
        wishlistCount,
    };

    return (
        <DashboardLayout title={`Welcome back, ${userInfo?.name?.split(' ')[0]}`}>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {[
                    { label: "Total Orders", value: stats.totalOrders, icon: BagIcon, color: "text-blue-500", bg: "bg-blue-50" },
                    { label: "Pending Orders", value: stats.pendingOrders, icon: Clock, color: "text-amber-500", bg: "bg-amber-50" },
                    { label: "Completed", value: stats.completedOrders, icon: CheckBurstIcon, color: "text-emerald-500", bg: "bg-emerald-50" },
                    { label: "Wishlist", value: stats.wishlistCount, icon: HeartBagIcon, color: "text-rose-500", bg: "bg-rose-50" },
                ].map((stat, idx) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white p-6 border border-gray-100 shadow-sm flex items-center space-x-4"
                    >
                        <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-full flex items-center justify-center`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">{stat.label}</p>
                            <p className="text-2xl font-bold tracking-tight text-primary">{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Recent Orders */}
            <div className="bg-white border border-gray-100 shadow-sm mb-12">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                    <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Recent Orders</h2>
                    <Link href="/profile/orders" className="text-[10px] uppercase tracking-widest font-bold text-accent hover:underline flex items-center">
                        View All <ChevronRightIcon className="w-3 h-3 ml-1" />
                    </Link>
                </div>
                
                <div className="divide-y divide-gray-50">
                    {loading ? (
                        <div className="p-12 flex justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="p-12 text-center">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">No orders placed yet</p>
                        </div>
                    ) : (
                        orders.slice(0, 3).map((order) => (
                            <div key={order._id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center space-x-4">
                                    <div className="relative w-12 h-16 bg-gray-50 overflow-hidden border border-gray-100">
                                        <SafeImage 
                                            src={order.orderItems?.[0]?.image || order.items?.[0]?.productId?.thumbnails?.[0]} 
                                            alt="order" 
                                            fill 
                                            className="object-cover"
                                        />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                                            Order #{order._id?.slice(-8)}
                                        </p>
                                        <p className="text-xs font-bold text-primary uppercase">
                                            {new Date(order.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-8 w-full md:w-auto justify-between md:justify-end">
                                    <div className="text-right">
                                        <p className="text-xs font-black uppercase tracking-tight text-primary">
                                            ₹{order.totalPrice?.toFixed(2)}
                                        </p>
                                        <p className={`text-[9px] font-bold uppercase tracking-widest ${order.isPaid ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            {order.isPaid ? 'Paid' : 'Unpaid'}
                                        </p>
                                    </div>
                                    <Link 
                                        href={`/profile/orders/${order._id}`}
                                        className="p-2 border border-gray-100 hover:bg-gray-50 transition-colors"
                                    >
                                        <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                                    </Link>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Account Info Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-primary mb-6 border-b border-gray-50 pb-4">
                        Account Information
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1">Name</p>
                            <p className="text-sm font-bold text-primary">{userInfo?.name}</p>
                        </div>
                        <div>
                            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1">Email</p>
                            <p className="text-sm font-bold text-primary">{userInfo?.email}</p>
                        </div>
                        <Link href="/profile/settings" className="inline-block mt-4 text-[10px] uppercase tracking-widest font-bold text-accent border-b border-accent pb-1">
                            Edit Profile
                        </Link>
                    </div>
                </div>

                <div className="bg-white p-8 border border-gray-100 shadow-sm border-l-4 border-l-accent">
                    <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-primary mb-6 border-b border-gray-50 pb-4">
                        Shipping Address
                    </h3>
                    {userInfo?.address ? (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-600 leading-relaxed italic">
                                "{userInfo.address}"
                            </p>
                            <Link href="/profile/addresses" className="inline-block mt-4 text-[10px] uppercase tracking-widest font-bold text-accent border-b border-accent pb-1">
                                Manage Addresses
                            </Link>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-xs text-gray-400 italic mb-4">No address saved yet</p>
                            <Link href="/profile/addresses" className="btn-outline py-2 text-[9px]">
                                Add Address
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
