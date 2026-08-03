"use client";

import { Loader2 } from "lucide-react";
import { ChevronRightIcon } from "@/components/icons/storeIcons";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import ProductCard from "@/components/storefront/ProductCard";
import WhyUrbanAana from "@/components/storefront/WhyUrbanAana";
import { productService } from "@/api";
import { motion } from "framer-motion";
import { trackViewItemList } from "@/lib/tracking";

import Link from "next/link";

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function CategoryPage() {
  const { slug } = useParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const categoryName = useMemo(() => titleFromSlug(slug), [slug]);

  useEffect(() => {
    const fetchCategoryData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await productService.getProducts({
          category: slug,
          pageSize: 100,
        });
        const list = Array.isArray(response)
          ? response
          : response?.products || response?.items || [];
        setProducts(list);
        if (list.length) {
          trackViewItemList(list, `Category: ${slug}`, `category-${slug}`);
        }
      } catch (err) {
        console.error("Error fetching category products:", err);
        setError(err.message || "Failed to load category data");
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchCategoryData();
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="flex h-[70vh] flex-col items-center justify-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-[12px] font-black uppercase tracking-[0.3em] text-gray-400">
            Loading Products
          </p>
        </div>
      </main>
    );
  }

  if (error) {
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
      <section className="relative overflow-hidden border-b-2 border-black bg-[#F9F9F5] pb-16 pt-28 md:pb-24 md:pt-36">
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
            <p className="max-w-xl text-sm font-medium leading-relaxed text-gray-600 md:text-base">
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
              {products.map((product) => (
                <ProductCard key={product._id} product={product} />
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
