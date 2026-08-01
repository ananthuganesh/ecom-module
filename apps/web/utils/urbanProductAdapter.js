export function adaptProductForCard(product) {
  return {
    id: product._id,
    title: product.productName || product.name || "Product",
    price: Number(product.pricing?.sellingPrice ?? product.price ?? 0),
    compareAt:
      product.pricing?.mrp != null &&
      Number(product.pricing.mrp) > Number(product.pricing?.sellingPrice ?? product.price ?? 0)
        ? Number(product.pricing.mrp)
        : null,
    image: product.thumbnails?.[0] || product.variants?.[0]?.images?.[0] || product.images?.[0] || "",
    href: `/product/${product.slug || product._id}`,
    product,
  };
}
