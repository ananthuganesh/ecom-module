import { notFound } from "next/navigation";
import { getImageProps } from "next/image";
import { preload } from "react-dom";
import ProductDetailClient from "./ProductDetailClient";
import { productBreadcrumbJsonLd, productJsonLdScript } from "@/lib/productJsonLd";
import { jsonLdScript } from "@/lib/structuredData";
import { productMetaDescription } from "@/lib/productMeta";
import { initialGalleryImages, isOptimizedImageUrl } from "@/lib/productGallery";
import { resolveImageUrl } from "@/utils/imageResolver";
import { fetchStoreProducts } from "@/lib/fetchProducts";
import { filterInStock } from "@/lib/productStock";
import { mergeRelated, relatedQueries } from "@/lib/relatedProducts";
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
  const description = productMetaDescription(product);
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
      // og:type "product" + price tags are rendered in the page (Next's
      // metadata API has no product type).
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

/** Gallery breakpoint (Tailwind lg): the mobile carousel below, the desktop grid above. */
const MOBILE_MEDIA = "(max-width: 1023px)";
const DESKTOP_MEDIA = "(min-width: 1024px)";

/**
 * Preload the first gallery photo exactly as the gallery renders it — the
 * optimized srcset at the gallery's `sizes`, once per layout — instead of the
 * raw file (which the page never displays).
 */
function preloadFirstPhoto(product) {
  const photos = initialGalleryImages(product);
  if (!photos.length) return;
  const src = resolveImageUrl(photos[0]);
  if (!src) return;
  if (!isOptimizedImageUrl(src)) {
    preload(src, { as: "image", fetchPriority: "high" });
    return;
  }
  const desktopSizes = photos.length > 1 ? "42vw" : "50vw";
  for (const [sizes, media] of [
    ["100vw", MOBILE_MEDIA],
    [desktopSizes, DESKTOP_MEDIA],
  ]) {
    const { props } = getImageProps({ src, alt: "", fill: true, sizes });
    preload(props.src, {
      as: "image",
      fetchPriority: "high",
      imageSrcSet: props.srcSet,
      imageSizes: props.sizes,
      media,
    });
  }
}

/** Up to 8 in-stock related products, rendered into the HTML for crawlers and shoppers. */
async function fetchRelatedProducts(product) {
  const lists = [];
  let related = [];
  for (const query of relatedQueries(product)) {
    lists.push(await fetchStoreProducts(query));
    related = filterInStock(mergeRelated(product._id, lists, 12));
    if (related.length >= 8) break;
  }
  return related.slice(0, 8);
}

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await fetchProductForSeo(id);
  if (!product) notFound();

  preloadFirstPhoto(product);
  const initialSimilar = await fetchRelatedProducts(product);
  const jsonLd = productJsonLdScript(product);
  const price = Number(product?.pricing?.sellingPrice ?? product?.price ?? 0);
  const breadcrumbLd = jsonLdScript(productBreadcrumbJsonLd(product));

  return (
    <>
      {/* React hoists these into <head>. */}
      <meta property="og:type" content="product" />
      {price > 0 ? <meta property="product:price:amount" content={price.toFixed(2)} /> : null}
      {price > 0 ? <meta property="product:price:currency" content="INR" /> : null}
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      {breadcrumbLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbLd }}
        />
      ) : null}
      <ProductDetailClient
        key={product._id || product.id || id}
        initialProduct={product}
        initialSimilar={initialSimilar}
      />
    </>
  );
}
