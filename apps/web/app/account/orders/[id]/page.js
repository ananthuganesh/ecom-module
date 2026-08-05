"use client";

import { Clock, Download, MapPin, RefreshCw, RotateCcw } from "lucide-react";
import {
  CardIcon,
  CheckBurstIcon,
  ChevronLeftIcon,
  ErrorIcon,
  InfoIcon,
  PackageIcon,
  TruckIcon,
} from "@/components/icons/storeIcons";
import { useState, useEffect, use } from "react";
import { orderService } from "@/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import Invoice from "@/components/order/Invoice";

const STATUS_CONFIG = {
  "order placed": { icon: Clock, tone: "text-amber-600", label: "Order Received" },
  processing: { icon: RefreshCw, tone: "text-gray-700", label: "Processing" },
  shipped: { icon: TruckIcon, tone: "text-gray-700", label: "Shipped" },
  "out for delivery": { icon: TruckIcon, tone: "text-gray-700", label: "Out for Delivery" },
  delivered: { icon: CheckBurstIcon, tone: "text-emerald-600", label: "Delivered" },
  cancelled: { icon: ErrorIcon, tone: "text-[#DF1721]", label: "Cancelled" },
  "return requested": { icon: RotateCcw, tone: "text-amber-600", label: "Return Requested" },
  returned: { icon: RotateCcw, tone: "text-gray-500", label: "Returned" },
};

const SHIPPED_STATUSES = new Set([
  "shipped",
  "out for delivery",
  "delivered",
]);

function canDownloadInvoice(order) {
  if (!order) return false;
  const pay = String(order.paymentStatus || "").toLowerCase();
  const paid = Boolean(order.isPaid) || pay === "paid";
  if (!paid) return false;
  const status = String(order.orderStatus || order.status || "").toLowerCase();
  const shipping = String(order.shippingStatus || "").toLowerCase();
  return SHIPPED_STATUSES.has(status) || SHIPPED_STATUSES.has(shipping);
}

