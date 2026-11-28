import { notFound } from "next/navigation";
import AllProductsClient from "@/app/all-products/AllProductsClient";
import { getCatalogConfig } from "@/lib/catalogConfig";
import {
  fetchStoreCollection,
  fetchStoreFilters,
  fetchStoreProductsPage,
} from "@/lib/fetchProducts";
import { canonicalUrl } from "@/lib/siteUrl";
import { buildBreadcrumbJsonLd, jsonLdScript } from "@/lib/structuredData";

export const revalidate = 60;

function plainText(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const collection = await fetchStoreCollection(slug);
  if (!collection) return { title: "Collection not found" };
  const name = collection.name;
  const title = String(collection.metaTitle || "").trim() || name;
  const url = canonicalUrl(`/collections/${collection.slug}`);
  const description =
    String(collection.metaDescription || "").trim() ||
    plainText(collection.description).slice(0, 160) ||
    `Shop the ${name} collection from Urban Aana — premium streetwear shipped across India.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | Urban Aana`,
      description,
      url,
      ...(collection.image ? { images: [collection.image] } : {}),
    },
  };
}

export default async function CollectionPage({ params, searchParams }) {
  const { catalogPageSize, cardPriorityCount } = getCatalogConfig();
  const { slug } = await params;
  const sp = await searchParams;
  const collection = await fetchStoreCollection(slug);
  if (!collection) notFound();

  const query = {
    collection: collection.slug,
    pageSize: catalogPageSize,
    pageNum: 1,
    sort: "newest",
  };
  for (const key of ["color", "size", "category", "fit", "fabric", "badge", "priceRange"]) {
    if (typeof sp?.[key] === "string" && sp[key]) query[key] = sp[key];
  }
  const [initialPage, initialFacets] = await Promise.all([
    fetchStoreProductsPage(query),
    fetchStoreFilters(),
  ]);

  const breadcrumbLd = jsonLdScript(
    buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: collection.name, path: `/collections/${collection.slug}` },
    ])
  );

  return (
    <>
      {breadcrumbLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbLd }}
        />
      ) : null}
      <AllProductsClient
        key={collection.slug}
        collection={collection}
        initialProducts={initialPage.products}
        initialHasMore={initialPage.hasMore}
        initialFacets={initialFacets}
        catalogPageSize={catalogPageSize}
        cardPriorityCount={cardPriorityCount}
      />
    </>
  );
}
