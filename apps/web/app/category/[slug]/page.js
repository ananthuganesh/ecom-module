import CategoryPageClient from "./CategoryPageClient";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { fetchStoreProducts } from "@/lib/fetchProducts";

export const revalidate = 60;

export default async function CategoryPage({ params }) {
  const { categoryPageSize, cardPriorityCount } = getCatalogConfig();
  const { slug } = await params;
  const initialProducts = await fetchStoreProducts({
    category: slug,
    pageSize: categoryPageSize,
  });

  return (
    <CategoryPageClient
      slug={slug}
      initialProducts={initialProducts}
      categoryPageSize={categoryPageSize}
      cardPriorityCount={cardPriorityCount}
    />
  );
}
