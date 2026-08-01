"use client";

import {
  ArrowIcon,
  HeartBagIcon
} from "@/components/icons/storeIcons";
import ProductCard from "@/components/storefront/ProductCard";
import { useWishlistStore } from "@/store/useWishlistStore";
import { useAuthStore } from "@/store/useAuthStore";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WishlistPage() {
  const { wishlistItems } = useWishlistStore();
  const { userInfo } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!userInfo) {
      router.push("/login?redirect=/wishlist");
    }
  }, [userInfo, router]);

  if (!userInfo) return null;

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="container-site py-12 md:py-20">
        <div className="mb-10 border-b-2 border-black pb-6">
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-brand-red">Saved pieces</p>
          <h1 className="mt-2 font-vina text-5xl uppercase leading-none sm:text-7xl">Wishlist</h1>
          <p className="mt-3 text-sm text-gray-500">Your curated selection from the Urban Aana archive.</p>
        </div>

        {wishlistItems.length === 0 ? (
          <div className="flex flex-col items-center border border-black bg-[#F9F9F5] px-6 py-20 text-center">
            <HeartBagIcon className="mb-6 h-10 w-10 text-brand-red" strokeWidth={1.4} />
            <h2 className="font-vina text-3xl uppercase">Nothing saved yet</h2>
            <p className="mt-3 max-w-sm text-sm text-gray-500">Browse the drops and heart what you want to come back to.</p>
            <Link
              href="/all-products"
              className="mt-8 inline-flex items-center gap-2 bg-black px-6 py-3 text-[12px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-red"
            >
              Shop the collection <ArrowIcon size={14} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-6">
            {wishlistItems.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
