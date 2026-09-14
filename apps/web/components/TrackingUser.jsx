"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { setTrackingUser } from "@/lib/tracking";

/** Keeps GA4 user_id in step with who is signed in to the storefront. */
export default function TrackingUser() {
  const userId = useAuthStore((s) => s.userInfo?._id || null);

  useEffect(() => {
    setTrackingUser(userId);
  }, [userId]);

  return null;
}
