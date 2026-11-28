import { create } from "zustand";

export const useAdminDashboardStore = create((set) => ({
  dateFilter: { preset: "7days" },
  cacheKey: "",
  statsData: null,
  recentOrders: [],
  attentionCounts: null,
  setDateFilter: (dateFilter) => set({ dateFilter }),
  saveSnapshot: ({ cacheKey, statsData, recentOrders, attentionCounts, dateFilter }) =>
    set({
      cacheKey,
      statsData,
      recentOrders,
      attentionCounts,
      dateFilter,
    }),
}));
