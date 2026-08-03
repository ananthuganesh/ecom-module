import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { BUY_NOW_STORAGE_KEY } from "@/lib/storageKeys";

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function normalizeBuyNowItem(item) {
  const maxQty = 5;
  let stock = item.totalStock ?? item.countInStock ?? 0;
  if (item.size && item.variants) {
    const variant = item.variants.find(
      (v) => String(v.size || "").trim() === String(item.size || "").trim()
    );
    if (variant) stock = variant.quantity ?? variant.stock ?? stock;
  }

  const price = Number(item.price ?? item.pricing?.sellingPrice ?? 0);
  const name = item.productName ?? item.name ?? "";
  const image =
    item.image ??
    item.thumbnails?.[0] ??
    item.variants?.[0]?.images?.[0] ??
    item.images?.[0];
  const qty = Math.min(Math.max(1, Number(item.qty) || 1), maxQty, Math.max(1, stock || 1));

  return {
    _id: item._id,
    slug: item.slug,
    productName: name,
    name,
    price,
    image,
    qty: stock > 0 ? Math.min(qty, stock) : qty,
    size: item.size || "",
    color: item.color || "",
    countInStock: stock,
    totalStock: stock,
  };
}

export const useBuyNowStore = create(
  persist(
    (set, get) => ({
      items: [],

      setBuyNowItem: (item) => {
        const normalized = normalizeBuyNowItem(item);
        if ((normalized.countInStock ?? 0) <= 0) {
          alert(`Sorry, ${normalized.name || "this product"} is currently out of stock.`);
          return false;
        }
        set({ items: [normalized] });
        return true;
      },

      clearBuyNow: () => set({ items: [] }),

      syncStock: async (productService) => {
        const { items } = get();
        if (!items.length) return;
        const updated = await Promise.all(
          items.map(async (item) => {
            try {
              const product = await productService.getById(item._id);
              let stock = product.totalStock || 0;
              if (item.size && product.variants) {
                const variant = product.variants.find(
                  (v) => String(v.size || "").trim() === String(item.size || "").trim()
                );
                if (variant) stock = variant.quantity ?? variant.stock ?? stock;
              }
              return {
                ...item,
                countInStock: stock,
                totalStock: stock,
                qty: Math.min(item.qty, stock === 0 ? 1 : stock),
              };
            } catch {
              return item;
            }
          })
        );
        set({ items: updated });
      },
    }),
    {
      name: BUY_NOW_STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? sessionStorage : memoryStorage
      ),
      partialize: (state) => ({ items: state.items }),
    }
  )
);
