"use client";

import { PackageIcon } from "@/components/icons/storeIcons";
import { useState, useEffect } from "react";
import { orderService } from "@/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AccountOrderRow from "@/components/dashboard/AccountOrderRow";
import Link from "next/link";

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
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="divide-y divide-gray-100">
            {orders.map((order) => (
              <Link
                key={order._id}
                href={`/account/orders/${order._id}`}
                className="block transition-colors hover:bg-gray-50"
              >
                <AccountOrderRow order={order} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}
