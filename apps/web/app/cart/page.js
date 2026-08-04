"use client";

import { useEffect } from "react";
import { ShoppingBag } from "lucide-react";
import { DeleteIcon } from "@/components/icons/storeIcons";
import Link from "next/link";

import SafeImage from "@/components/SafeImage";
import WhyUrbanAana from "@/components/storefront/WhyUrbanAana";
import { useCartStore } from "@/store/useCartStore";
import { resolveImageUrl } from "@/utils/imageResolver";
import { isCartLineUnavailable } from "@/utils/cartStock";
import productService from "@/api/services/user/productService";

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

export default function CartPage() {
  const { cartItems, updateQuantity, removeItem, syncStock } = useCartStore();

  useEffect(() => {
    if (cartItems.length > 0) syncStock(productService);
    // Only sync on mount / when cart gains items — not on every qty change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStock, cartItems.length]);

  const availableItems = cartItems.filter((item) => !isCartLineUnavailable(item));
  const cartCount = availableItems.reduce((count, item) => count + (item.qty || 1), 0);
  const cartTotal = availableItems.reduce(
    (total, item) => total + (Number(item.price) || 0) * (item.qty || 1),
    0
  );

  if (!cartItems.length) {
    return (
      <main className="min-h-[60vh] bg-white">
        <div className="px-4 py-12 sm:px-8 md:py-16">
          <header className="mb-8">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#DF1721] uppercase">
              Cart
            </p>
            <h1 className="title-knewave mt-1 text-3xl leading-none tracking-tight normal-case md:text-4xl">
              Your <span className="title-knewave-accent">Bag</span>
            </h1>
          </header>

          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 py-20 text-center">
            <ShoppingBag className="mb-4 h-10 w-10 text-gray-300" strokeWidth={1.5} />
            <h2 className="text-lg font-semibold text-gray-900">Your cart is empty</h2>
            <p className="mt-2 max-w-sm text-sm text-gray-500">
              Add items from the shop to get started.
            </p>
            <Link
              href="/all-products"
              className="mt-6 inline-flex h-10 items-center justify-center bg-[#DF1721] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black"
            >
              Browse products
            </Link>
          </div>
        </div>
        <WhyUrbanAana />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="px-4 py-8 sm:px-8 md:py-12">
        <Link
          href="/all-products"
          className="inline-flex text-[13px] text-gray-600 transition-colors hover:text-gray-900 hover:underline"
        >
          ← Continue shopping
        </Link>

        <header className="mt-5 mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#DF1721] uppercase">
              Cart
            </p>
            <h1 className="title-knewave mt-1 text-3xl leading-none tracking-tight normal-case md:text-4xl">
              Your <span className="title-knewave-accent">Bag</span>
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {cartCount} item{cartCount !== 1 ? "s" : ""} ready for checkout
            </p>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <section className="divide-y divide-gray-100 border-t border-gray-100">
            {cartItems.map((item) => {
              const qty = item.qty || 1;
              const unitPrice = Number(item.price) || 0;
              const line = unitPrice * qty;
              const name = item.name || item.productName || "Product";
              const unavailable = isCartLineUnavailable(item);
              const meta = [item.size, item.color].filter(Boolean).join(" / ");

              return (
                <article
                  key={`${item._id}-${item.size}-${item.color}`}
                  className={`flex gap-4 py-5 first:pt-5 ${unavailable ? "opacity-60" : ""}`}
                >
                  <Link
                    href={`/product/${item.slug || item._id}`}
                    className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-28 sm:w-24"
                  >
                    <SafeImage
                      src={resolveImageUrl(
                        item.image ||
                          item.thumbnails?.[0] ||
                          item.variants?.[0]?.images?.[0]
                      )}
                      alt={name}
                      fill
                      sizes="96px"
                      className={`object-cover ${unavailable ? "grayscale" : ""}`}
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/product/${item.slug || item._id}`}
                          className="block truncate text-sm font-semibold text-gray-900 hover:underline"
                        >
                          {name}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {meta}
                          {meta ? " • " : ""}
                          Qty {qty}
                        </p>
                        {unavailable ? (
                          <p className="mt-1 text-xs font-medium text-red-600">
                            Out of stock
                          </p>
                        ) : (
                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {formatPrice(line)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item._id, item.size, item.color)}
                        className="shrink-0 text-gray-400 transition-colors hover:text-red-500"
                        aria-label={`Remove ${name}`}
                      >
                        <DeleteIcon size={16} />
                      </button>
                    </div>

                    {!unavailable ? (
                      <CartQtyControl
                        qty={qty}
                        onChange={(next) =>
                          updateQuantity(item._id, item.size, item.color, next)
                        }
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="h-fit rounded-xl border border-gray-200 bg-[#F8F8F8] p-5 lg:sticky lg:top-24">
            <h2 className="text-[16px] font-semibold text-gray-900">
              Order Summary ({cartCount} {cartCount === 1 ? "Item" : "Items"})
            </h2>

            <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-[13px]">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="text-[16px] font-semibold text-gray-900">Total</span>
                <span className="text-[16px] font-semibold text-gray-900">
                  {formatPrice(cartTotal)}
                </span>
              </div>
            </div>

            <Link
              href="/checkout"
              className={`mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#222222] text-[15px] font-semibold text-white transition-colors hover:bg-black ${
                availableItems.length === 0 ? "pointer-events-none opacity-50" : ""
              }`}
            >
              Checkout
            </Link>
            <p className="mt-3 text-center text-[12px] text-gray-500">
              Taxes and shipping confirmed at checkout.
            </p>
          </aside>
        </div>
      </div>
      <WhyUrbanAana />
    </main>
  );
}
