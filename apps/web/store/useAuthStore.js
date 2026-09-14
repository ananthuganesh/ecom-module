import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTH_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";
import { persistableCustomer, stripAuthToken } from "@/lib/persistAuth";
import client from "@/api/axios/client";

ensureStorageKey(AUTH_STORAGE_KEY);

/** Storefront / customer session only. */
export const useAuthStore = create(
  persist(
    (set) => ({
      userInfo: null,
      setUserInfo: (info) => set({ userInfo: info ? stripAuthToken(info) : null }),
      logout: () => {
        client.post("users/logout").catch(() => {});
        set({ userInfo: null });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({ userInfo: persistableCustomer(state.userInfo) }),
    }
  )
);
