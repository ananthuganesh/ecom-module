"use client";

import { useRecentlyViewedStore } from "@/store/useRecentlyViewedStore";
import Link from "next/link";
import SafeImage from "./SafeImage";
import { motion } from "framer-motion";
import { resolveImageUrl } from "@/utils/imageResolver";

export default function RecentlyViewed() {
  const { recentlyViewed } = useRecentlyViewedStore();

  if (recentlyViewed.length === 0) return null;

  return (
    <section className="border-t border-gray-100 bg-[#F9F9F5] py-16 sm:py-20">
      <div className="container-site">
        <div className="mb-10 flex items-end justify-between gap-4 border-b-2 border-black pb-5">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-brand-red">Keep exploring</p>
            <h2 className="mt-2 font-vina text-4xl uppercase leading-none sm:text-5xl">Recently viewed</h2>
          </div>
          <Link
            href="/all-products"
            className="border-b-2 border-black pb-1 text-[12px] font-extrabold uppercase tracking-widest"
          >
            All Products
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {recentlyViewed.map((product, i) => (
            <motion.div
              key={product._id}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="min-w-[180px] sm:min-w-[200px]"
            >
              <Link href={`/product/${product.slug || product._id}`} className="block group">
                <div className="relative mb-3 aspect-[2/3] overflow-hidden bg-gray-100">
                  <SafeImage
                    src={resolveImageUrl(
                      product.thumbnails?.[0] || product.variants?.[0]?.images?.[0]
                    )}
                    fill
                    sizes="200px"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <h3 className="truncate text-[12px] font-bold uppercase tracking-tight text-black">
                  {product.productName || product.name}
                </h3>
                <p className="mt-1 text-sm font-black text-black">
                  ₹{Number(product.pricing?.sellingPrice ?? 0).toLocaleString("en-IN")}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
