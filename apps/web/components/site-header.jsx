"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminOrderSearch from "@/components/admin/AdminOrderSearch";
import AdminSaveBar from "@/components/admin/AdminSaveBar";
import { NavUser } from "@/components/nav-user";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";

/**
 * Admin top bar. Pages with the sidebar only use it below md (the sidebar
 * carries the logo, search and account there); settings pages always use it.
 */
export function SiteHeader({ className = "" }) {
  const router = useRouter();
  const userInfo = useAdminAuthStore((s) => s.userInfo);
  const logout = useAdminAuthStore((s) => s.logout);
  const saveBarActive = useProductSaveBarStore((s) => s.active);

  const handleLogout = () => {
    if (useProductSaveBarStore.getState().blockNavigation()) return;
    logout();
    router.push("/admin/login");
  };

  return (
    <header
      className={`relative z-50 flex h-14 w-full shrink-0 items-center gap-2 bg-[#0a0a0a] text-white ${className}`}
    >
      <div className="grid w-full grid-cols-[1fr_minmax(0,40rem)_1fr] items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="inline-flex shrink-0 items-center"
            aria-label="Urban Aana Admin"
          >
            <Image
              src="/urban/logo-dark.png"
              alt="Urban Aana"
              width={110}
              height={32}
              priority
              className="h-7 w-auto object-contain"
            />
          </Link>
        </div>
        <div className="min-w-0">
          {saveBarActive ? (
            <AdminSaveBar />
          ) : (
            <AdminOrderSearch />
          )}
        </div>
        <div className="flex items-center justify-end">
          <NavUser
            user={{
              name: userInfo?.name || "Admin",
              email: userInfo?.email || "admin@urbanaana.com",
              avatar: "",
            }}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </header>
  );
}
