"use client";

import { useEffect, useState } from "react";
import { useRecentlyViewedStore } from "@/store/useRecentlyViewedStore";
import ProductCard from "@/components/storefront/ProductCard";
import { productService } from "@/api";

export default function RecentlyViewed({ excludeId } = {}) {
  const { recentlyViewed } = useRecentlyViewedStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const history = recentlyViewed.filter(
    (item) => !excludeId || String(item._id) !== String(excludeId)
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!history.length) {
        setProducts([]);
        return;
      }

      setLoading(true);
      try {
        const results = await Promise.all(
          history.map(async (item) => {
            try {
              const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(item._id));
              if (isObjectId) {
                try {
                  return await productService.getById(item._id);
                } catch {
                  if (item.slug) return await productService.getBySlug(item.slug);
                }
              }
              if (item.slug) return await productService.getBySlug(item.slug);
              return await productService.getById(item._id);
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        setProducts(results.filter(Boolean));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // Re-run when history ids change
     
  }, [history.map((item) => item._id).join("|"), excludeId]);

  if (!history.length) return null;
  if (!loading && products.length === 0) return null;

  return (
    <section className="border-t border-gray-100 bg-[#ffffff] py-6 md:py-10">
      <header className="mb-3 w-full px-4 text-center md:mb-6 lg:px-8">
        <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Recently <span className="title-knewave-accent">Viewed</span>
        </h2>
      </header>

      {loading && products.length === 0 ? (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:gap-3 lg:gap-4 lg:px-8">
          {history.slice(0, 6).map((item) => (
            <div
              key={item._id}
              className="aspect-[2/3] w-[48%] shrink-0 animate-pulse rounded-xl bg-gray-100 sm:w-[30%] md:w-[22%] lg:w-[18%] lg:rounded-2xl"
            />
          ))}
        </div>
      ) : (
        <div
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:gap-3 lg:gap-4 lg:px-8"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {products.map((product) => (
            <div
              key={product._id}
              className="w-[48%] shrink-0 sm:w-[30%] md:w-[22%] lg:w-[18%]"
            >
              <ProductCard
                product={product}
                listName="Recently viewed"
                listId="recently-viewed"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
