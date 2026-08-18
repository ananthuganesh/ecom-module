import CategoryPageClient from "./CategoryPageClient";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { fetchStoreProducts } from "@/lib/fetchProducts";
import { canonicalUrl } from "@/lib/siteUrl";

export const revalidate = 60;

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const name = titleFromSlug(slug) || "Category";
  const path = `/category/${slug}`;
  const url = canonicalUrl(path);
  return {
    title: name,
    description: `Shop ${name.toLowerCase()} from Urban Aana — premium streetwear shipped across India.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} | Urban Aana`,
      description: `Shop ${name.toLowerCase()} from Urban Aana.`,
      url,
    },
  };
}

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
