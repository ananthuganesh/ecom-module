"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import ProductCard from "@/components/storefront/ProductCard";
import { useWishlistStore } from "@/store/useWishlistStore";

export default function WishlistPage() {
  const items = useWishlistStore((s) => s.items);
  const clear = useWishlistStore((s) => s.clear);

  return (
    <div className="min-h-[60vh] bg-white px-2 py-8 md:px-4 md:py-12 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 md:mb-8">
        <div>
          <h1 className="title-knewave text-3xl leading-none tracking-tight normal-case md:text-4xl">
            My <span className="title-knewave-accent">Wishlist</span>
          </h1>
        </div>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Clear your entire wishlist?")) clear();
            }}
            className="text-xs font-semibold tracking-wide text-gray-500 underline-offset-2 hover:text-[#DF1721] hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </header>

      {!items.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 py-20 text-center">
          <Heart className="mb-4 h-10 w-10 text-gray-300" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold text-gray-900">No saved items yet</h2>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Tap the heart on a product to save it here for later.
          </p>
          <Link
            href="/all-products"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-black px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-gray-800"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6 lg:gap-4">
          {items.map((product) => (
            <ProductCard
              key={product._id || product.id}
              product={product}
              listName="Wishlist"
              listId="wishlist"
            />
          ))}
        </div>
      )}
    </div>
  );
}
