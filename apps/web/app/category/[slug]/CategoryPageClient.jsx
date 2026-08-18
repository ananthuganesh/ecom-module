"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRightIcon } from "@/components/icons/storeIcons";
import ProductCard from "@/components/storefront/ProductCard";
import { productService } from "@/api";
import { trackViewItemList } from "@/lib/tracking";
import dynamic from "next/dynamic";

const WhyUrbanAana = dynamic(() => import("@/components/storefront/WhyUrbanAana"));

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function CategoryPageClient({
  slug,
  initialProducts = [],
  categoryPageSize = 100,
  cardPriorityCount = 2,
}) {
  const [products, setProducts] = useState(initialProducts);
  const [error, setError] = useState(null);
  const categoryName = useMemo(() => titleFromSlug(slug), [slug]);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  useEffect(() => {
    if (!slug || initialProducts.length) {
      if (initialProducts.length) {
        trackViewItemList(
          initialProducts,
          `Category: ${slug}`,
          `category-${slug}`
        );
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await productService.getProducts({
          category: slug,
          pageSize: categoryPageSize,
        });
        if (cancelled) return;
        const list = Array.isArray(response)
          ? response
          : response?.products || response?.items || [];
        setProducts(list);
        if (list.length) {
          trackViewItemList(list, `Category: ${slug}`, `category-${slug}`);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error fetching category products:", err);
          setError(err.message || "Failed to load category data");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, initialProducts, categoryPageSize]);

  if (error && !products.length) {
    return (
      <main className="min-h-screen bg-white">
        <div className="container-site pt-40 pb-20 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tighter uppercase">
            Category Not Found
          </h1>
          <p className="mb-8 font-medium text-gray-500">
            We couldn&apos;t find the category you&apos;re looking for.
          </p>
          <Link href="/" className="btn-primary">
            Return Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="relative overflow-hidden border-b-2 border-black bg-[#F9F9F5] pt-28 pb-16 md:pt-36 md:pb-24">
        <div className="pointer-events-none absolute top-0 right-0 h-full w-1/2 opacity-[0.035]">
          <span className="font-vina select-none text-[20vw] leading-none uppercase">
            {categoryName}
          </span>
        </div>
        <div className="container-site relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="mb-6 flex items-center gap-2">
              <Link
                href="/"
                className="text-[12px] font-bold tracking-widest text-gray-400 uppercase transition-colors hover:text-[#DF1721]"
              >
                Home
              </Link>
              <ChevronRightIcon className="h-3 w-3 text-gray-300" />
              <span className="text-[12px] font-bold tracking-widest text-[#DF1721] uppercase">
                {categoryName}
              </span>
            </div>
            <p className="mb-3 text-[12px] font-bold tracking-[0.3em] text-[#DF1721] uppercase">
              Urban Aana archive
            </p>
            <h1 className="font-vina mb-8 text-6xl leading-[0.9] tracking-tight uppercase md:text-8xl">
              {categoryName}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed font-medium text-gray-600 md:text-base">
              Explore our exclusive range of premium {categoryName.toLowerCase()},
              designed for the modern lifestyle.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="bg-white py-16 md:py-24">
        <div className="container-site">
          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4">
              {products.map((product, index) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  listName={`Category: ${slug}`}
                  listId={`category-${slug}`}
                  priority={index < cardPriorityCount}
                />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-[12px] font-black tracking-[0.3em] text-gray-300 uppercase italic">
                No products found in this category yet.
              </p>
            </div>
          )}
        </div>
      </section>
      <WhyUrbanAana />
    </main>
  );
}
