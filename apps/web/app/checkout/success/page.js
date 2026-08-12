"use client";

import {
  ArrowIcon,
  BagIcon,
} from "@/components/icons/storeIcons";
import BrandLogo from "@/components/BrandLogo";
import { useRouter, useSearchParams } from "next/navigation";

import { motion } from "framer-motion";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { flushStashedPurchase, trackPurchaseOnce } from "@/lib/tracking";
import { orderService } from "@/api";

const REDIRECT_SECONDS = 6;

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("orderId");
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (!orderId) return;
    const fromStash = flushStashedPurchase();
    if (fromStash) return;
    (async () => {
      try {
        const order = await orderService.getById(orderId);
        if (!order) return;
        const items = (order.orderItems || order.items || []).map((i) => ({
          _id: i.product || i.productId || i._id,
          productName: i.name || i.productName,
          price: i.price,
          qty: i.qty || i.quantity || 1,
          category: i.category,
          brand: i.brand || "Urban Aana",
        }));
        trackPurchaseOnce({
          transactionId: order._id || orderId,
          value: order.finalPrice ?? order.totalPrice ?? order.total,
          items,
        });
      } catch {
        /* ignore */
      }
    })();
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    if (!orderId || secondsLeft > 0) return;
    router.replace("/");
  }, [orderId, secondsLeft, router]);

  if (!orderId) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
        <div className="mb-6 flex justify-center">
          <BrandLogo href="/" height={32} priority />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-gray-900 sm:text-2xl">
          No order found
        </h1>
        <p className="mt-3 text-sm text-gray-500">
          We couldn&apos;t find an order to show.
        </p>
        <Link
          href="/all-products"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-[#222222] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-black"
        >
          Back to all products
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-xl border border-gray-200 bg-white p-6 text-center sm:p-10"
    >
      <div className="mb-6 flex justify-center">
        <BrandLogo href="/" height={32} priority />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
        Order successful
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-gray-500">
        Thank you for your purchase. Your order{" "}
        <span className="font-semibold text-gray-900">#{orderId.slice(-8)}</span>{" "}
        has been placed successfully.
      </p>

      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/order/${orderId}`}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#222222] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-black"
        >
          <span>View order details</span>
          <ArrowIcon className="h-4 w-4" />
        </Link>
        <Link
          href="/all-products"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-6 py-3.5 text-[15px] font-semibold text-gray-900 transition-colors hover:border-gray-900"
        >
          <BagIcon className="h-4 w-4" />
          <span>Continue shopping</span>
        </Link>
      </div>

      <p className="mt-8 text-sm text-gray-500">
        Redirecting to home in{" "}
        <span className="font-semibold text-gray-900">{secondsLeft}s</span>
      </p>
    </motion.div>
  );
}

export default function OrderSuccessPage() {
  return (
    <main className="min-h-screen bg-[#F9F9F5]">
      <section className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-lg">
          <Suspense
            fallback={
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center text-sm text-gray-500">
                Loading…
              </div>
            }
          >
            <SuccessContent />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
