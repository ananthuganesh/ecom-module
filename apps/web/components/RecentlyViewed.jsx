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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.map((item) => item._id).join("|"), excludeId]);

  if (!history.length) return null;
  if (!loading && products.length === 0) return null;

  return (
    <section className="border-t border-gray-100 bg-[#ffffff] py-6 md:py-10">
      <div className="w-full px-2 md:px-4 lg:px-8">
        <header className="mb-3 w-full text-center md:mb-6">
          <h2 className="title-knewave mx-auto w-full text-center text-3xl leading-none tracking-tight normal-case md:text-4xl">
            Recently <span className="title-knewave-accent">Viewed</span>
          </h2>
        </header>

        {loading && products.length === 0 ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4">
            {history.slice(0, 4).map((item) => (
              <div
                key={item._id}
                className="aspect-[2/3] animate-pulse rounded-xl bg-gray-100 lg:rounded-2xl"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4">
            {products.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                listName="Recently viewed"
                listId="recently-viewed"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
