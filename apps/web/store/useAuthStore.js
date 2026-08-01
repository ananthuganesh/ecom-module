import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTH_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";

ensureStorageKey(AUTH_STORAGE_KEY);

export const useAuthStore = create(
  persist(
    (set) => ({
      userInfo: null,
      setUserInfo: (info) => set({ userInfo: info }),
      logout: () => set({ userInfo: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
    }
  )
);