export default function OrderDetailsPage({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const orderId = params.id;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        const data = await orderService.getById(orderId);
        setOrder(data);
      } catch (error) {
        console.error("Error fetching order details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrderDetails();

    const interval = setInterval(fetchOrderDetails, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  const handleDownloadInvoice = () => {
    if (!canDownloadInvoice(order)) return;
    window.print();
  };

  const formatPrice = (price) =>
    `₹${Number(price || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  if (loading) {
    return (
      <DashboardLayout title="Order details" eyebrow="Tracking">
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout title="Order details" eyebrow="Tracking">
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center">
          <InfoIcon className="mx-auto mb-4 h-10 w-10 text-gray-300" />
          <p className="mb-6 text-sm text-gray-500">Order not found.</p>
          <Link
            href="/account/orders"
            className="inline-flex h-10 items-center rounded-md bg-[#222222] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black"
          >
            Back to orders
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const items = order.orderItems || order.items || [];
  const status = (order.orderStatus || order.status || "order placed").toLowerCase();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG["order placed"];
  const StatusIcon = config.icon;
  const showInvoiceDownload = canDownloadInvoice(order);
  const subtotal =
    (order.totalPrice || 0) -
    (order.shippingPrice || 0) -
    (order.taxPrice || 0);

  return (
    <DashboardLayout
      title={`Order #${order._id?.slice(-8)}`}
      eyebrow={`Placed ${new Date(order.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`}
    >
      <div className="mb-5 no-print">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back to orders
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 no-print">
        {showInvoiceDownload ? (
          <button
            type="button"
            onClick={handleDownloadInvoice}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-900 transition-colors hover:border-gray-900"
          >
            <Download className="h-4 w-4" />
            Download invoice
          </button>
        ) : null}
        <div
          className={`inline-flex items-center gap-2 rounded-md border border-gray-200 bg-[#F8F8F8] px-4 py-2 text-[13px] font-medium ${config.tone}`}
        >
          <StatusIcon className="h-4 w-4" />
          {config.label}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          #admin-sidebar,
          header,
          footer,
          nav,
          aside,
          .sidebar-info {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .container,
          .container-site {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5 no-print">
        <div className="space-y-4 lg:col-span-2">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
              <h2 className="text-[16px] font-semibold text-gray-900">
                Items in this order
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 px-5 py-4 sm:gap-5 sm:px-6"
                >
                  <div className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-gray-100 sm:h-28 sm:w-20">
                    <SafeImage
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-gray-900">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-[13px] text-gray-500">Qty: {item.qty}</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {formatPrice(item.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="mb-6 border-b border-gray-100 pb-3 text-[16px] font-semibold text-gray-900">
              Order tracking
            </h2>
            <div className="space-y-6">
              {[
                {
                  date: order.createdAt,
                  label: "Order Placed",
                  desc: "Your order has been received and is being processed.",
                  done: true,
                },
                {
                  date: null,
                  label: "Processing",
                  desc: "We are preparing your items for shipment.",
                  done: ["processing", "shipped", "out for delivery", "delivered"].includes(
                    status
                  ),
                },
                {
                  date: null,
                  label: "Shipped",
                  desc: "Order has been handed over to the courier.",
                  done: ["shipped", "out for delivery", "delivered"].includes(status),
                },
                {
                  date: null,
                  label: "Out for Delivery",
                  desc: "Your package is with the delivery agent.",
                  done: ["out for delivery", "delivered"].includes(status),
                },
                {
                  date: order.deliveryDate,
                  label: "Delivered",
                  desc: "Package delivered to your address.",
                  done: status === "delivered",
                },
              ].map((step, idx, arr) => (
                <div key={idx} className="relative flex gap-4">
                  {idx !== arr.length - 1 ? (
                    <div
                      className={`absolute top-5 left-[7px] h-[calc(100%+8px)] w-[2px] ${
                        step.done ? "bg-[#DF1721]" : "bg-gray-200"
                      }`}
                    />
                  ) : null}
                  <div
                    className={`z-10 h-4 w-4 shrink-0 rounded-full border-2 bg-white ${
                      step.done ? "border-[#DF1721]" : "border-gray-300"
                    }`}
                  >
                    {step.done ? (
                      <div className="mx-auto mt-[3px] h-1.5 w-1.5 rounded-full bg-[#DF1721]" />
                    ) : null}
                  </div>
                  <div className="-mt-0.5">
                    <p
                      className={`text-[13px] font-semibold ${
                        step.done ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[13px] text-gray-500">{step.desc}</p>
                    {step.date ? (
                      <p className="mt-1 text-[12px] text-gray-400">
                        {new Date(step.date).toLocaleString("en-IN")}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <aside className="rounded-xl border border-gray-200 bg-[#F8F8F8] p-5 sm:p-6">
            <p className="text-[16px] font-semibold text-gray-900">Order summary</p>
            <div className="mt-4 space-y-2 text-[13px]">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>{formatPrice(order.shippingPrice)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax</span>
                <span>{formatPrice(order.taxPrice)}</span>
              </div>
              {order.isGift ? (
                <div className="flex justify-between text-gray-600">
                  <span>Gift wrap</span>
                  <span>+{formatPrice(order.giftFee || 39)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-gray-200 pt-3 text-[16px] font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatPrice(order.totalPrice)}</span>
              </div>
            </div>
          </aside>

          {order.isGift ? (
            <aside className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-2 flex items-center gap-2">
                <PackageIcon className="h-4 w-4 text-[#DF1721]" />
                <h2 className="text-[14px] font-semibold text-gray-900">Gift order</h2>
              </div>
              {order.giftMessage ? (
                <p className="text-sm italic text-gray-600">
                  &ldquo;{order.giftMessage}&rdquo;
                </p>
              ) : (
                <p className="text-[13px] text-gray-400">No message provided</p>
              )}
            </aside>
          ) : null}

          <aside className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#DF1721]" />
              <h2 className="text-[14px] font-semibold text-gray-900">Shipping address</h2>
            </div>
            <div className="text-sm leading-relaxed text-gray-600">
              {order.shippingAddress?.address}
              <br />
              {order.shippingAddress?.city}, {order.shippingAddress?.postalCode}
              <br />
              {order.shippingAddress?.country}
            </div>
          </aside>

          <aside className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <CardIcon className="h-4 w-4 text-[#DF1721]" />
              <h2 className="text-[14px] font-semibold text-gray-900">Payment details</h2>
            </div>
            <p className="text-sm font-medium text-gray-900">
              {order.paymentMethod || "Razorpay"}
            </p>
            <div
              className={`mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-[12px] font-medium ${
                order.isPaid
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-[#DF1721]"
              }`}
            >
              {order.isPaid ? (
                <CheckBurstIcon className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {order.isPaid ? "Payment received" : "Payment pending"}
            </div>
            {order.transactionId ? (
              <p className="mt-3 break-all font-mono text-[11px] text-gray-400">
                ID: {order.transactionId}
              </p>
            ) : null}
          </aside>
        </div>
      </div>

      {showInvoiceDownload ? <Invoice order={order} /> : null}
    </DashboardLayout>
  );
}
