import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTH_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";
import { stripAuthToken } from "@/lib/persistAuth";
import client from "@/api/axios/client";

ensureStorageKey(AUTH_STORAGE_KEY);

export const useAuthStore = create(
  persist(
    (set) => ({
      userInfo: null,
      setUserInfo: (info) => set({ userInfo: info ? stripAuthToken(info) : null }),
      logout: () => {
        // Best-effort cookie clear; local profile cleared regardless.
        client.post("users/logout").catch(() => {});
        set({ userInfo: null });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
    }
  )
);
