"use client";

import { Download, MapPin } from "lucide-react";
import {
  ChevronLeftIcon,
  InfoIcon,
  PackageIcon,
} from "@/components/icons/storeIcons";
import { useState, useEffect, use } from "react";
import { orderService } from "@/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { ADMIN_TIME_ZONE, parseAdminDate } from "@/utils/formatAdminDateTime";
import { orderMoneySummary } from "@/utils/orderMoneySummary";
import { formatOrderNumber } from "@/utils/formatOrderNumber";
import { buildInvoicePrintHtml } from "@/utils/buildInvoicePrintHtml";
import { printHtml } from "@/utils/printHtml";
import { userErrorMessage } from "@/lib/userMessage";
import ReturnRequestPanel from "@/components/account/ReturnRequestPanel";

const SHIPPED_STATUSES = new Set([
  "shipped",
  "out for delivery",
  "delivered",
]);

function firstTimestamp(...values) {
  for (const value of values) {
    const parsed = parseAdminDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function formatTrackingDateTime(value) {
  const parsed = value instanceof Date ? value : parseAdminDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  })
    .format(parsed)
    .replace(/\u202f/g, " ");
}

function buildTrackingSteps(order) {
  const status = String(order.orderStatus || order.status || "order placed").toLowerCase();
  const shipping = String(order.shippingStatus || "").trim().toLowerCase();
  const details = order.transactionDetails || {};
  // Resolved server-side from whichever carrier booked the order, so this no
  // longer depends on the shipment living under a DTDC-shaped key.
  const stamps = order.shipmentTimestamps || {};

  const createdAt = firstTimestamp(order.createdAt);
  const paidAt = firstTimestamp(details.paidAt, order.paidAt, createdAt);
  const processingAt = firstTimestamp(
    details.processingAt,
    stamps.readyToShipAt,
    paidAt,
    createdAt
  );
  const shippedAt = firstTimestamp(
    stamps.shippedAt,
    order.shippedAt,
    stamps.createdAt,
    stamps.fulfilledAt,
    order.shipmentCreatedAt,
    order.shippingCreatedAt
  );
  const outForDeliveryAt = firstTimestamp(
    stamps.outForDeliveryAt,
    stamps.ofdAt
  );
  const deliveredAt = firstTimestamp(
    order.deliveredAt,
    order.deliveryDate,
    stamps.deliveredAt
  );

  const processingDone =
    ["processing", "shipped", "out for delivery", "delivered"].includes(status) ||
    ["ready to ship", "awaiting shipment", "in transit", "shipped", "out for delivery", "delivered"].includes(
      shipping
    );
  const shippedDone =
    ["shipped", "out for delivery", "delivered"].includes(status) ||
    ["in transit", "shipped", "out for delivery", "delivered"].includes(shipping);
  const outForDeliveryDone =
    ["out for delivery", "delivered"].includes(status) ||
    shipping.includes("out for delivery") ||
    shipping === "delivered";
  const deliveredDone =
    status === "delivered" || shipping === "delivered" || Boolean(order.isDelivered);

  const processingDate = processingDone ? processingAt || createdAt : processingAt;
  const shippedDate = shippedDone
    ? shippedAt || processingDate || createdAt
    : shippedAt;
  const outForDeliveryDate = outForDeliveryDone
    ? outForDeliveryAt || deliveredAt || shippedDate || createdAt
    : outForDeliveryAt;
  const deliveredDate = deliveredDone
    ? deliveredAt || outForDeliveryDate || shippedDate || createdAt
    : deliveredAt;

  return [
    {
      date: deliveredDate,
      label: "Delivered",
      desc: "Package delivered to your address.",
      done: deliveredDone,
    },
    {
      date: outForDeliveryDate,
      label: "Out for Delivery",
      desc: "Your package is with the delivery agent.",
      done: outForDeliveryDone,
    },
    {
      date: shippedDate,
      label: "Shipped",
      desc: "Order has been handed over to the courier.",
      done: shippedDone,
    },
    {
      date: processingDate,
      label: "Processing",
      desc: "We are preparing your items for shipment.",
      done: processingDone,
    },
    {
      date: createdAt,
      label: "Order Placed",
      desc: "Your order has been received and is being processed.",
      done: true,
    },
  ];
}

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
  const [printingInvoice, setPrintingInvoice] = useState(false);

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

  const handleDownloadInvoice = async () => {
    if (!canDownloadInvoice(order) || printingInvoice) return;
    setPrintingInvoice(true);
    try {
      const data = await orderService.getInvoice(orderId);
      const html = buildInvoicePrintHtml({
        order: data?.order || order,
        invoice: data?.invoice,
        company: data?.company || {},
      });
      await printHtml(html, {
        title:
          data?.invoice?.number ||
          order?.invoiceNumber ||
          order?.orderNumber ||
          "invoice",
      });
    } catch (err) {
      window.alert(
        userErrorMessage(err, "Couldn’t download invoice. Please try again.")
      );
    } finally {
      setPrintingInvoice(false);
    }
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
  const showInvoiceDownload = canDownloadInvoice(order);
  const money = orderMoneySummary(order);

  return (
    <DashboardLayout
      title={`Order ${formatOrderNumber(order, 8) || ""}`.trim()}
      eyebrow={`Placed ${new Date(order.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`}
    >
      <div className="mb-5">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back to orders
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="space-y-4 lg:col-span-2">
          <ReturnRequestPanel orderRef={orderId} />
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
              {buildTrackingSteps(order).map((step, idx, arr) => (
                <div key={step.label} className="relative flex gap-4">
                  {idx !== arr.length - 1 ? (
                    <div
                      className={`absolute top-5 left-[7px] h-[calc(100%+8px)] w-[2px] ${
                        step.done && arr[idx + 1].done ? "bg-[#DF1721]" : "bg-gray-200"
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
                        {formatTrackingDateTime(step.date)}
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
                <span>{formatPrice(money.subtotal)}</span>
              </div>
              {money.discount > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span>−{formatPrice(money.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>
                  {money.shipping === 0 ? "FREE" : formatPrice(money.shipping)}
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax (GST)</span>
                <span>{formatPrice(money.tax)}</span>
              </div>
              {order.isGift ? (
                <div className="flex justify-between text-gray-600">
                  <span>Gift wrap</span>
                  <span>+{formatPrice(money.gift)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-gray-200 pt-3 text-[16px] font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatPrice(money.total)}</span>
              </div>
            </div>
          </aside>

          {showInvoiceDownload ? (
            <button
              type="button"
              onClick={handleDownloadInvoice}
              disabled={printingInvoice}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-900 transition-colors hover:border-gray-900 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {printingInvoice ? "Preparing invoice…" : "Download invoice"}
            </button>
          ) : null}

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
        </div>
      </div>
    </DashboardLayout>
  );
}
