"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { SearchX } from "lucide-react";
import { FilterIcon } from "@/components/icons/storeIcons";
import ProductCard from "@/components/storefront/ProductCard";
import { useSearchParams, useRouter } from "next/navigation";
import { productService } from "@/api";
import FilterSidebar from "@/components/FilterSidebar";
import ProductSkeleton from "@/components/ProductSkeleton";
import WhyUrbanAana from "@/components/storefront/WhyUrbanAana";
import { trackViewItemList } from "@/lib/tracking";
import { motion } from "framer-motion";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

function AllProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyword = searchParams.get("search") || "";

  const [products, setProducts] = useState([]);
  const [facets, setFacets] = useState({
    sizes: [],
    colors: [],
    categories: [],
    fits: [],
    fabrics: [],
    badges: [],
    priceRanges: [],
  });
  const [loading, setLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState("newest");

  const activeFilters = useMemo(() => {
    const next = {};
    searchParams.forEach((value, key) => {
      if (
        ["color", "size", "category", "fit", "fabric", "badge", "priceRange"].includes(
          key
        )
      ) {
        next[key] = value;
      }
    });
    return next;
  }, [searchParams]);

  const activeFilterCount = useMemo(
    () =>
      Object.values(activeFilters).reduce((count, value) => {
        if (!value) return count;
        return count + String(value).split(",").filter(Boolean).length;
      }, 0),
    [activeFilters]
  );

  const handleFilterChange = (newFilters) => {
    const q = new URLSearchParams();
    if (keyword) q.set("search", keyword);
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value) q.set(key, value);
    });
    const queryString = q.toString();
    router.replace(queryString ? `/all-products?${queryString}` : "/all-products", {
      scroll: false,
    });
  };

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const data = await productService.getFilters();
        setFacets({
          sizes: Array.isArray(data?.sizes) ? data.sizes : [],
          colors: Array.isArray(data?.colors) ? data.colors : [],
          categories: Array.isArray(data?.categories) ? data.categories : [],
          fits: Array.isArray(data?.fits) ? data.fits : [],
          fabrics: Array.isArray(data?.fabrics) ? data.fabrics : [],
          badges: Array.isArray(data?.badges) ? data.badges : [],
          priceRanges: Array.isArray(data?.priceRanges) ? data.priceRanges : [],
        });
      } catch (err) {
        console.error("Error fetching filters:", err);
      }
    };
    fetchFilters();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const params = { pageSize: 40, ...activeFilters, sort: sortBy };
        if (keyword) params.keyword = keyword;

        const data = await productService.getProducts(params);
        const list = Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data)
            ? data
            : [];
        setProducts(list);
        trackViewItemList(
          list,
          keyword ? "Search results" : "All products",
          keyword ? "search" : "all-products"
        );
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [searchParams, sortBy, keyword, activeFilters]);

  return (
    <>
      <section className="bg-[#F9F9F5] py-6 md:py-10">
        <div className="w-full px-2 md:px-4 lg:px-8">
          <motion.header
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full text-left"
          >
            <h1 className="title-knewave w-full text-left text-3xl leading-none tracking-tight normal-case md:text-4xl">
              {keyword ? (
                <>
                  Search <span className="title-knewave-accent">Results</span>
                </>
              ) : (
                <>
                  All <span className="title-knewave-accent">Products</span>
                </>
              )}
            </h1>
          </motion.header>
        </div>
      </section>

      <section className="bg-white pb-10 md:pb-14">
        <div className="w-full px-2 md:px-4 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-black transition hover:border-black lg:hidden"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-black px-1.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-gray-500">
              <span className="hidden sm:inline">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-black outline-none transition hover:border-black focus:border-black"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex min-h-[480px] items-start gap-0 lg:gap-10 xl:gap-12">
            {isFilterOpen ? (
              <button
                type="button"
                aria-label="Close filters"
                className="fixed inset-0 z-40 bg-black/30 lg:hidden"
                onClick={() => setIsFilterOpen(false)}
              />
            ) : null}

            <FilterSidebar
              filters={activeFilters}
              facets={facets}
              onFilterChange={handleFilterChange}
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
            />

            <div className="w-full min-w-0 flex-1">
              {loading ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-4 lg:gap-4">
                  {[...Array(8)].map((_, i) => (
                    <ProductSkeleton key={i} />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-[#F9F9F5] px-6 py-20 text-center">
                  <SearchX className="mb-5 h-10 w-10 text-gray-300" />
                  <p className="mb-2 text-base font-semibold text-black">
                    {keyword
                      ? `No products found for “${keyword}”`
                      : "No matching products"}
                  </p>
                  <p className="mb-7 max-w-sm text-sm text-gray-500">
                    Try clearing filters or browsing the full catalog.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleFilterChange({})}
                    className="rounded-lg bg-black px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#DF1721]"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pb-8 md:grid-cols-3 md:gap-3 xl:grid-cols-4 lg:gap-4">
                  {products.map((product) => (
                    <ProductCard
                      key={product._id}
                      product={product}
                      activeColor={activeFilters.color}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function AllProductsPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-gray-400">
              Loading store…
            </p>
          </div>
        }
      >
        <AllProductsContent />
      </Suspense>
      <WhyUrbanAana />
    </main>
  );
}
