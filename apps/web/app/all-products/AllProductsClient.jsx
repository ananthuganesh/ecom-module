"use client";

import {
  useState,
  useEffect,
  Suspense,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { ChevronDown, Loader2, SearchX } from "lucide-react";
import { FilterIcon } from "@/components/icons/storeIcons";
import ProductCard from "@/components/storefront/ProductCard";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { productService } from "@/api";
import FilterSidebar from "@/components/FilterSidebar";
import ProductSkeleton from "@/components/ProductSkeleton";
import { trackViewItemList, trackSearch } from "@/lib/tracking";
import { normalizeProductPage } from "@/utils/normalizeProductPage";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";

const WhyUrbanAana = dynamic(() => import("@/components/storefront/WhyUrbanAana"));

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

const EMPTY_FACETS = {
  sizes: [],
  colors: [],
  categories: [],
  fits: [],
  fabrics: [],
  badges: [],
  priceRanges: [],
};

function SortDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-black transition hover:border-black lg:min-w-[11rem] lg:w-auto"
      >
        <span className="truncate">
          <span className="mr-1 font-medium text-gray-500">Sort:</span>
          {selected.label}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 min-w-full overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full px-3 py-2 text-left text-[12px] transition-colors ${
                    active
                      ? "bg-gray-100 font-semibold text-black"
                      : "font-medium text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** "Kerala Prints" → Kerala <accent>Prints</accent>, matching "All Products". */
function AccentTitle({ text }) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return <span className="title-knewave-accent">{words[0] || ""}</span>;
  }
  return (
    <>
      {words.slice(0, -1).join(" ")}{" "}
      <span className="title-knewave-accent">{words[words.length - 1]}</span>
    </>
  );
}

