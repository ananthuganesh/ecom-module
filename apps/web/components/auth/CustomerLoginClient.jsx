"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import CustomerOtpForm from "@/components/auth/CustomerOtpForm";
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
 * Desktop: shadcn login-02 layout (form left, cover image right).
 * Mobile: OTP bottom sheet instead of a full login page.
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
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-xs flex-col gap-1">
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-bold">Login to your account</h1>
            </div>
            <CustomerOtpForm
              idPrefix="login-otp"
              className="text-center [&_form]:text-left"
              inputClassName="h-9"
              buttonClassName="h-9"
              onSuccess={finish}
            />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src="/banner/hero-image-01.webp"
          alt="Urban Aana streetwear"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
