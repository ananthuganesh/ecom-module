/**
 * Schema.org Product JSON-LD for storefront PDPs.
 * Strips `<` so description cannot break out of the script tag.
 */
import { absoluteUrl, productCanonicalPath, productOgImage } from "./siteUrl.js";

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

export function buildProductJsonLd(product) {
  if (!product) return null;
  const name = plainText(product.productName || product.name || product.product);
  if (!name) return null;

  const price = unitPrice(product);
  const stock = Number(product.totalStock);
  const inStock = Number.isFinite(stock) ? stock > 0 : true;
  const canonical = absoluteUrl(productCanonicalPath(product));
  const image = productOgImage(product);
  const description = plainText(product.metaDescription || product.description).slice(0, 5000);

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    url: canonical,
    image: image ? [image] : undefined,
    description: description || undefined,
    sku: String(product.productId || product.slug || product._id || product.id || "").trim() || undefined,
    brand: {
      "@type": "Brand",
      name: "Urban Aana",
    },
  };

  if (price != null) {
    data.offers = {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "INR",
      price: price.toFixed(2),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: "Urban Aana",
      },
    };
  }

  return data;
}

export function productJsonLdScript(product) {
  const data = buildProductJsonLd(product);
  if (!data) return "";
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
