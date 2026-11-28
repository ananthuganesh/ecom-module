import { create } from "zustand";
import { persist } from "zustand/middleware";
import { trackAddToWishlist } from "@/lib/tracking";
import { WISHLIST_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";

ensureStorageKey(WISHLIST_STORAGE_KEY);

function productKey(product) {
  return String(product?._id || product?.id || "").trim();
}

function snapshotProduct(product) {
  const id = productKey(product);
  return {
    _id: id,
    id,
    productUrlId: product.productUrlId || null,
    slug: product.slug || "",
    productName: product.productName || product.name || product.product || "",
    name: product.name || product.productName || "",
    type: product.type || product.productType || "",
    category: product.category || "",
    badge: product.badge || "",
    pricing: product.pricing
      ? {
          sellingPrice: Number(product.pricing.sellingPrice ?? 0),
          mrp: Number(product.pricing.mrp ?? 0),
        }
      : { sellingPrice: Number(product.price ?? 0), mrp: 0 },
    thumbnails: Array.isArray(product.thumbnails) ? product.thumbnails.slice(0, 4) : [],
    images: Array.isArray(product.images) ? product.images.slice(0, 2) : [],
    variants: Array.isArray(product.variants)
      ? product.variants.map((v) => ({
          size: v.size || "",
          color: v.color || "",
          quantity: Number(v.quantity ?? v.stock ?? 0),
          stock: Number(v.stock ?? v.quantity ?? 0),
          images: Array.isArray(v.images) ? v.images.slice(0, 2) : [],
          isDeleted: Boolean(v.isDeleted),
          sku: v.sku || "",
        }))
      : [],
    totalStock: product.totalStock ?? null,
    createdAt: product.createdAt || product.created_at || null,
  };
}

export const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],

      has: (productOrId) => {
        const id =
          typeof productOrId === "string" || typeof productOrId === "number"
            ? String(productOrId)
            : productKey(productOrId);
        if (!id) return false;
        return get().items.some((item) => productKey(item) === id);
      },

      toggle: (product) => {
        const id = productKey(product);
        if (!id) return false;
        const exists = get().items.some((item) => productKey(item) === id);
        if (exists) {
          set({
            items: get().items.filter((item) => productKey(item) !== id),
          });
          return false;
        }
        const snap = snapshotProduct(product);
        set({ items: [snap, ...get().items.filter((item) => productKey(item) !== id)] });
        trackAddToWishlist(snap);
        return true;
      },

      remove: (productOrId) => {
        const id =
          typeof productOrId === "string" || typeof productOrId === "number"
            ? String(productOrId)
            : productKey(productOrId);
        if (!id) return;
        set({
          items: get().items.filter((item) => productKey(item) !== id),
        });
      },

      clear: () => set({ items: [] }),
    }),
    {
      name: WISHLIST_STORAGE_KEY,
      partialize: (state) => ({ items: state.items }),
    }
  )
);
