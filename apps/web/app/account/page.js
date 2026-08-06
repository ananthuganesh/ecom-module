"use client";

import { ChevronRightIcon } from "@/components/icons/storeIcons";
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

  const orderStatus = (o) =>
    String(o.orderStatus || o.status || "").toLowerCase();
  const stats = {
    totalOrders: orders.length,
    pendingOrders: orders.filter((o) => {
      const s = orderStatus(o);
      return s && !["delivered", "cancelled", "returned"].includes(s);
    }).length,
    completedOrders: orders.filter((o) => orderStatus(o) === "delivered").length,
  };

  const formatPrice = (price) =>
    `₹${Number(price || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <DashboardLayout title={`Welcome, ${firstName}`} eyebrow="Your account">
      <div className="mb-8 grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "Total orders", value: stats.totalOrders },
          { label: "Pending", value: stats.pendingOrders },
          { label: "Delivered", value: stats.completedOrders },
        ].map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
            className="rounded-xl border border-gray-200 bg-[#F8F8F8] p-3 sm:p-5"
          >
            <p className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] leading-tight text-gray-500 sm:text-[13px]">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>

      <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-6">
          <h2 className="text-[16px] font-semibold text-gray-900">Recent orders</h2>
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#DF1721] transition-colors hover:text-gray-900"
          >
            View all <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="flex justify-center p-14">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : orders.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm text-gray-500">No orders placed yet</p>
              <Link
                href="/all-products"
                className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-[#222222] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black"
              >
                Shop the collection
              </Link>
            </div>
          ) : (
            orders.slice(0, 3).map((order) => (
              <div
                key={order._id}
                className="flex flex-col items-start justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6"
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-12 overflow-hidden rounded-md bg-gray-100">
                    <SafeImage
                      src={
                        order.orderItems?.[0]?.image ||
                        order.items?.[0]?.productId?.thumbnails?.[0]
                      }
                      alt="order"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-900">
                      Order #{order._id?.slice(-8)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-gray-500">
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
                    <p className="text-sm font-semibold text-gray-900">
                      {formatPrice(order.totalPrice)}
                    </p>
                    <p className="mt-0.5 text-[12px] capitalize text-gray-500">
                      {String(order.orderStatus || order.status || "Order placed")}
                    </p>
                  </div>
                  <Link
                    href={`/account/orders/${order._id}`}
                    className="rounded-md border border-gray-200 p-2 text-gray-600 transition-colors hover:border-gray-900 hover:bg-gray-900 hover:text-white"
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <h3 className="border-b border-gray-200 pb-3 text-[16px] font-semibold text-gray-900">
            Account information
          </h3>
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-[12px] text-gray-500">Name</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{userInfo?.name}</p>
            </div>
            <div>
              <p className="text-[12px] text-gray-500">Email</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{userInfo?.email}</p>
            </div>
            <Link
              href="/account/settings"
              className="inline-block text-[13px] font-medium text-[#DF1721] transition-colors hover:text-gray-900"
            >
              Edit profile
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-[#F8F8F8] p-5 sm:p-6">
          <h3 className="border-b border-gray-200 pb-3 text-[16px] font-semibold text-gray-900">
            Shipping address
          </h3>
          {userInfo?.address ? (
            <div className="mt-5">
              <p className="text-sm leading-relaxed text-gray-600">{userInfo.address}</p>
              <Link
                href="/account/addresses"
                className="mt-4 inline-block text-[13px] font-medium text-[#DF1721] transition-colors hover:text-gray-900"
              >
                Manage addresses
              </Link>
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-sm text-gray-500">No address saved yet.</p>
              <Link
                href="/account/addresses"
                className="mt-4 inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-5 text-[13px] font-medium text-gray-900 transition-colors hover:border-gray-900"
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
