"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Only a minimal profile is kept in localStorage. On each visit, reload the
 * full profile (email, phone, addresses) from the session cookie. A 401 clears
 * the stale local session through the shared axios interceptor.
 */
export default function CustomerSessionSync() {
  const pathname = usePathname() || "";
  const userId = useAuthStore((s) => s.userInfo?._id || null);
  const loadedFor = useRef(null);

  useEffect(() => {
    if (!userId || pathname.startsWith("/admin")) return;
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    authService
      .getProfile()
      .then((profile) => {
        if (profile?._id && useAuthStore.getState().userInfo?._id === profile._id) {
          useAuthStore.getState().setUserInfo(profile);
        }
      })
      .catch(() => {
        loadedFor.current = null;
      });
  }, [userId, pathname]);

  return null;
}
