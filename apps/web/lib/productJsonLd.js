/**
 * Schema.org JSON-LD for storefront product pages.
 *
 * A product sold in sizes is a ProductGroup whose variants are the individual
 * sizes, each with its own SKU (e.g. GSRGDM-S), stock and offer. A product
 * without sizes is a plain Product. Offers carry shipping, the return policy
 * and the MRP as a strikethrough price, which Google merchant listings use.
 */
import { absoluteUrl, productCanonicalPath, productOgImage } from "./siteUrl.js";
import { productRating } from "./reviews.js";
import {
  buildBreadcrumbJsonLd,
  categorySlug,
  jsonLdScript,
  merchantReturnPolicy,
  offerShippingDetails,
  organizationId,
} from "./structuredData.js";

const BRAND = { "@type": "Brand", name: "Urban Aana" };

/** Drop undefined keys so optional fields are absent, not present-but-empty. */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unitPrice(product) {
  const pricing = product?.pricing || {};
  const candidates = [
    pricing.offerPrice,
    pricing.sellingPrice,
    product?.price,
    pricing.mrp,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function listPrice(product, price) {
  const mrp = Number(product?.pricing?.mrp);
  return Number.isFinite(mrp) && price != null && mrp > price ? mrp : null;
}

function productImages(product) {
  const list = [
    ...(Array.isArray(product?.thumbnails) ? product.thumbnails : []),
    ...(Array.isArray(product?.images) ? product.images : []),
  ]
    .map((src) => String(src || "").trim())
    .filter(Boolean)
    .map((src) => (src.startsWith("http") ? src : absoluteUrl(src.startsWith("/") ? src : `/${src}`)));
  const unique = [...new Set(list)].slice(0, 10);
  return unique.length ? unique : [productOgImage(product)];
}

/** Live sizes with their stock; deleted and blank-size variants are skipped. */
function sizeVariants(product) {
  return (Array.isArray(product?.variants) ? product.variants : [])
    .filter((v) => v && !v.isDeleted && String(v.size || "").trim())
    .map((v) => ({
      size: String(v.size).trim(),
      sku: String(v.sku || "").trim(),
      stock: Number(v.quantity ?? v.stock ?? 0) || 0,
      images: Array.isArray(v.images) ? v.images.filter(Boolean) : [],
    }));
}

function buildOffer({ url, price, mrp, inStock }) {
  const offer = {
    "@type": "Offer",
    url,
    priceCurrency: "INR",
    price: price.toFixed(2),
    availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    seller: { "@id": organizationId() },
    shippingDetails: offerShippingDetails(),
    hasMerchantReturnPolicy: merchantReturnPolicy(),
  };
  if (mrp != null) {
    offer.priceSpecification = [
      {
        "@type": "UnitPriceSpecification",
        price: price.toFixed(2),
        priceCurrency: "INR",
      },
      {
        "@type": "UnitPriceSpecification",
        priceType: "https://schema.org/StrikethroughPrice",
        price: mrp.toFixed(2),
        priceCurrency: "INR",
      },
    ];
  }
  return offer;
}

export function buildProductJsonLd(product) {
  if (!product) return null;
  const name = plainText(product.productName || product.name || product.product);
  if (!name) return null;

  const price = unitPrice(product);
  const mrp = listPrice(product, price);
  const canonical = absoluteUrl(productCanonicalPath(product));
  const images = productImages(product);
  const description = plainText(product.metaDescription || product.description).slice(0, 5000);
  const groupId = String(product.productId || product.slug || product._id || product.id || "").trim();
  const category = plainText(product.category?.name || product.category);
  const rating = productRating(product);
  const aggregateRating = rating
    ? {
        "@type": "AggregateRating",
        ratingValue: rating.average.toFixed(1),
        reviewCount: rating.count,
        bestRating: "5",
        worstRating: "1",
      }
    : undefined;

  const variants = sizeVariants(product);

  if (variants.length && price != null) {
    return compact({
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      name,
      url: canonical,
      image: images,
      description: description || undefined,
      category: category || undefined,
      brand: BRAND,
      productGroupID: groupId || undefined,
      variesBy: ["https://schema.org/size"],
      aggregateRating,
      hasVariant: variants.map((variant) => {
        // Each size has its own URL: the product page pre-selects ?size=.
        const url = `${canonical}?size=${encodeURIComponent(variant.size)}`;
        const variantImages = variant.images.length
          ? variant.images.map((src) =>
              String(src).startsWith("http") ? String(src) : absoluteUrl(String(src))
            )
          : images;
        return compact({
          "@type": "Product",
          name: `${name} – Size ${variant.size}`,
          url,
          image: variantImages,
          size: variant.size,
          sku: variant.sku || (groupId ? `${groupId}-${variant.size}` : undefined),
          brand: BRAND,
          offers: buildOffer({ url, price, mrp, inStock: variant.stock > 0 }),
        });
      }),
    });
  }

  const stock = Number(product.totalStock);
  const data = compact({
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    url: canonical,
    image: images,
    description: description || undefined,
    category: category || undefined,
    sku: groupId || undefined,
    brand: BRAND,
    aggregateRating,
  });
  if (price != null) {
    data.offers = buildOffer({
      url: canonical,
      price,
      mrp,
      inStock: Number.isFinite(stock) ? stock > 0 : true,
    });
  }
  return data;
}

export function productJsonLdScript(product) {
  return jsonLdScript(buildProductJsonLd(product));
}

/** Home › Category › Product */
export function productBreadcrumbJsonLd(product) {
  const name = plainText(product?.productName || product?.name || product?.product);
  if (!name) return null;
  const categoryName = plainText(product?.category?.name || product?.category);
  const crumbs = [{ name: "Home", path: "/" }];
  if (categoryName && categorySlug(categoryName)) {
    crumbs.push({ name: categoryName, path: `/category/${categorySlug(categoryName)}` });
  } else {
    crumbs.push({ name: "All products", path: "/all-products" });
  }
  crumbs.push({ name, path: productCanonicalPath(product) });
  return buildBreadcrumbJsonLd(crumbs);
}
