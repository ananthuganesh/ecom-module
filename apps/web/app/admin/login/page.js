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
    if (userInfo?.token && userInfo?.isAdmin) {
      router.replace("/admin/dashboard");
    }
  }, [hydrated, userInfo, router]);

  if (!hydrated || (userInfo?.token && userInfo?.isAdmin)) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
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
        <div className="flex min-h-svh w-full items-center justify-center">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}
