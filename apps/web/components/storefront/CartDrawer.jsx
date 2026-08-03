"use client";

import {
  BagIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  MinusIcon,
  PlusIcon,
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
            className="fixed inset-0 z-[150] bg-black/50"
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-y-0 right-0 z-[160] flex h-dvh max-h-dvh w-full max-w-[420px] flex-col overflow-hidden border-l border-black bg-white"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-black px-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
                  Urban Aana
                </p>
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-black">
                  Your bag ({cartCount})
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-black transition-colors hover:text-[#DF1721]"
                aria-label="Close cart"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F9F9F5] px-5 py-4">
              {cartItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center border border-black bg-white">
                    <BagIcon size={28} strokeWidth={1.4} />
                  </div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
                    Empty bag
                  </p>
                  <p className="mt-2 text-sm text-gray-600">Add pieces to get started.</p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="mt-6 inline-flex items-center gap-2 bg-black px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#DF1721]"
                  >
                    Continue shopping <ChevronRightIcon size={16} />
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 border border-black bg-white">
                  {cartItems.map((item, index) => {
                    const qty = item.qty || 1;
                    const unitPrice = Number(item.price) || 0;
                    const name = item.name || item.productName || "Product";

                    return (
                      <motion.li
                        key={`${item._id}-${item.size}-${item.color}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        className="flex gap-3 p-4"
                      >
                        <Link
                          href={`/product/${item.slug || item._id}`}
                          onClick={handleClose}
                          className="shrink-0"
                        >
                          <div className="relative h-24 w-20 overflow-hidden bg-gray-100">
                            <SafeImage
                              src={resolveImageUrl(
                                item.image ||
                                  item.thumbnails?.[0] ||
                                  item.variants?.[0]?.images?.[0]
                              )}
                              alt={name}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          </div>
                        </Link>

                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#DF1721]">
                                {item.color || "Urban Aana"}
                              </p>
                              <Link
                                href={`/product/${item.slug || item._id}`}
                                onClick={handleClose}
                                className="mt-0.5 block truncate text-sm font-bold uppercase text-black hover:text-[#DF1721]"
                              >
                                {name}
                              </Link>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(item._id, item.size, item.color)}
                              className="shrink-0 text-gray-400 transition-colors hover:text-[#DF1721]"
                              aria-label="Remove item"
                            >
                              <DeleteIcon size={16} />
                            </button>
                          </div>

                          {item.size ? (
                            <p className="mt-1 text-xs text-gray-500">Size: {item.size}</p>
                          ) : null}

                          <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                            <div className="inline-flex items-center border border-black">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item._id, item.size, item.color, qty - 1)
                                }
                                className="p-2 transition-colors hover:bg-black hover:text-white disabled:opacity-30"
                                disabled={qty <= 1}
                                aria-label="Decrease quantity"
                              >
                                <MinusIcon size={12} />
                              </button>
                              <span className="min-w-[1.75rem] text-center text-sm font-bold">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item._id, item.size, item.color, qty + 1)
                                }
                                className="p-2 transition-colors hover:bg-black hover:text-white"
                                aria-label="Increase quantity"
                              >
                                <PlusIcon size={12} />
                              </button>
                            </div>
                            <p className="text-sm font-black">
                              {formatPrice(unitPrice * qty)}
                            </p>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="shrink-0 border-t border-black bg-black pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white">
                <div className="space-y-4 px-5 pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-gray-300">
                      Subtotal
                    </span>
                    <span className="text-xl font-black">{formatPrice(cartTotal)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckout}
                    className="flex w-full items-center justify-center gap-2 bg-[#DF1721] py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-black"
                  >
                    Checkout
                    <ChevronRightIcon size={16} />
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