function AllProductsContent({
  initialProducts = [],
  initialHasMore = false,
  initialFacets = EMPTY_FACETS,
  catalogPageSize = 40,
  cardPriorityCount = 2,
  collection = null,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyword = collection ? "" : searchParams.get("search") || "";
  const basePath = collection ? `/collections/${collection.slug}` : "/all-products";
  const listName = keyword
    ? "Search results"
    : collection
      ? `Collection: ${collection.name}`
      : "All products";
  const listId = keyword ? "search" : collection ? `collection-${collection.slug}` : "all-products";

  const [products, setProducts] = useState(initialProducts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [facets, setFacets] = useState(initialFacets);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const skipInitialFetch = useRef(true);
  const fetchGen = useRef(0);
  const loadMoreRef = useRef(null);
  const loadMoreLockRef = useRef(false);

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
    router.replace(queryString ? `${basePath}?${queryString}` : basePath, {
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
    if (
      !initialFacets?.categories?.length &&
      !initialFacets?.sizes?.length &&
      !initialFacets?.colors?.length
    ) {
      fetchFilters();
    }
  }, [initialFacets]);

  const buildParams = useCallback(
    (pageNum) => {
      const params = {
        pageSize: catalogPageSize,
        pageNum,
        sort: sortBy,
        ...activeFilters,
      };
      if (keyword) params.keyword = keyword;
      if (collection) params.collection = collection.slug;
      return params;
    },
    [catalogPageSize, sortBy, activeFilters, keyword, collection]
  );

  const fetchPage = useCallback(
    async (pageNum, { append } = {}) => {
      const gen = ++fetchGen.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await productService.getProducts(buildParams(pageNum));
        if (gen !== fetchGen.current) return;
        const {
          products: list,
          hasMore: more,
        } = normalizeProductPage(data, {
          pageSize: catalogPageSize,
          pageNum,
        });
        setProducts((prev) => {
          if (!append) return list;
          const seen = new Set(prev.map((p) => p._id));
          return [...prev, ...list.filter((p) => p._id && !seen.has(p._id))];
        });
        setPage(pageNum);
        setHasMore(more);
        if (!append) {
          if (keyword) trackSearch(keyword, list);
          trackViewItemList(list, listName, listId);
        }
      } catch (error) {
        if (gen !== fetchGen.current) return;
        console.error("Error fetching products:", error);
        if (!append) {
          setProducts([]);
          setHasMore(false);
        }
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildParams, catalogPageSize, keyword, listName, listId]
  );

  useEffect(() => {
    // Server already hydrated the first paint — avoid an immediate duplicate fetch.
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      if (initialProducts.length) {
        setProducts(initialProducts);
        setPage(1);
        setHasMore(initialHasMore);
        if (keyword) trackSearch(keyword, initialProducts);
        trackViewItemList(initialProducts, listName, listId);
        return;
      }
    }
    fetchPage(1, { append: false });
  }, [fetchPage, initialProducts, initialHasMore, keyword, listName, listId]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    return fetchPage(page + 1, { append: true });
  }, [hasMore, loading, loadingMore, page, fetchPage]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (loadMoreLockRef.current || loadingMore || loading || !hasMore) return;
        loadMoreLockRef.current = true;
        Promise.resolve(handleLoadMore())
          .catch(() => {})
          .finally(() => {
            loadMoreLockRef.current = false;
          });
      },
      { root: null, rootMargin: "240px", threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, handleLoadMore, products.length]);

  const showSkeleton = loading && products.length === 0;

  return (
    <>
      <section className="bg-[#F9F9F5] pt-10 pb-5">
        <div className="w-full px-4 lg:px-8">
          <motion.header
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full text-center"
          >
            <h1 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
              {collection ? (
                <AccentTitle text={collection.name} />
              ) : keyword ? (
                <>
                  Search <span className="title-knewave-accent">Results</span>
                </>
              ) : (
                <>
                  All <span className="title-knewave-accent">Products</span>
                </>
              )}
            </h1>
            {collection?.description ? (
              <p className="mx-auto mt-3 max-w-2xl text-[13px] leading-relaxed whitespace-pre-line text-gray-600 md:text-sm">
                {collection.description}
              </p>
            ) : null}
          </motion.header>
        </div>
      </section>

      <section className="bg-white pb-10 md:pb-14">
        <div className="w-full px-4 lg:px-8">
          <div className="mb-6 flex items-center gap-3 lg:mb-8 lg:justify-end">
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="inline-flex h-10 w-1/2 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-[12px] font-semibold text-black transition hover:border-black lg:hidden"
            >
              <FilterIcon className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full border border-black bg-transparent px-1.5 text-[10px] font-bold text-black">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
            <div className="w-1/2 lg:w-auto">
              <SortDropdown
                value={sortBy}
                onChange={setSortBy}
                options={SORT_OPTIONS}
              />
            </div>
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

            <div
              className={`w-full min-w-0 flex-1 transition-opacity ${
                loading && products.length ? "opacity-60" : "opacity-100"
              }`}
            >
              {showSkeleton ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:gap-4 xl:grid-cols-4">
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
                      : collection && activeFilterCount === 0
                        ? "No products in this collection yet"
                        : "No matching products"}
                  </p>
                  <p className="mb-7 max-w-sm text-sm text-gray-500">
                    Try clearing filters or browsing the full catalog.
                  </p>
                  {activeFilterCount > 0 || keyword ? (
                    <button
                      type="button"
                      onClick={() => handleFilterChange({})}
                      className="rounded-lg bg-black px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#DF1721]"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <Link
                      href="/all-products"
                      className="rounded-lg bg-black px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#DF1721]"
                    >
                      Browse all products
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 pb-4 md:grid-cols-3 md:gap-3 lg:gap-4 xl:grid-cols-4">
                    {products.map((product, index) => (
                      <ProductCard
                        key={product._id}
                        product={product}
                        listName={listName}
                        listId={listId}
                        priority={index < cardPriorityCount}
                      />
                    ))}
                  </div>
                  {hasMore || loadingMore ? (
                    <div
                      ref={loadMoreRef}
                      className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500"
                      aria-hidden={!loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading more…</span>
                        </>
                      ) : (
                        <span className="h-4" />
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function AllProductsClient({
  initialProducts = [],
  initialHasMore = false,
  initialFacets = EMPTY_FACETS,
  catalogPageSize = 40,
  cardPriorityCount = 2,
  collection = null,
}) {
  return (
    <main className="min-h-screen bg-white">
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-2 px-4 py-10 md:grid-cols-3 md:px-4 lg:grid-cols-4 lg:px-8">
            {[...Array(8)].map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        }
      >
        <AllProductsContent
          initialProducts={initialProducts}
          initialHasMore={initialHasMore}
          initialFacets={initialFacets}
          catalogPageSize={catalogPageSize}
          cardPriorityCount={cardPriorityCount}
          collection={collection}
        />
      </Suspense>
      <WhyUrbanAana />
    </main>
  );
}
