import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WISHLIST_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";

ensureStorageKey(WISHLIST_STORAGE_KEY);

export const useWishlistStore = create(
  persist(
    (set, get) => ({
      wishlistItems: [],
      addToWishlist: (product) => {
        const items = get().wishlistItems;
        const exists = items.find((x) => x._id === product._id);
        if (!exists) {
          set({ wishlistItems: [...items, product] });
        }
      },
      removeFromWishlist: (id) => {
        set({
          wishlistItems: get().wishlistItems.filter((x) => x._id !== id),
        });
      },
      isInWishlist: (id) => {
        return get().wishlistItems.some((x) => x._id === id);
      },
      clearWishlist: () => set({ wishlistItems: [] }),
    }),
    {
      name: WISHLIST_STORAGE_KEY,
    }
  )
);
