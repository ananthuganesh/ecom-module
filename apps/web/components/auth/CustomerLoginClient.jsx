"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import LoginBottomSheet from "@/components/auth/LoginBottomSheet";
import { Spinner } from "@/components/ui/spinner";

function safeRedirectPath(redirectTo) {
  if (
    redirectTo &&
    typeof redirectTo === "string" &&
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//")
  ) {
    return redirectTo;
  }
  return "/";
}

/**
 * Desktop: centered card. Mobile: OTP bottom sheet instead of a full login page.
 */
export default function CustomerLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [sheetOpen, setSheetOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const finish = useCallback(
    () => {
      router.replace(safeRedirectPath(redirectTo));
    },
    [router, redirectTo]
  );

  const handleSheetClose = useCallback(() => {
    setSheetOpen(false);
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/");
  }, [router]);

  // Avoid flash: wait for breakpoint before choosing layout.
  if (isMobile === null) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-svh bg-[#F9F9F5]">
        <LoginBottomSheet
          open={sheetOpen}
          onClose={handleSheetClose}
          onSuccess={finish}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm mode="customer" />
      </div>
    </div>
  );
}
