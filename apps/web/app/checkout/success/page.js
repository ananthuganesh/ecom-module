"use client";

import {
  ArrowIcon,
  BagIcon,
  CheckBurstIcon,
  StoreIcon
} from "@/components/icons/storeIcons";
import { useSearchParams, useRouter } from "next/navigation";

import { motion } from "framer-motion";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { flushStashedPurchase, trackPurchaseOnce } from "@/lib/tracking";
import { orderService } from "@/api";

function SuccessContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderId = searchParams.get("orderId");

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

    if (!orderId) {
        return (
            <div className="text-center py-20">
                <h1 className="text-2xl font-bold uppercase tracking-widest mb-4">No Order Found</h1>
                <Link href="/all-products" className="btn-primary inline-block">Back to All Products</Link>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-6">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-12 shadow-sm border border-gray-50 text-center"
            >
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8">
                    <CheckBurstIcon className="w-10 h-10 text-emerald-500" />
                </div>

                <h1 className="text-3xl font-bold uppercase tracking-tight mb-4">Order Successful!</h1>
                <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                    Thank you for your purchase. Your order <span className="text-black font-bold">#{orderId.slice(-8)}</span> has been placed successfully.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <Link 
                        href={`/order/${orderId}`}
                        className="btn-primary w-full sm:w-auto flex items-center justify-center space-x-2 px-8"
                    >
                        <span>View Order Details</span>
                        <ArrowIcon className="w-4 h-4" />
                    </Link>
                    <Link 
                        href="/all-products"
                        className="btn-outline w-full sm:w-auto flex items-center justify-center space-x-2 px-8"
                    >
                        <BagIcon className="w-4 h-4" />
                        <span>Continue Shopping</span>
                    </Link>
                </div>

                <div className="mt-12 pt-12 border-t border-gray-100 flex items-center justify-center space-x-2 text-[10px] uppercase tracking-widest font-bold text-gray-400">
                    <StoreIcon className="w-3 h-3" />
                    <Link href="/" className="hover:text-primary transition-colors">Back to Home</Link>
                </div>
            </motion.div>
        </div>
    );
}

export default function OrderSuccessPage() {
    return (
        <main className="min-h-screen bg-[#fcfcfc]">
            <section className="pt-32 pb-20">
                <Suspense fallback={<div className="text-center py-20 uppercase tracking-widest text-[10px] font-bold">Loading...</div>}>
                    <SuccessContent />
                </Suspense>
            </section>
        </main>
    );
}
