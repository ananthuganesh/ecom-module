import { create } from "zustand";

export function abandonedListKey({ viewFilter, datePreset, q }) {
  return [viewFilter || "abandoned", datePreset || "all", q || ""].join("|");
}

export const useAdminAbandonedStore = create((set) => ({
  cacheKey: "",
  rows: [],
  page: 1,
  hasMore: false,
  viewFilter: "abandoned",
  datePreset: "all",
  searchQ: "",
  patch: (partial) => set(partial),
  saveSnapshot: (payload) => set(payload),
}));
