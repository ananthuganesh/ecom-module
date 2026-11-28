/** Resolve sellable stock for a cart/checkout line against a product doc. */

export function stockForCartLine(productOrItem, line = null) {
  const product = productOrItem || {};
  const item = line || product;
  const variants = product.variants || item.variants || [];
  const size = String(item.size || "").trim();
  const color = String(item.color || "").trim();

  if (variants.length && (size || color)) {
    let hit = null;
    if (size && color) {
      hit = variants.find(
        (v) =>
          String(v.size || "").trim() === size &&
          String(v.color || "").trim() === color
      );
    }
    if (!hit && size) {
      hit = variants.find((v) => String(v.size || "").trim() === size);
    }
    if (!hit && color) {
      hit = variants.find((v) => String(v.color || "").trim() === color);
    }
    if (hit) {
      return Math.max(0, Number(hit.quantity ?? hit.stock ?? 0) || 0);
    }
  }

  return Math.max(
    0,
    Number(
      product.totalStock ?? item.totalStock ?? item.countInStock ?? 0
    ) || 0
  );
}

/** Live selling price + MRP from product (used when refreshing cart/checkout). */
export function pricingForCartLine(product, line = null) {
  const item = line || {};
  const price = Number(
    product?.pricing?.sellingPrice ?? product?.price ?? item.price ?? 0
  );
  const mrp = Number(product?.pricing?.mrp ?? product?.mrp ?? item.mrp ?? 0);
  const name =
    product?.productName ||
    product?.name ||
    item.productName ||
    item.name ||
    "";
  const image =
    item.image ||
    product?.thumbnails?.[0] ||
    product?.variants?.[0]?.images?.[0] ||
    product?.images?.[0] ||
    "";
  return {
    price: Number.isFinite(price) ? price : 0,
    mrp: mrp > 0 ? mrp : undefined,
    name,
    productName: name,
    image: image || item.image,
  };
}

export function isCartLineUnavailable(item) {
  const stock = Number(item?.countInStock ?? 0);
  const qty = Number(item?.qty || 1);
  return stock <= 0 || stock < qty;
}

/** Available items first; out-of-stock lines last. */
export function sortCartByAvailability(items = []) {
  return [...items].sort((a, b) => {
    const aOut = isCartLineUnavailable(a) ? 1 : 0;
    const bOut = isCartLineUnavailable(b) ? 1 : 0;
    return aOut - bOut;
  });
}
