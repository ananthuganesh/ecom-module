"use client";

import { Shield } from "lucide-react";
import {
  BagIcon,
  CardIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  MinusIcon,
  PlusIcon
} from "@/components/icons/storeIcons";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { useCartStore } from "@/store/useCartStore";
import SafeImage from "@/components/SafeImage";
import { resolveImageUrl } from "@/utils/imageResolver";
import { trackViewCart } from "@/lib/tracking";

const formatPrice = (price) => `₹${Number(price || 0).toLocaleString("en-IN")}`;

export default function CartDrawer() {
  const router = useRouter();
  const {
    cartItems,
    isDrawerOpen,
    setDrawerOpen,
    removeItem,
    updateQuantity,
  } = useCartStore();

  const cartCount = cartItems.reduce((n, i) => n + (i.qty || 0), 0);
  const cartTotal = cartItems.reduce(
    (acc, item) => acc + (Number(item.price) || 0) * (item.qty || 1),
    0
  );

  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
      if (cartItems.length > 0) trackViewCart(cartItems);
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isDrawerOpen]);

  const handleClose = () => setDrawerOpen(false);

  const handleCheckout = () => {
    handleClose();
    router.push("/checkout");
  };

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150]"
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-y-0 right-0 z-[160] flex h-dvh max-h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-6">
              <div className="flex flex-col">
                <h2 className="text-xl font-semibold text-gray-900">Shopping Cart</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  {cartCount} item{cartCount !== 1 ? "s" : ""} in your bag
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-full p-2 transition-colors hover:bg-gray-100"
                aria-label="Close cart"
              >
                <CloseIcon size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6">
              {cartItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center space-y-4 py-20 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                    <BagIcon size={40} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-gray-600">Your cart is empty</p>
                    <p className="text-sm text-gray-400">Add items to get started</p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="mt-4 rounded-lg bg-gray-900 px-6 py-2 text-sm text-white transition-colors hover:bg-gray-800"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                cartItems.map((item, index) => (
                  <motion.div
                    key={`${item._id}-${item.size}-${item.color}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group flex gap-4"
                  >
                    <Link
                      href={`/product/${item.slug || item._id}`}
                      onClick={handleClose}
                      className="flex-shrink-0"
                    >
                      <div className="relative h-32 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 transition-transform duration-300 group-hover:scale-105">
                        <SafeImage
                          src={resolveImageUrl(item.image || item.thumbnails?.[0] || item.variants?.[0]?.images?.[0])}
                          alt={item.name || item.productName || "Product"}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                    </Link>

                    <div className="flex flex-1 flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/product/${item.slug || item._id}`}
                            onClick={handleClose}
                            className="flex-1"
                          >
                            <h3 className="text-sm font-semibold leading-tight text-gray-900 transition-colors hover:text-gray-600">
                              {item.name || item.productName}
                            </h3>
                          </Link>
                          <button
                            onClick={() => removeItem(item._id, item.size, item.color)}
                            className="mt-0.5 text-gray-400 transition-colors hover:text-red-500"
                            aria-label="Remove item"
                          >
                            <DeleteIcon size={16} />
                          </button>
                        </div>

                        {item.size ? (
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                              {item.size}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex items-end justify-between">
                        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
                          <button
                            onClick={() => updateQuantity(item._id, item.size, item.color, (item.qty || 1) - 1)}
                            className="p-1.5 transition-colors hover:bg-gray-100 disabled:opacity-40"
                            disabled={(item.qty || 1) <= 1}
                            aria-label="Decrease quantity"
                          >
                            <MinusIcon size={12} className="text-gray-600" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium text-gray-900">
                            {item.qty || 1}
                          </span>
                          <button
                            onClick={() => updateQuantity(item._id, item.size, item.color, (item.qty || 1) + 1)}
                            className="p-1.5 transition-colors hover:bg-gray-100"
                            aria-label="Increase quantity"
                          >
                            <PlusIcon size={12} className="text-gray-600" />
                          </button>
                        </div>

                        <p className="text-lg font-semibold text-gray-900">
                          {formatPrice((Number(item.price) || 0) * (item.qty || 1))}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="shrink-0 border-t border-gray-200 bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <div className="space-y-4 px-6 pt-6">
                  <div className="flex items-baseline justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-2xl font-bold text-gray-900">
                      {formatPrice(cartTotal)}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500">
                    Shipping and taxes calculated at checkout
                  </p>

                  <Link
                    href="/cart"
                    onClick={handleClose}
                    className="block w-full rounded-lg border border-gray-900 py-3 text-center font-medium text-gray-900 transition-colors hover:bg-gray-50"
                  >
                    View Full Cart
                  </Link>

                  <button
                    onClick={handleCheckout}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-3.5 font-medium text-white transition-all duration-200 hover:bg-gray-800"
                  >
                    Proceed to Checkout
                    <ChevronRightIcon size={18} />
                  </button>

                  <div className="flex justify-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <Shield size={12} />
                      <span className="text-[12px]">Secure Checkout</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <CardIcon size={12} />
                      <span className="text-[12px]">Safe Payment</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
