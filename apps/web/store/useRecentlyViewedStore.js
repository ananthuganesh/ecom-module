import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  RECENTLY_VIEWED_STORAGE_KEY,
  ensureStorageKey,
} from "@/lib/storageKeys";

ensureStorageKey(RECENTLY_VIEWED_STORAGE_KEY);

function firstImage(product) {
  const candidates = [
    product?.image,
    ...(Array.isArray(product?.thumbnails) ? product.thumbnails : []),
    ...(Array.isArray(product?.images) ? product.images : []),
    ...(Array.isArray(product?.variants)
      ? product.variants.flatMap((variant) =>
          Array.isArray(variant?.images) ? variant.images : []
        )
      : []),
  ];
  return candidates.map((url) => String(url || "").trim()).find(Boolean) || "";
}

/** Lightweight history entry — UI rehydrates full product from API. */
function toHistoryEntry(product) {
  if (!product?._id) return null;
  const image = firstImage(product);
  return {
    _id: product._id,
    slug: product.slug || "",
    productName: product.productName || product.name || "Product",
    name: product.name || product.productName || "Product",
    image,
  };
}

export const useRecentlyViewedStore = create(
  persist(
    (set, get) => ({
      recentlyViewed: [],
      addProduct: (product) => {
        const entry = toHistoryEntry(product);
        if (!entry) return;
        const current = get().recentlyViewed;
        const filtered = current.filter(
          (item) => String(item._id) !== String(entry._id)
        );
        set({ recentlyViewed: [entry, ...filtered].slice(0, 8) });
      },
      clearRecentlyViewed: () => set({ recentlyViewed: [] }),
    }),
    {
      name: RECENTLY_VIEWED_STORAGE_KEY,
      version: 2,
      migrate: () => ({ recentlyViewed: [] }),
    }
  )
);
