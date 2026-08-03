"use client";

import { Clock } from "lucide-react";
import {
  BagIcon,
  CheckBurstIcon,
  ChevronRightIcon,
} from "@/components/icons/storeIcons";
import { useState, useEffect } from "react";
import { orderService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Link from "next/link";
import { motion } from "framer-motion";
import SafeImage from "@/components/SafeImage";

export default function DashboardOverview() {
  const { userInfo } = useAuthStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const firstName = userInfo?.name?.split(" ")[0] || "there";

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
    pendingOrders: orders.filter((o) => !o.isPaid && o.orderStatus !== "Cancelled").length,
    completedOrders: orders.filter((o) => o.orderStatus === "Delivered").length,
  };

  const formatPrice = (price) => `₹${Number(price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <DashboardLayout title={`Welcome, ${firstName}`} eyebrow="Member hub">
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Total orders", value: stats.totalOrders, icon: BagIcon },
          { label: "Pending", value: stats.pendingOrders, icon: Clock },
          { label: "Delivered", value: stats.completedOrders, icon: CheckBurstIcon },
        ].map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="border border-black bg-white p-5"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center bg-black text-white">
              <stat.icon className="h-5 w-5" />
            </div>
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-gray-500">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight text-black">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <section className="mb-10 border border-black bg-white">
        <div className="flex items-center justify-between border-b border-black px-5 py-4 sm:px-6">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-black">
            Recent orders
          </h2>
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-[0.16em] text-[#DF1721] transition-colors hover:text-black"
          >
            View all <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-gray-200">
          {loading ? (
            <div className="flex justify-center p-14">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
            </div>
          ) : orders.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400">
                No orders placed yet
              </p>
              <Link
                href="/all-products"
                className="mt-6 inline-flex h-10 items-center gap-2 bg-black px-6 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#DF1721]"
              >
                Shop the collection <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            orders.slice(0, 3).map((order) => (
              <div
                key={order._id}
                className="flex flex-col items-start justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6"
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-12 overflow-hidden bg-gray-100">
                    <SafeImage
                      src={order.orderItems?.[0]?.image || order.items?.[0]?.productId?.thumbnails?.[0]}
                      alt="order"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#DF1721]">
                      Order #{order._id?.slice(-8)}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-black">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex w-full items-center justify-between gap-6 sm:w-auto sm:justify-end">
                  <div className="text-right">
                    <p className="text-sm font-black text-black">{formatPrice(order.totalPrice)}</p>
                    <p
                      className={`mt-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                        order.isPaid ? "text-black" : "text-[#DF1721]"
                      }`}
                    >
                      {order.isPaid ? "Paid" : "Unpaid"}
                    </p>
                  </div>
                  <Link
                    href={`/account/orders/${order._id}`}
                    className="border border-black p-2 transition-colors hover:bg-black hover:text-white"
                    aria-label="View order"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="border border-black bg-white p-6 sm:p-8">
          <h3 className="border-b border-black pb-4 text-[12px] font-bold uppercase tracking-[0.2em]">
            Account information
          </h3>
          <div className="mt-6 space-y-4">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gray-500">Name</p>
              <p className="mt-1 text-sm font-bold text-black">{userInfo?.name}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gray-500">Email</p>
              <p className="mt-1 text-sm font-bold text-black">{userInfo?.email}</p>
            </div>
            <Link
              href="/account/settings"
              className="mt-2 inline-block border-b border-[#DF1721] pb-0.5 text-[12px] font-bold uppercase tracking-[0.16em] text-[#DF1721] transition-colors hover:border-black hover:text-black"
            >
              Edit profile
            </Link>
          </div>
        </section>

        <section className="border border-black border-l-4 border-l-[#DF1721] bg-white p-6 sm:p-8">
          <h3 className="border-b border-black pb-4 text-[12px] font-bold uppercase tracking-[0.2em]">
            Shipping address
          </h3>
          {userInfo?.address ? (
            <div className="mt-6">
              <p className="text-sm leading-relaxed text-gray-600">{userInfo.address}</p>
              <Link
                href="/account/addresses"
                className="mt-5 inline-block border-b border-[#DF1721] pb-0.5 text-[12px] font-bold uppercase tracking-[0.16em] text-[#DF1721] transition-colors hover:border-black hover:text-black"
              >
                Manage addresses
              </Link>
            </div>
          ) : (
            <div className="mt-6">
              <p className="text-sm text-gray-500">No address saved yet.</p>
              <Link
                href="/account/addresses"
                className="mt-5 inline-flex h-10 items-center gap-2 border border-black px-5 text-xs font-bold uppercase tracking-[0.16em] transition-colors hover:bg-black hover:text-white"
              >
                Add address
              </Link>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
