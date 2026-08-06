import AllProductsClient from "./AllProductsClient";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { fetchStoreFilters, fetchStoreProductsPage } from "@/lib/fetchProducts";

export const revalidate = 60;

export default async function AllProductsPage({ searchParams }) {
  const { catalogPageSize, cardPriorityCount } = getCatalogConfig();
  const sp = await searchParams;
  const keyword = typeof sp?.search === "string" ? sp.search : "";
  const params = {
    pageSize: catalogPageSize,
    pageNum: 1,
    sort: "newest",
  };
  if (keyword) params.keyword = keyword;
  for (const key of ["color", "size", "category", "fit", "fabric", "badge", "priceRange"]) {
    if (typeof sp?.[key] === "string" && sp[key]) params[key] = sp[key];
  }

  const [initialPage, initialFacets] = await Promise.all([
    fetchStoreProductsPage(params),
    fetchStoreFilters(),
  ]);

  return (
    <AllProductsClient
      key={keyword || "all"}
      initialProducts={initialPage.products}
      initialHasMore={initialPage.hasMore}
      initialFacets={initialFacets}
      catalogPageSize={catalogPageSize}
      cardPriorityCount={cardPriorityCount}
    />
  );
}
