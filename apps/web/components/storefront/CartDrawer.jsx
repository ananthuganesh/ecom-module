"use client";

import {
  BagIcon,
  CloseIcon,
} from "@/components/icons/storeIcons";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { useCartStore } from "@/store/useCartStore";
import SafeImage from "@/components/SafeImage";
import { resolveImageUrl } from "@/utils/imageResolver";
import { trackViewCart } from "@/lib/tracking";
import productService from "@/api/services/user/productService";
import { isCartLineUnavailable, sortCartByAvailability } from "@/utils/cartStock";

const formatPrice = (price) => `₹${Number(price || 0).toLocaleString("en-IN")}`;

function CartQtyControl({ qty, onChange, disabled = false }) {
  return (
    <div className="mt-3 flex items-center gap-3 text-sm text-gray-900">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, qty - 1))}
        className="leading-none text-gray-600 transition-colors hover:text-black disabled:opacity-30"
        disabled={disabled || qty <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="min-w-[1.25rem] text-center font-medium tabular-nums">{qty}</span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        className="leading-none text-gray-600 transition-colors hover:text-black disabled:opacity-30"
        disabled={disabled}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

export default function CartDrawer() {
  const router = useRouter();
  const {
    cartItems,
    isDrawerOpen,
    setDrawerOpen,
    removeItem,
    updateQuantity,
    syncStock,
  } = useCartStore();

  const availableItems = cartItems.filter((item) => !isCartLineUnavailable(item));
  const displayItems = sortCartByAvailability(cartItems);
  const cartCount = availableItems.reduce((n, i) => n + (i.qty || 0), 0);
  const cartTotal = availableItems.reduce(
    (acc, item) => acc + (Number(item.price) || 0) * (item.qty || 1),
    0
  );
  const totalSavings = availableItems.reduce((acc, item) => {
    const price = Number(item.price) || 0;
    const mrp = Number(item.mrp ?? item.pricing?.mrp ?? 0);
    const qty = item.qty || 1;
    if (mrp > price) return acc + (mrp - price) * qty;
    return acc;
  }, 0);

  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
      if (cartItems.length > 0) {
        trackViewCart(cartItems);
        syncStock(productService);
      }
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isDrawerOpen, syncStock]);

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
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-y-0 right-0 z-[160] flex h-dvh max-h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Shopping Cart{" "}
                <span className="text-gray-500">({cartCount})</span>
              </h2>
              <button
                onClick={handleClose}
                className="rounded-full p-2 transition-colors hover:bg-gray-100"
                aria-label="Close cart"
              >
                <CloseIcon size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
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
                <ul className="divide-y divide-gray-100">
                    {displayItems.map((item, index) => {
                      const qty = item.qty || 1;
                      const unitPrice = Number(item.price) || 0;
                      const name = item.name || item.productName || "Product";
                      const unavailable = isCartLineUnavailable(item);

                      return (
                        <motion.li
                          key={`${item._id}-${item.size}-${item.color}`}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04 }}
                          className={`flex gap-3 py-4 first:pt-0 last:pb-0 ${
                            unavailable ? "opacity-60" : ""
                          }`}
                        >
                          <Link
                            href={`/product/${item.slug || item._id}`}
                            onClick={handleClose}
                            className="shrink-0"
                          >
                            <div className="relative h-24 w-20 overflow-hidden rounded-lg bg-gray-100">
                              <SafeImage
                                src={resolveImageUrl(
                                  item.image ||
                                    item.thumbnails?.[0] ||
                                    item.variants?.[0]?.images?.[0]
                                )}
                                alt={name}
                                fill
                                sizes="80px"
                                className={`object-cover ${unavailable ? "grayscale" : ""}`}
                              />
                            </div>
                          </Link>

                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex items-start justify-between gap-2">
                              <Link
                                href={`/product/${item.slug || item._id}`}
                                onClick={handleClose}
                                className="min-w-0"
                              >
                                <h3 className="truncate text-sm font-semibold text-gray-900">
                                  {name}
                                </h3>
                              </Link>
                              <button
                                onClick={() =>
                                  removeItem(item._id, item.size, item.color)
                                }
                                className="shrink-0 text-[12px] font-medium text-gray-400 transition-colors hover:text-red-500"
                                aria-label="Remove item"
                              >
                                Remove
                              </button>
                            </div>

                            {item.size ? (
                              <p className="mt-0.5 text-xs text-gray-500">
                                Size: {item.size}
                              </p>
                            ) : null}

                            {unavailable ? (
                              <p className="mt-1 text-xs font-medium text-red-600">
                                Out of stock
                              </p>
                            ) : (
                              <p className="mt-1 text-sm font-medium text-gray-900">
                                {formatPrice(unitPrice)}
                                <span className="text-gray-500"> × {qty}</span>
                              </p>
                            )}

                            {!unavailable ? (
                              <CartQtyControl
                                qty={qty}
                                onChange={(next) =>
                                  updateQuantity(
                                    item._id,
                                    item.size,
                                    item.color,
                                    next
                                  )
                                }
                              />
                            ) : null}
                          </div>
                        </motion.li>
                      );
                    })}
                  </ul>
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="shrink-0 border-t border-gray-200 bg-white pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="space-y-4 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium text-gray-900">Total</span>
                    <span className="text-xl font-bold text-gray-900">
                      {formatPrice(cartTotal)}
                    </span>
                  </div>
                  {totalSavings > 0 ? (
                    <p className="-mt-2 text-[13px] font-medium text-emerald-700">
                      You save {formatPrice(totalSavings)}
                    </p>
                  ) : null}

                  <button
                    onClick={handleCheckout}
                    disabled={availableItems.length === 0}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-3.5 text-sm font-medium text-white transition-all duration-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
