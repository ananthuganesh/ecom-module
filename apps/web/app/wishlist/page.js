"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import ProductCard from "@/components/storefront/ProductCard";
import { productService } from "@/api";
import { useWishlistStore } from "@/store/useWishlistStore";

export default function WishlistPage() {
  const items = useWishlistStore((s) => s.items);
  // Wishlist entries are snapshots saved to localStorage when the heart was
  // tapped, so their stock is frozen at that moment and a since-sold-out size
  // still renders as available. Re-read the live products on mount.
  const [fresh, setFresh] = useState({});

  const ids = useMemo(
    () => items.map((p) => String(p._id || p.id || "")).filter(Boolean),
    [items]
  );
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled(
        ids.map((id) => productService.getById(id))
      );
      if (cancelled) return;
      const next = {};
      results.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value) {
          next[ids[i]] = result.value;
        }
      });
      setFresh(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return (
    <div className="min-h-[60vh] bg-white px-4 py-8 md:px-4 md:py-12 lg:px-8">
      <header className="mb-6 text-center md:mb-8">
        <h1 className="title-knewave text-2xl leading-none tracking-tight normal-case md:text-4xl">
          My <span className="title-knewave-accent">Wishlist</span>
        </h1>
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
          {items.map((product) => {
            const id = String(product._id || product.id || "");
            const live = fresh[id];
            // Live data wins for stock; the snapshot still covers a product
            // that has since been deleted or failed to load.
            const shown = live
              ? {
                  ...product,
                  ...live,
                  _id: id,
                  variants: live.variants ?? product.variants,
                  totalStock: live.totalStock ?? product.totalStock,
                }
              : product;
            return (
              <ProductCard
                key={id || product.slug}
                product={shown}
                listName="Wishlist"
                listId="wishlist"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
