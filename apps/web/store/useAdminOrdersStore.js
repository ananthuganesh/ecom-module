import { create } from "zustand";

export function ordersListKey({ viewFilter, hideArchived, dateFilter, q }) {
  const preset = dateFilter?.preset || "all";
  const from = dateFilter?.from || "";
  const to = dateFilter?.to || "";
  return [viewFilter || "all", hideArchived ? "1" : "0", preset, from, to, q || ""].join("|");
}

export const useAdminOrdersStore = create((set) => ({
  cacheKey: "",
  orders: [],
  page: 1,
  hasMore: false,
  dateFilter: { preset: "all" },
  viewFilter: "all",
  hideArchived: false,
  sortBy: "date",
  searchQ: "",
  patch: (partial) => set(partial),
  saveSnapshot: (payload) => set(payload),
}));
