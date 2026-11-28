"use client";

import { useEffect, useState } from "react";
import { productService } from "@/api";
import { filterInStock } from "@/lib/productStock";
import SearchProductGrid, { SearchProductGridSkeleton } from "./SearchProductGrid";

const COUNT = 4;
const LIST_ID = "search-popular";
const LIST_NAME = "Search: Popular products";
// Best sellers first; new arrivals fill in while sales are thin.
const SOURCES = ["best-sellers", "new-arrivals"];

// Fetched once per page load; reopening search shows them instantly.
let cached = null;
let pending = null;

async function loadPopular() {
  if (cached) return cached;
  if (!pending) {
    pending = (async () => {
      const picked = [];
      const seen = new Set();
      for (const collection of SOURCES) {
        if (picked.length >= COUNT) break;
        try {
          const data = await productService.getProducts({ collection, pageSize: 24 });
          for (const p of filterInStock(data?.products || [])) {
            const key = String(p._id || p.id);
            if (seen.has(key)) continue;
            seen.add(key);
            picked.push(p);
            if (picked.length >= COUNT) break;
          }
        } catch {
          // Try the next source; an empty panel is fine.
        }
      }
      cached = picked;
      return picked;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

/** "Popular products" shown in the search panel before the shopper types. */
export default function SearchPopularProducts({ onNavigate }) {
  const [products, setProducts] = useState(cached);

  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    loadPopular().then((rows) => {
      if (alive) setProducts(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (products === null) return <SearchProductGridSkeleton count={COUNT} />;
  if (!products.length) return null;

  return (
    <section aria-labelledby="search-popular-title">
      <h2 id="search-popular-title" className="mb-4 text-[15px] font-medium text-gray-900 md:mb-6 md:text-[17px]">
        Popular products
      </h2>
      <SearchProductGrid products={products} onNavigate={onNavigate} listId={LIST_ID} listName={LIST_NAME} />
    </section>
  );
}
