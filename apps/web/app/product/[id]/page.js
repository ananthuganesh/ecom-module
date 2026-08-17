import { notFound } from "next/navigation";
import ProductDetailClient from "./ProductDetailClient";
import { productJsonLdScript } from "@/lib/productJsonLd";
import {
  absoluteUrl,
  fetchProductForSeo,
  productCanonicalPath,
  productDocumentTitle,
  productOgImage,
} from "@/lib/siteUrl";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await fetchProductForSeo(id);
  if (!product) {
    return {
      title: { absolute: "Product | Urban Aana" },
      description: "Shop premium streetwear at Urban Aana.",
    };
  }

  const title = productDocumentTitle(product);
  const description =
    (product.metaDescription || "").trim() ||
    String(product.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) ||
    "Shop premium streetwear at Urban Aana.";
  const canonical = absoluteUrl(productCanonicalPath(product));
  const image = productOgImage(product);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Urban Aana",
      type: "website",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await fetchProductForSeo(id);
  if (!product) notFound();

  const lcpImage = productOgImage(product);
  const preloadLcp =
    lcpImage &&
    !lcpImage.includes("/urban/about-1") &&
    (lcpImage.startsWith("http://") || lcpImage.startsWith("https://"));
  const jsonLd = productJsonLdScript(product);

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      {preloadLcp ? (
        <link
          rel="preload"
          as="image"
          href={lcpImage}
          fetchPriority="high"
        />
      ) : null}
      <ProductDetailClient
        key={product._id || product.id || id}
        initialProduct={product}
      />
    </>
  );
}
