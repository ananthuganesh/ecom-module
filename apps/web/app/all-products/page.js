import AllProductsClient from "./AllProductsClient";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { fetchStoreFilters, fetchStoreProducts } from "@/lib/fetchProducts";

export const revalidate = 60;

export default async function AllProductsPage({ searchParams }) {
  const { catalogPageSize, cardPriorityCount } = getCatalogConfig();
  const sp = await searchParams;
  const keyword = typeof sp?.search === "string" ? sp.search : "";
  const params = {
    pageSize: catalogPageSize,
    sort: "newest",
  };
  if (keyword) params.keyword = keyword;
  for (const key of ["color", "size", "category", "fit", "fabric", "badge", "priceRange"]) {
    if (typeof sp?.[key] === "string" && sp[key]) params[key] = sp[key];
  }

  const [initialProducts, initialFacets] = await Promise.all([
    fetchStoreProducts(params),
    fetchStoreFilters(),
  ]);

  return (
    <AllProductsClient
      initialProducts={initialProducts}
      initialFacets={initialFacets}
      catalogPageSize={catalogPageSize}
      cardPriorityCount={cardPriorityCount}
    />
  );
}
