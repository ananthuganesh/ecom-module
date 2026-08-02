"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { authService } from "@/api";
import AdminSidebar from "@/components/admin/Sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";

function AdminLoading() {
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background"
      data-admin-shell
    >
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );
}

function canAccessAdmin(user) {
  return Boolean(user?.isAdmin || user?.roleId);
}

export default function AdminShell({ children }) {
  const userInfo = useAdminAuthStore((s) => s.userInfo);
  const setUserInfo = useAdminAuthStore((s) => s.setUserInfo);
  const logout = useAdminAuthStore((s) => s.logout);
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [verified, setVerified] = useState(false);

  const isAdminLoginPage = pathname === "/admin/login";

  useEffect(() => {
    const mark = () => setHydrated(true);
    if (useAdminAuthStore.persist.hasHydrated()) {
      mark();
      return;
    }
    return useAdminAuthStore.persist.onFinishHydration(mark);
  }, []);

  // Revalidate admin session against the API (localStorage is not authoritative).
  useEffect(() => {
    if (!hydrated || isAdminLoginPage) {
      setVerified(true);
      return;
    }

    let cancelled = false;
    setVerified(false);

    (async () => {
      try {
        const profile = await authService.getAdminProfile();
        if (cancelled) return;
        if (!canAccessAdmin(profile)) {
          logout();
          router.replace("/admin/login");
          return;
        }
        setUserInfo({
          _id: profile._id,
          name: profile.name,
          email: profile.email,
          isAdmin: profile.isAdmin,
          roleId: profile.roleId || null,
        });
        setVerified(true);
      } catch {
        if (cancelled) return;
        logout();
        router.replace("/admin/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, isAdminLoginPage, logout, router, setUserInfo]);

  useEffect(() => {
    if (!hydrated || isAdminLoginPage || !verified) return;
    if (!canAccessAdmin(userInfo)) {
      router.replace("/admin/login");
    }
  }, [hydrated, userInfo, isAdminLoginPage, router, verified]);

  if (!hydrated) return <AdminLoading />;

  if (isAdminLoginPage) {
    return (
      <TooltipProvider>
        <div
          className="min-h-svh !bg-white text-foreground"
          data-admin-shell
          style={{ "--background": "#ffffff" }}
        >
          {children}
        </div>
        <Toaster position="bottom-right" theme="light" />
      </TooltipProvider>
    );
  }

  if (!verified || !canAccessAdmin(userInfo)) {
    return <AdminLoading />;
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        data-admin-shell
        open
        onOpenChange={() => {}}
        className="flex-col"
        style={{
          "--sidebar-width": "15rem", /* --pg-navigation-width */
          "--header-height": "3.5rem", /* --pg-top-bar-height */
        }}
      >
        <SiteHeader />
        <div className="flex min-h-0 w-full flex-1 pt-(--header-height)">
          <Suspense fallback={<Spinner className="m-4 size-5 text-muted-foreground" />}>
            <AdminSidebar
              variant="sidebar"
              className="inset-y-auto! top-(--header-height)! bottom-0! h-[calc(100svh-var(--header-height))]!"
            />
          </Suspense>
          <SidebarInset className="min-w-0">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="@container/main flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
                  {children}
                </div>
              </div>
            </div>
            <Toaster position="bottom-right" theme="light" />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
