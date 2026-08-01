"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import AdminSidebar from "@/components/admin/Sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import "./admin.css";

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

export default function AdminLayout({ children }) {
  const userInfo = useAuthStore((s) => s.userInfo);
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);

  const isAdminLoginPage = pathname === "/admin/login";

  useEffect(() => {
    const mark = () => setHydrated(true);
    if (useAuthStore.persist.hasHydrated()) {
      mark();
      return;
    }
    return useAuthStore.persist.onFinishHydration(mark);
  }, []);

  useEffect(() => {
    if (!hydrated || isAdminLoginPage) return;
    if (!userInfo?.token || !userInfo?.isAdmin) {
      router.replace("/admin/login");
    }
  }, [hydrated, userInfo, isAdminLoginPage, router]);

  if (!hydrated) return <AdminLoading />;

  if (isAdminLoginPage) {
    return (
      <TooltipProvider>
        <div className="min-h-svh bg-background text-foreground" data-admin-shell>
          {children}
        </div>
        <Toaster position="bottom-right" theme="light" />
      </TooltipProvider>
    );
  }

  if (!userInfo?.token || !userInfo?.isAdmin) {
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
