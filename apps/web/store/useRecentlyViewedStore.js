import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  RECENTLY_VIEWED_STORAGE_KEY,
  ensureStorageKey,
} from "@/lib/storageKeys";

ensureStorageKey(RECENTLY_VIEWED_STORAGE_KEY);

export const useRecentlyViewedStore = create(
  persist(
    (set, get) => ({
      recentlyViewed: [],
      addProduct: (product) => {
        const current = get().recentlyViewed;
        const filtered = current.filter((p) => p._id !== product._id);
        const essentialInfo = {
          _id: product._id,
          name: product.name || product.productName,
          productName: product.productName || product.name,
          price: product.price,
          image:
            product.image ||
            product.thumbnails?.[0] ||
            product.variants?.[0]?.images?.[0],
          slug: product.slug,
        };
        const updated = [essentialInfo, ...filtered].slice(0, 10);
        set({ recentlyViewed: updated });
      },
      clearRecentlyViewed: () => set({ recentlyViewed: [] }),
    }),
    {
      name: RECENTLY_VIEWED_STORAGE_KEY,
    }
  )
);
