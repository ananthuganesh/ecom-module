"use client";

import { useState, useEffect, Suspense } from "react";
import { SearchX } from "lucide-react";
import { FilterIcon } from "@/components/icons/storeIcons";
import ProductCard from "@/components/storefront/ProductCard";
import { useSearchParams, useRouter } from "next/navigation";
import { productService } from "@/api";
import FilterSidebar from "@/components/FilterSidebar";
import ProductSkeleton from "@/components/ProductSkeleton";

function AllProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyword = searchParams.get("search") || "";

  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState("Newest");

  const activeFilters = {};
  searchParams.forEach((value, key) => {
    if (["color", "priceRange", "brand"].includes(key)) {
      activeFilters[key] = value;
    }
  });

  const handleFilterChange = (newFilters) => {
    const q = new URLSearchParams();
    if (keyword) q.set("search", keyword);
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value) q.set(key, value);
    });
    const queryString = q.toString();
    router.replace(queryString ? `/all-products?${queryString}` : "/all-products", { scroll: false });
  };

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [brandData, colorData] = await Promise.all([
          productService.getBrands(),
          productService.getColors(),
        ]);
        setBrands(Array.isArray(brandData) ? brandData : []);
        setColors(Array.isArray(colorData) ? colorData : []);
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
        const params = { pageSize: 40, ...activeFilters };
        if (keyword) params.keyword = keyword;
        if (sortBy === "Price: Low to High") params.sort = "price_asc";
        if (sortBy === "Price: High to Low") params.sort = "price_desc";
        if (sortBy === "Newest") params.sort = "newest";

        const data = await productService.getProducts(params);
        setProducts(Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [searchParams, sortBy]);

  return (
    <section className="border-t-2 border-black bg-[#F9F9F5] py-10 md:py-16">
      <div className="container-site">
        <div className="mb-10 flex flex-col gap-4 border-b-2 border-black pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
              {keyword ? `Search results for “${keyword}”` : "Catalog"}
            </p>
            <h1 className="mt-2 font-vina text-5xl uppercase leading-none sm:text-7xl">All Products</h1>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-black bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-widest"
            >
              <option>Newest</option>
              <option>Price: Low to High</option>
              <option>Price: High to Low</option>
            </select>
            <p className="text-xs font-bold uppercase tracking-[0.16em]">{products.length} pieces</p>
          </div>
        </div>

        <div className="flex min-h-[600px] flex-col items-start gap-0 lg:flex-row lg:gap-12">
          <FilterSidebar
            filters={activeFilters}
            brands={brands}
            colors={colors}
            onFilterChange={handleFilterChange}
            isOpen={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
          />

          <div className="w-full min-w-0 flex-1">
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 pb-20 md:grid-cols-3 md:gap-x-6 md:gap-y-12 xl:grid-cols-4">
                {[...Array(8)].map((_, i) => (
                  <ProductSkeleton key={i} />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center border border-black bg-white py-20 text-center">
                <SearchX className="mb-6 h-12 w-12 text-gray-300" />
                <p className="mb-8 text-xs font-bold uppercase tracking-widest text-gray-500">
                  {keyword ? `No products found for "${keyword}"` : "No matching products"}
                </p>
                <button
                  type="button"
                  onClick={() => handleFilterChange({})}
                  className="bg-black px-6 py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition-colors hover:bg-[#DF1721]"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 pb-20 md:grid-cols-3 md:gap-x-6 md:gap-y-12 xl:grid-cols-4">
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
  );
}

export default function AllProductsPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="animate-pulse text-xs uppercase tracking-widest text-primary">
              Loading store…
            </div>
          </div>
        }
      >
        <AllProductsContent />
      </Suspense>
    </main>
  );
}
