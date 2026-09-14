"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { LoginForm } from "@/components/login-form";
import { Spinner } from "@/components/ui/spinner";

function AdminLoginInner() {
  const userInfo = useAdminAuthStore((state) => state.userInfo);
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const mark = () => setHydrated(true);
    if (useAdminAuthStore.persist.hasHydrated()) {
      mark();
      return;
    }
    return useAdminAuthStore.persist.onFinishHydration(mark);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const canAccessAdmin = Boolean(userInfo?.isAdmin || userInfo?.roleId);
    if (canAccessAdmin && (userInfo?.token || userInfo?.authenticated || userInfo?._id)) {
      router.replace("/admin/dashboard");
    }
  }, [hydrated, userInfo, router]);

  const canAccessAdmin = Boolean(userInfo?.isAdmin || userInfo?.roleId);
  if (!hydrated || (canAccessAdmin && (userInfo?.token || userInfo?.authenticated || userInfo?._id))) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center !bg-white">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid min-h-svh !bg-white lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm mode="admin" />
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Designed &amp; developed by{" "}
          <a
            href="https://www.bridnetwork.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Brid Network LLP
          </a>
        </p>
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

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh w-full items-center justify-center !bg-white">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}
