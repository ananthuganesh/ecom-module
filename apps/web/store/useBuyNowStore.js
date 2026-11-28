import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { BUY_NOW_STORAGE_KEY } from "@/lib/storageKeys";
import { pricingForCartLine, stockForCartLine } from "@/utils/cartStock";

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function normalizeBuyNowItem(item) {
  const maxQty = 5;
  const stock = stockForCartLine(item, item);

  const price = Number(item.price ?? item.pricing?.sellingPrice ?? 0);
  const mrp = Number(item.mrp ?? item.pricing?.mrp ?? 0);
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
    mrp: mrp > 0 ? mrp : undefined,
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
              const stock = stockForCartLine(product, item);
              const pricing = pricingForCartLine(product, item);
              return {
                ...item,
                ...pricing,
                countInStock: stock,
                totalStock: stock,
                qty: Math.min(item.qty, stock === 0 ? item.qty : stock),
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
