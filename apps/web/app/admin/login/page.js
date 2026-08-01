"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { LoginForm } from "@/components/login-form";
import { Spinner } from "@/components/ui/spinner";

function AdminLoginInner() {
  const userInfo = useAuthStore((state) => state.userInfo);
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const mark = () => setHydrated(true);
    if (useAuthStore.persist.hasHydrated()) {
      mark();
      return;
    }
    return useAuthStore.persist.onFinishHydration(mark);
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
    <div className="flex min-h-svh w-full items-center justify-center !bg-white p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm mode="admin" />
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
