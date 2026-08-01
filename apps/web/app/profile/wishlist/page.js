"use client";

import {
  DeleteIcon,
  HeartBagIcon
} from "@/components/icons/storeIcons";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import Link from "next/link";
import { useWishlistStore } from "@/store/useWishlistStore";
import ProductCard from "@/components/storefront/ProductCard";

export default function WishlistPage() {
  const wishlistItems = useWishlistStore((s) => s.wishlistItems);
  const removeFromWishlist = useWishlistStore((s) => s.removeFromWishlist);

  return (
    <DashboardLayout title="My Wishlist">
      {wishlistItems.length === 0 ? (
        <div className="bg-white p-20 text-center border border-gray-100 shadow-sm">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8 text-rose-500">
            <HeartBagIcon className="w-10 h-10" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-widest text-primary mb-4">
            Your wishlist is empty
          </h2>
          <p className="text-xs text-gray-400 mb-10 max-w-sm mx-auto leading-relaxed">
            Save Urban Aana drops you like and find them here later.
          </p>
          <Link href="/all-products" className="btn-primary">
            Browse all products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {wishlistItems.map((item) => (
            <div key={item._id} className="relative">
              <button
                type="button"
                onClick={() => removeFromWishlist(item._id)}
                className="absolute top-3 right-3 z-20 p-2 bg-white/90 border border-gray-100 text-red-500 hover:bg-white"
                aria-label="Remove from wishlist"
              >
                <DeleteIcon className="w-4 h-4" />
              </button>
              <ProductCard product={item} />
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
