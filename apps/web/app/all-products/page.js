import AllProductsClient from "./AllProductsClient";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { fetchStoreFilters, fetchStoreProductsPage } from "@/lib/fetchProducts";
import { canonicalUrl } from "@/lib/siteUrl";

export const revalidate = 60;

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const keyword = typeof sp?.search === "string" ? sp.search.trim() : "";
  const collection = canonicalUrl("/all-products");
  if (keyword) {
    return {
      title: `Search: ${keyword}`,
      description: `Urban Aana search results for “${keyword}”.`,
      robots: { index: false, follow: true },
      alternates: { canonical: collection },
    };
  }
  return {
    title: "All Products",
    description:
      "Shop all Urban Aana premium streetwear — newest drops, tees, and essentials shipped across India.",
    alternates: { canonical: collection },
    openGraph: {
      title: "All Products | Urban Aana",
      description:
        "Shop all Urban Aana premium streetwear — newest drops, tees, and essentials shipped across India.",
      url: collection,
    },
  };
}

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
