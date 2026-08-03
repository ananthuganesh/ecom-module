"use client";

import { Shield } from "lucide-react";
import {
  BagIcon,
  CardIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteIcon,
  MinusIcon,
  PlusIcon
} from "@/components/icons/storeIcons";
import Link from "next/link";

import SafeImage from "@/components/SafeImage";
import WhyUrbanAana from "@/components/storefront/WhyUrbanAana";
import { useCartStore } from "@/store/useCartStore";
import { resolveImageUrl } from "@/utils/imageResolver";

export default function CartPage() {
  const { cartItems, updateQuantity, removeItem } = useCartStore();

  const cartCount = cartItems.reduce((count, item) => count + (item.qty || 1), 0);
  const cartTotal = cartItems.reduce(
    (total, item) => total + (Number(item.price) || 0) * (item.qty || 1),
    0
  );
  const formatPrice = (price) => `₹${Number(price || 0).toLocaleString("en-IN")}`;

  if (!cartItems.length) {
    return (
      <main className="min-h-screen bg-[#F9F9F5]">
        <div className="px-4 py-24 sm:px-8">
          <section className="mx-auto flex max-w-xl flex-col items-center border border-black bg-white px-6 py-16 text-center sm:px-12">
            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-black">
              <BagIcon size={32} strokeWidth={1.4} />
            </div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">Urban Aana</p>
            <h1 className="font-vina text-5xl uppercase leading-none sm:text-6xl">Your bag is empty</h1>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-gray-600">
              The next drop is waiting. Find a piece that feels like you.
            </p>
            <Link href="/all-products" className="mt-9 inline-flex items-center gap-2 bg-black px-7 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#DF1721]">
              Shop the collection <ChevronRightIcon size={16} />
            </Link>
          </section>
        </div>
        <WhyUrbanAana />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F9F9F5]">
      <div className="container-site py-10 pb-20 md:py-16">
        <Link href="/all-products" className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-gray-500 transition-colors hover:text-[#DF1721]">
          <ChevronLeftIcon size={15} /> Continue shopping
        </Link>
        <div className="mt-7 flex flex-col gap-3 border-b-2 border-black pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">Your selection</p>
            <h1 className="mt-2 font-vina text-5xl uppercase leading-none sm:text-7xl">Your bag</h1>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.16em]">{cartCount} item{cartCount !== 1 ? "s" : ""}</p>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section className="border border-black bg-white">
            {cartItems.map((item) => (
              <article key={`${item._id}-${item.size}-${item.color}`} className="flex gap-4 border-b border-gray-200 p-4 last:border-b-0 sm:gap-6 sm:p-6">
                <Link href={`/product/${item.slug || item._id}`} className="relative h-32 w-24 shrink-0 overflow-hidden bg-gray-100 sm:h-40 sm:w-28">
                  <SafeImage
                    src={resolveImageUrl(item.image || item.thumbnails?.[0] || item.variants?.[0]?.images?.[0])}
                    alt={item.name || item.productName || "Product"}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#DF1721]">{item.color || "Urban Aana"}</p>
                      <Link href={`/product/${item.slug || item._id}`} className="mt-1 block text-sm font-bold uppercase leading-snug hover:text-[#DF1721]">
                        {item.name || item.productName}
                      </Link>
                      {item.size && <p className="mt-2 text-xs text-gray-500">Size: {item.size}</p>}
                    </div>
                    <button onClick={() => removeItem(item._id, item.size, item.color)} className="text-gray-400 transition-colors hover:text-[#DF1721]" aria-label={`Remove ${item.name || item.productName}`}>
                      <DeleteIcon size={17} />
                    </button>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <div className="flex items-center border border-black">
                      <button onClick={() => updateQuantity(item._id, item.size, item.color, (item.qty || 1) - 1)} disabled={(item.qty || 1) <= 1} className="p-2 transition-colors hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-30" aria-label="Decrease quantity">
                        <MinusIcon size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{item.qty || 1}</span>
                      <button onClick={() => updateQuantity(item._id, item.size, item.color, (item.qty || 1) + 1)} className="p-2 transition-colors hover:bg-black hover:text-white" aria-label="Increase quantity">
                        <PlusIcon size={14} />
                      </button>
                    </div>
                    <p className="text-lg font-black">{formatPrice((Number(item.price) || 0) * (item.qty || 1))}</p>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit border border-black bg-black p-6 text-white lg:sticky lg:top-24">
            <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#f87171]">Order total</p>
            <div className="mt-6 flex justify-between border-b border-white/30 pb-5">
              <span className="text-sm">Subtotal</span>
              <span className="text-2xl font-black">{formatPrice(cartTotal)}</span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-gray-300">Shipping and taxes are calculated securely at checkout.</p>
            <Link href="/checkout" className="mt-7 flex w-full items-center justify-center gap-2 bg-[#DF1721] px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] transition-colors hover:bg-white hover:text-black">
              Checkout <ChevronRightIcon size={16} />
            </Link>
            <div className="mt-6 flex justify-center gap-4 text-[12px] uppercase tracking-wide text-gray-300">
              <span className="flex items-center gap-1"><Shield size={12} /> Secure</span>
              <span className="flex items-center gap-1"><CardIcon size={12} /> Payments</span>
            </div>
          </aside>
        </div>
      </div>
      <WhyUrbanAana />
    </main>
  );
}
