"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import AdminOrderSearch from "@/components/admin/AdminOrderSearch";
import { NavUser } from "@/components/nav-user";
import { useAuthStore } from "@/store/useAuthStore";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";

export function SiteHeader() {
  const router = useRouter();
  const userInfo = useAuthStore((s) => s.userInfo);
  const logout = useAuthStore((s) => s.logout);
  const saveBar = useProductSaveBarStore();

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex h-14 w-full shrink-0 items-center gap-2 border-b border-white/10 bg-[#0a0a0a] text-white">
      <div className="grid w-full grid-cols-[1fr_minmax(0,40rem)_1fr] items-center gap-3 px-4 lg:px-6">
        <div />
        <div className="min-w-0">
          {saveBar.active ? (
            <div className="flex h-[38px] items-center justify-between gap-3 rounded-lg bg-[#303030] px-3">
              <div className="flex min-w-0 items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-white" />
                <p className="m-0 truncate text-[13px] font-medium text-white">
                  Unsaved
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={saveBar.saving}
                  onClick={() => saveBar.onDiscard?.()}
                  className="h-7 cursor-pointer rounded-lg bg-[#1a1a1a] px-2.5 text-[12px] font-medium text-white hover:bg-[#0a0a0a] disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={saveBar.saving}
                  onClick={() => saveBar.onSave?.()}
                  className="h-7 cursor-pointer rounded-lg bg-white px-2.5 text-[12px] font-medium text-[#303030] hover:bg-[#f1f1f1] disabled:opacity-50"
                >
                  {saveBar.saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
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
