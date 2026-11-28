import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ADMIN_AUTH_STORAGE_KEY } from "@/lib/storageKeys";
import { stripAuthToken } from "@/lib/persistAuth";
import client from "@/api/axios/client";

/** Admin panel session only — separate from storefront auth. */
export const useAdminAuthStore = create(
  persist(
    (set) => ({
      userInfo: null,
      setUserInfo: (info) => set({ userInfo: info ? stripAuthToken(info) : null }),
      logout: () => {
        client.post("users/admin/logout").catch(() => {});
        set({ userInfo: null });
      },
    }),
    {
      name: ADMIN_AUTH_STORAGE_KEY,
    }
  )
);
