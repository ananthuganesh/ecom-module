"use client";

import { Clock } from "lucide-react";
import {
  CheckBurstIcon,
  ChevronRightIcon,
  ErrorIcon,
  PackageIcon,
  TruckIcon,
} from "@/components/icons/storeIcons";
import { useState, useEffect } from "react";
import { orderService } from "@/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";

const STATUS_ICONS = {
  "order placed": { icon: Clock, tone: "text-black" },
  shipped: { icon: TruckIcon, tone: "text-black" },
  "out for delivery": { icon: TruckIcon, tone: "text-black" },
  delivered: { icon: CheckBurstIcon, tone: "text-black" },
  cancelled: { icon: ErrorIcon, tone: "text-[#DF1721]" },
  "return requested": { icon: Clock, tone: "text-[#DF1721]" },
  returned: { icon: Clock, tone: "text-gray-500" },
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

  const formatPrice = (price) =>
    `₹${Number(price || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <DashboardLayout title="My Orders" eyebrow="Order history">
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
        </div>
      ) : orders.length === 0 ? (
        <div className="border border-black bg-white px-6 py-16 text-center sm:px-12">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-black">
            <PackageIcon className="h-7 w-7" />
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
            Urban Aana
          </p>
          <h2 className="mt-3 font-vina text-4xl uppercase leading-none sm:text-5xl">
            No orders yet
          </h2>
          <p className="mx-auto mt-4 max-w-sm text-sm text-gray-600">
            When you place an order, it will show up here with live tracking.
          </p>
          <Link
            href="/all-products"
            className="mt-8 inline-flex h-10 items-center gap-2 bg-black px-7 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#DF1721]"
          >
            Start shopping <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const status = (order.orderStatus || order.status || "order placed").toLowerCase();
            const config = STATUS_ICONS[status] || STATUS_ICONS["order placed"];
            const StatusIcon = config.icon;
            const items = order.orderItems || order.items || [];
            const price = order.totalPrice || order.finalPrice || 0;

            return (
              <article
                key={order._id}
                className="border border-black bg-white p-5 transition-colors hover:border-[#DF1721] sm:p-6"
              >
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <span className="bg-black px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
                        Order #{order._id?.slice(-8)}
                      </span>
                      {order.isGift ? (
                        <span className="border border-black px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em]">
                          Gift
                        </span>
                      ) : null}
                      <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                      {items.slice(0, 4).map((item, idx) => (
                        <div key={idx} className="relative h-16 w-12 bg-gray-100">
                          <SafeImage src={item.image} alt="product" fill className="object-cover" />
                        </div>
                      ))}
                      {items.length > 4 ? (
                        <div className="flex h-16 w-12 items-center justify-center border border-black text-[11px] font-bold text-gray-500">
                          +{items.length - 4}
                        </div>
                      ) : null}
                    </div>

                    <p className="max-w-md truncate text-[12px] text-gray-500">
                      {items.map((i) => i.name).join(", ")}
                    </p>
                  </div>

                  <div className="flex w-full flex-col gap-4 border-t border-gray-200 pt-4 md:w-auto md:items-end md:border-t-0 md:pt-0">
                    <div className="text-xl font-black tracking-tight text-black">
                      {formatPrice(price)}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center gap-1.5 ${config.tone}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.16em]">
                          {status}
                        </span>
                      </div>
                      <Link
                        href={`/profile/orders/${order._id}`}
                        className="border-b border-[#DF1721] pb-0.5 text-[12px] font-bold uppercase tracking-[0.16em] text-[#DF1721] transition-colors hover:border-black hover:text-black"
                      >
                        View details
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
