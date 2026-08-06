"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { DeleteIcon } from "@/components/icons/storeIcons";
import SafeImage from "@/components/SafeImage";
import { useCartStore } from "@/store/useCartStore";
import { resolveImageUrl } from "@/utils/imageResolver";
import { isCartLineUnavailable, sortCartByAvailability } from "@/utils/cartStock";
import productService from "@/api/services/user/productService";

const formatPrice = (price) => `₹${Number(price || 0).toLocaleString("en-IN")}`;

function CartQtyControl({ qty, onChange, disabled = false }) {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-900">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, qty - 1))}
        className="leading-none text-gray-600 transition-colors hover:text-black disabled:opacity-30"
        disabled={disabled || qty <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="min-w-[1.25rem] text-center font-medium tabular-nums">
        {qty}
      </span>
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

export default function CartPage() {
  const { cartItems, updateQuantity, removeItem, syncStock } = useCartStore();

  useEffect(() => {
    if (cartItems.length > 0) syncStock(productService);
  }, [syncStock, cartItems.length]);

  const availableItems = cartItems.filter(
    (item) => !isCartLineUnavailable(item)
  );
  const displayItems = sortCartByAvailability(cartItems);
  const cartCount = availableItems.reduce(
    (count, item) => count + (item.qty || 1),
    0
  );
  const cartTotal = availableItems.reduce(
    (total, item) => total + (Number(item.price) || 0) * (item.qty || 1),
    0
  );
  const totalSavings = availableItems.reduce((acc, item) => {
    const price = Number(item.price) || 0;
    const mrp = Number(item.mrp ?? item.pricing?.mrp ?? 0);
    const qty = item.qty || 1;
    if (mrp > price) return acc + (mrp - price) * qty;
    return acc;
  }, 0);

  return (
    <div className="mx-auto min-h-[60vh] w-full max-w-6xl bg-white px-4 py-8 md:px-4 md:py-12 lg:px-8">
      <header className="mb-6 md:mb-8">
        <h1 className="title-knewave text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Your <span className="title-knewave-accent">Cart</span>
        </h1>
      </header>

      {!cartItems.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 py-20 text-center">
          <ShoppingBag
            className="mb-4 h-10 w-10 text-gray-300"
            strokeWidth={1.5}
          />
          <h2 className="text-lg font-semibold text-gray-900">
            Your cart is empty
          </h2>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Browse the shop and add pieces you love.
          </p>
          <Link
            href="/all-products"
            className="mt-6 inline-flex h-10 items-center justify-center bg-[#DF1721] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] lg:gap-5 lg:items-start">
          {/* Left — products (~80%) */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <ul className="divide-y divide-gray-100">
              {displayItems.map((item) => {
                const qty = item.qty || 1;
                const unitPrice = Number(item.price) || 0;
                const line = unitPrice * qty;
                const name = item.name || item.productName || "Product";
                const unavailable = isCartLineUnavailable(item);
                const href = `/product/${item.slug || item._id}`;
                const meta = [item.size, item.color].filter(Boolean).join(" / ");

                return (
                  <li
                    key={`${item._id}-${item.size}-${item.color}`}
                    className={`flex gap-4 p-4 sm:gap-5 sm:p-5 ${
                      unavailable ? "opacity-60" : ""
                    }`}
                  >
                    <Link
                      href={href}
                      className="relative h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-32 sm:w-28"
                    >
                      <SafeImage
                        src={resolveImageUrl(
                          item.image ||
                            item.thumbnails?.[0] ||
                            item.variants?.[0]?.images?.[0]
                        )}
                        alt={name}
                        fill
                        sizes="112px"
                        className={`object-cover ${
                          unavailable ? "grayscale" : ""
                        }`}
                      />
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={href}
                          className="text-[15px] font-semibold text-gray-900 hover:underline sm:text-base"
                        >
                          {name}
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            removeItem(item._id, item.size, item.color)
                          }
                          className="shrink-0 text-gray-400 transition-colors hover:text-red-500"
                          aria-label={`Remove ${name}`}
                        >
                          <DeleteIcon size={16} />
                        </button>
                      </div>

                      {meta ? (
                        <p className="text-[13px] text-gray-500">{meta}</p>
                      ) : null}

                      {unavailable ? (
                        <p className="text-[13px] font-medium text-red-600">
                          Out of stock
                        </p>
                      ) : (
                        <p className="text-[15px] font-medium text-gray-900">
                          {formatPrice(line)}
                          {qty > 1 ? (
                            <span className="ml-1.5 text-[12px] font-normal text-gray-500">
                              ({formatPrice(unitPrice)} each)
                            </span>
                          ) : null}
                        </p>
                      )}

                      {!unavailable ? (
                        <div className="mt-1">
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
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Right — totals (~20%) */}
          <aside className="h-fit rounded-xl border border-gray-200 bg-[#F8F8F8] p-5 lg:sticky lg:top-24">
            <h2 className="text-[16px] font-semibold text-gray-900">
              Order Summary
            </h2>
            <p className="mt-1 text-[13px] text-gray-500">
              {cartCount} item{cartCount === 1 ? "" : "s"}
            </p>

            <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-[13px]">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>FREE</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="text-[16px] font-semibold text-gray-900">
                  Total
                </span>
                <span className="text-[16px] font-semibold text-gray-900">
                  {formatPrice(cartTotal)}
                </span>
              </div>
              {totalSavings > 0 ? (
                <p className="pt-1 text-[13px] font-medium text-emerald-700">
                  You save {formatPrice(totalSavings)}
                </p>
              ) : null}
            </div>

            <Link
              href="/checkout"
              className={`mt-5 flex h-11 w-full items-center justify-center rounded-md bg-[#222222] text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black ${
                availableItems.length === 0
                  ? "pointer-events-none opacity-50"
                  : ""
              }`}
            >
              Checkout
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
