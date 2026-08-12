"use client";

import { CalendarDays, Clock, MapPin, Smartphone } from "lucide-react";
import {
  CheckBurstIcon,
  ChevronLeftIcon,
  InfoIcon,
  PackageIcon,
  SearchIcon,
  TruckIcon,
} from "@/components/icons/storeIcons";
import { useState, useEffect, use, Suspense } from "react";
import { orderService, shippingService } from "@/api";

import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const SECTION = "text-[18px] font-semibold text-gray-900 tracking-tight";

function formatPrice(price) {
  return `₹${Number(price || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function resolveItemImage(item) {
  if (!item || typeof item !== "object") return null;
  const product = item.productId && typeof item.productId === "object" ? item.productId : null;
  return (
    item.image ||
    item.thumbnail ||
    product?.thumbnails?.[0] ||
    product?.variants?.[0]?.images?.[0] ||
    item.thumbnails?.[0] ||
    item.variants?.[0]?.images?.[0] ||
    null
  );
}

function resolveItemName(item) {
  if (!item || typeof item !== "object") return "Product";
  const product = item.productId && typeof item.productId === "object" ? item.productId : null;
  return (
    item.name ||
    item.productName ||
    product?.productName ||
    product?.name ||
    product?.product ||
    "Product"
  );
}

function resolveItemQty(item) {
  return Number(item?.qty ?? item?.quantity ?? 1) || 1;
}

function shippingName(order) {
  const ship = order?.shippingAddress || {};
  const customer = order?.customerId && typeof order.customerId === "object" ? order.customerId : null;
  return (
    ship.name ||
    ship.fullName ||
    [ship.firstName, ship.lastName].filter(Boolean).join(" ") ||
    customer?.name ||
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
    ""
  );
}

function estimatedDeliveryLabel(order) {
  if (!order) return null;
  if (order.isDelivered) {
    const delivered = formatDate(order.deliveredAt || order.deliveryDate);
    return delivered ? `Delivered ${delivered}` : "Delivered";
  }
  if (order.deliveryDate) {
    const date = formatDate(order.deliveryDate);
    return date ? `Estimated delivery by ${date}` : null;
  }
  const base = order.awbCode
    ? order.updatedAt || order.createdAt
    : order.createdAt;
  if (!base) return "Estimated delivery in 3–5 business days";
  const eta = addDays(base, order.awbCode ? 5 : 7);
  const date = formatDate(eta);
  return date
    ? `Estimated delivery by ${date}`
    : "Estimated delivery in 3–5 business days";
}

function OrderContent({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment_success") === "true";

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);

  const fetchOrder = async () => {
    try {
      const data = await orderService.getById(params.id);
      setOrder(data);
    } catch (error) {
      console.error("Error fetching order:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTracking = async () => {
    if (!order?._id) return;
    setTrackingLoading(true);
    try {
      const data = await shippingService.getTrackingDetails(order._id);
      setTracking(data);
    } catch (error) {
      console.error("Error fetching tracking:", error);
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [params.id]);

  useEffect(() => {
    if (order?.awbCode && !tracking) {
      fetchTracking();
    }
  }, [order?.awbCode]);

  const paymentMethod =
    order?.transactionDetails?.paymentMethod || order?.paymentMethod || "razorpay";
  const isRazorpay =
    String(paymentMethod).toLowerCase().includes("razorpay") ||
    paymentMethod === "prepaid";

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className={`${SECTION} text-2xl`}>Order not found</h1>
        <p className="mt-3 text-sm text-gray-500">We couldn&apos;t find this order.</p>
        <Link
          href="/all-products"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-[#222222] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-black"
        >
          Back to all products
        </Link>
      </div>
    );
  }

  const items = order.orderItems || order.items || [];
  const title = order.isDelivered
    ? "Order delivered"
    : order.awbCode
      ? "Order shipped"
      : "Order placed";
  const etaLabel = estimatedDeliveryLabel(order);
  const customerName = shippingName(order);

  return (
    <section className="pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <Link
          href="/all-products"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Continue shopping
        </Link>

        {paymentSuccess ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 border border-emerald-200 bg-emerald-50 px-5 py-4 sm:px-6"
          >
            <h2 className="text-[16px] font-semibold text-emerald-900">
              Payment successful
            </h2>
            <p className="mt-1 text-sm text-emerald-700">
              Thank you for your purchase. Your order is now being processed.
            </p>
          </motion.div>
        ) : null}

        <div className="mb-8 flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={`${SECTION} text-2xl sm:text-[28px]`}>{title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Order #{order._id?.slice(-8)}
              {order.createdAt ? (
                <>
                  {" · "}
                  Placed {formatDate(order.createdAt)}
                </>
              ) : null}
            </p>
            {etaLabel ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                <CalendarDays className="h-4 w-4 text-[#DF1721]" />
                {etaLabel}
              </p>
            ) : null}
          </div>
          <div
            className={`inline-flex w-fit items-center gap-2 border px-3 py-1.5 text-[13px] font-medium ${
              order.isPaid
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {order.isPaid ? (
              <CheckBurstIcon className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            {order.isPaid ? "Payment received" : "Payment pending"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="space-y-10">
            <div>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className={`${SECTION} flex items-center gap-2`}>
                  <TruckIcon className="h-5 w-5" />
                  Delivery status
                </h2>
                {order.shippingStatus ? (
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium text-gray-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#DF1721]" />
                    {order.shippingStatus}
                  </span>
                ) : null}
              </div>

              <div className="relative flex items-center justify-between px-1 sm:px-4">
                <div className="absolute left-4 right-4 top-4 z-0 h-px bg-gray-200 sm:left-6 sm:right-6" />
                <div
                  className={`absolute left-4 top-4 z-0 h-px bg-[#222222] transition-all duration-700 sm:left-6 ${
                    order.isDelivered
                      ? "w-[calc(100%-2rem)] sm:w-[calc(100%-3rem)]"
                      : order.awbCode
                        ? "w-1/2"
                        : "w-0"
                  }`}
                />

                {[
                  { label: "Placed", done: true, icon: CheckBurstIcon },
                  { label: "Shipped", done: Boolean(order.awbCode), icon: PackageIcon },
                  { label: "Delivered", done: Boolean(order.isDelivered), icon: TruckIcon },
                ].map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="relative z-10 flex flex-col items-center">
                      <div
                        className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full ${
                          step.done
                            ? "bg-[#222222] text-white"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span
                        className={`text-[13px] font-medium ${
                          step.done ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {order.awbCode ? (
                <div className="mt-6 flex flex-col items-stretch justify-between gap-4 border border-gray-200 bg-[#F8F8F8] p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center border border-gray-200 bg-white">
                      <PackageIcon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-[13px] text-gray-500">
                        Courier: {order.courierName || "DTDC"}
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        AWB: {order.awbCode}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTrackingModal(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#222222] px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-black"
                  >
                    <SearchIcon className="h-3.5 w-3.5" />
                    Track live status
                  </button>
                </div>
              ) : null}
            </div>

            <div>
              <h2 className={`${SECTION} mb-5`}>Ordered items</h2>
              <div className="divide-y divide-gray-100 border-t border-gray-200">
                {items.map((item, i) => {
                  const name = resolveItemName(item);
                  const image = resolveItemImage(item);
                  const qty = resolveItemQty(item);
                  const price = Number(item.price) || 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50 sm:h-24 sm:w-[4.5rem]">
                          <SafeImage
                            src={image}
                            alt={name}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-gray-900">
                            {name}
                          </p>
                          <p className="mt-1 text-[13px] text-gray-500">
                            Qty: {qty} · {formatPrice(price)}
                          </p>
                          {item.color || item.size ? (
                            <p className="mt-1 text-[13px] text-gray-400">
                              {[item.size, item.color].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <p className="shrink-0 text-[14px] font-semibold text-gray-900">
                        {formatPrice(qty * price)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-8 lg:border-l lg:border-gray-200 lg:pl-10">
            <div>
              <h2 className={`${SECTION} mb-4 flex items-center gap-2`}>
                <MapPin className="h-5 w-5 text-[#DF1721]" />
                Shipping address
              </h2>
              {customerName ? (
                <p className="mb-1 text-sm font-semibold text-gray-900">{customerName}</p>
              ) : null}
              <div className="text-sm leading-relaxed text-gray-600">
                <p>{order.shippingAddress?.address}</p>
                <p>
                  {[
                    order.shippingAddress?.city,
                    order.shippingAddress?.state,
                    order.shippingAddress?.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p>{order.shippingAddress?.country}</p>
              </div>
            </div>

            {order.isGift ? (
              <div>
                <h2 className={`${SECTION} mb-3 flex items-center gap-2`}>
                  <PackageIcon className="h-5 w-5 text-[#DF1721]" />
                  Gift order
                </h2>
                {order.giftMessage ? (
                  <p className="text-sm italic text-gray-600">
                    &ldquo;{order.giftMessage}&rdquo;
                  </p>
                ) : (
                  <p className="text-[13px] text-gray-400">No message provided</p>
                )}
              </div>
            ) : null}

            <div className="border-t border-gray-200 pt-8">
              <div className="mb-4 flex items-center gap-2">
                {isRazorpay ? <Smartphone className="h-4 w-4 text-gray-600" /> : null}
                <h2 className={SECTION}>
                  {isRazorpay ? "Payment" : paymentMethod}
                </h2>
              </div>
              {isRazorpay ? (
                <p className="mb-4 text-sm text-gray-500">
                  {order.isPaid
                    ? "Paid securely with Razorpay"
                    : "Complete payment online to confirm your order."}
                </p>
              ) : null}
              <div className="space-y-2 text-[14px]">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(order.itemsPrice ?? order.total)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>
                    {(order.shippingPrice ?? order.deliveryAmount ?? 0) === 0
                      ? "Free"
                      : formatPrice(order.shippingPrice ?? order.deliveryAmount)}
                  </span>
                </div>
                {order.isGift ? (
                  <div className="flex justify-between text-gray-600">
                    <span>Gift wrap</span>
                    <span>+{formatPrice(order.giftFee || 39)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-gray-200 pt-3 text-[16px] font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{formatPrice(order.totalPrice ?? order.finalPrice)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showTrackingModal ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrackingModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h3 className="text-[16px] font-semibold text-gray-900">
                    Live tracking
                  </h3>
                  {order.awbCode ? (
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      AWB: {order.awbCode}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowTrackingModal(false)}
                  className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <ChevronLeftIcon className="h-4 w-4 rotate-180" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-5">
                {trackingLoading ? (
                  <div className="flex flex-col items-center justify-center space-y-3 py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                    <p className="text-sm text-gray-500">Fetching live status…</p>
                  </div>
                ) : tracking?.tracking_data?.shipment_track?.[0] ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border border-gray-200 bg-[#F8F8F8] p-4">
                      <div className="flex items-center gap-3">
                        <PackageIcon className="h-5 w-5 text-gray-700" />
                        <div>
                          <p className="text-[13px] text-gray-500">Current status</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {tracking.tracking_data.shipment_track[0].current_status}
                          </p>
                        </div>
                      </div>
                      <MapPin className="h-4 w-4 text-gray-300" />
                    </div>

                    <div className="space-y-5">
                      {tracking.tracking_data.shipment_track_activities.map(
                        (activity, idx) => (
                          <div key={idx} className="relative flex gap-4">
                            {idx !==
                            tracking.tracking_data.shipment_track_activities.length -
                              1 ? (
                              <div className="absolute left-2 top-5 bottom-[-20px] w-px bg-gray-200" />
                            ) : null}
                            <div
                              className={`relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-2 bg-white ${
                                idx === 0 ? "border-[#DF1721]" : "border-gray-300"
                              }`}
                            >
                              {idx === 0 ? (
                                <div className="mx-auto mt-[3px] h-1.5 w-1.5 rounded-full bg-[#DF1721]" />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1 pb-1">
                              <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <p
                                  className={`text-[13px] font-semibold ${
                                    idx === 0 ? "text-gray-900" : "text-gray-700"
                                  }`}
                                >
                                  {activity.activity}
                                </p>
                                <p className="text-[12px] text-gray-400">
                                  {activity.date}
                                </p>
                              </div>
                              <p className="text-[13px] text-gray-500">
                                {activity.location}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <InfoIcon className="mx-auto mb-4 h-10 w-10 text-gray-300" />
                    <p className="text-sm text-gray-500">
                      Tracking information not yet available from the carrier.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-gray-200 bg-[#F8F8F8] px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowTrackingModal(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-900 transition-colors hover:border-gray-900"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export default function OrderPage({ params: paramsPromise }) {
  return (
    <main className="min-h-screen bg-white">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          </div>
        }
      >
        <OrderContent params={paramsPromise} />
      </Suspense>
    </main>
  );
}
