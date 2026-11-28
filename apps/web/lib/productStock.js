/**
 * Whether a storefront product can still be bought.
 *
 * `totalStock` is denormalized on the product and can lag the ledger, so the
 * variants are the more reliable signal when a product has them. Matching the
 * logic ProductCard uses keeps a card from rendering "sold out" in one place
 * and being listed as available in another.
 */

function liveVariants(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.filter((v) => v && !v.isDeleted);
}

/** Units available across a product's variants, or null when it has none. */
export function variantStock(product) {
  const variants = liveVariants(product);
  if (!variants.length) return null;
  return variants.reduce(
    (sum, v) => sum + Number(v.quantity ?? v.stock ?? 0),
    0
  );
}

export function productStock(product) {
  const fromVariants = variantStock(product);
  if (fromVariants !== null) return fromVariants;
  return Number(product?.totalStock ?? 0);
}

export function isProductSoldOut(product) {
  if (!product) return true;
  return productStock(product) <= 0;
}

export function isProductInStock(product) {
  return !isProductSoldOut(product);
}

/** Drop sold-out products from a list, preserving order. */
export function filterInStock(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(isProductInStock);
}
