import ProductDetailClient from "./ProductDetailClient";
import {
  absoluteUrl,
  fetchProductForSeo,
  productCanonicalPath,
  productOgImage,
} from "@/lib/siteUrl";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await fetchProductForSeo(id);
  if (!product) {
    return {
      title: "Product | Urban Aana",
      description: "Shop premium streetwear at Urban Aana.",
    };
  }

  const title =
    (product.metaTitle || "").trim() ||
    `${product.productName || product.name || "Product"} | Urban Aana`;
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
    title,
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

export default function ProductPage() {
  return <ProductDetailClient />;
}
