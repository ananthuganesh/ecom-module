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
  "order placed": { icon: Clock, tone: "text-gray-700" },
  abandoned: { icon: ErrorIcon, tone: "text-[#DF1721]" },
  shipped: { icon: TruckIcon, tone: "text-gray-700" },
  "out for delivery": { icon: TruckIcon, tone: "text-gray-700" },
  delivered: { icon: CheckBurstIcon, tone: "text-emerald-700" },
  cancelled: { icon: ErrorIcon, tone: "text-[#DF1721]" },
  "return requested": { icon: Clock, tone: "text-[#DF1721]" },
  returned: { icon: Clock, tone: "text-gray-500" },
};

function orderDisplayStatus(order) {
  const status = String(order.orderStatus || order.status || "order placed").toLowerCase();
  const pay = String(order.paymentStatus || "").toLowerCase();
  if (status === "abandoned") return "payment incomplete";
  if (
    status === "order placed" &&
    pay &&
    !["paid", "refunded", "partially_refunded"].includes(pay)
  ) {
    const ship = String(order.shippingStatus || "").toLowerCase();
    if (ship === "payment pending" || pay === "pending" || pay === "created") {
      return "payment incomplete";
    }
  }
  return status;
}

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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center sm:px-12">
          <PackageIcon className="mx-auto mb-4 h-10 w-10 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No orders yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
            When you place an order, it will show up here with tracking.
          </p>
          <Link
            href="/all-products"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[#222222] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = orderDisplayStatus(order);
            const config =
              STATUS_ICONS[status] ||
              (status === "payment incomplete"
                ? STATUS_ICONS.abandoned
                : STATUS_ICONS["order placed"]);
            const StatusIcon = config.icon;
            const items = order.orderItems || order.items || [];
            const price = order.totalPrice || order.finalPrice || 0;
            const isIncomplete =
              status === "payment incomplete" || status === "abandoned";

            return (
              <article
                key={order._id}
                className="rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300 sm:p-6"
              >
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#222222] px-2.5 py-1 text-[11px] font-semibold text-white">
                        Order #{order._id?.slice(-8)}
                      </span>
                      {order.isGift ? (
                        <span className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                          Gift
                        </span>
                      ) : null}
                      {isIncomplete ? (
                        <span className="rounded-md border border-[#DF1721]/30 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-[#DF1721]">
                          Incomplete payment
                        </span>
                      ) : null}
                      <span className="text-[12px] text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      {items.slice(0, 4).map((item, idx) => (
                        <div
                          key={idx}
                          className="relative h-16 w-12 overflow-hidden rounded-md bg-gray-100"
                        >
                          <SafeImage
                            src={item.image}
                            alt="product"
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                      {items.length > 4 ? (
                        <div className="flex h-16 w-12 items-center justify-center rounded-md border border-gray-200 text-[11px] font-medium text-gray-500">
                          +{items.length - 4}
                        </div>
                      ) : null}
                    </div>

                    <p className="max-w-md truncate text-[13px] text-gray-500">
                      {items.map((i) => i.name).join(", ")}
                    </p>
                  </div>

                  <div className="flex w-full flex-col gap-3 border-t border-gray-100 pt-4 md:w-auto md:items-end md:border-t-0 md:pt-0">
                    <div className="text-lg font-semibold tracking-tight text-gray-900">
                      {formatPrice(price)}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center gap-1.5 ${config.tone}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        <span className="text-[12px] font-medium capitalize">
                          {status}
                        </span>
                      </div>
                      <Link
                        href={`/account/orders/${order._id}`}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-[#DF1721] transition-colors hover:text-gray-900"
                      >
                        View details <ChevronRightIcon className="h-3.5 w-3.5" />
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
