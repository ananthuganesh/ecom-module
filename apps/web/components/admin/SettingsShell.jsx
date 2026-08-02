"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";

export const SETTINGS_NAV = [
  { name: "General", href: "/admin/settings/general" },
  { name: "Users", href: "/admin/settings/users", adminOnly: true },
  { name: "Shipping", href: "/admin/settings/shipping" },
  { name: "Notifications", href: "/admin/settings/notifications" },
  { name: "AiSensy", href: "/admin/settings/integrations/aisensy" },
];

export default function SettingsShell({ children }) {
  const pathname = usePathname();
  const isAdmin = useAdminAuthStore((s) => Boolean(s.userInfo?.isAdmin));
  const nav = SETTINGS_NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div
      className={cn(
        "relative -mx-4 -mt-4 flex flex-col md:-mx-6 md:-mt-6",
        /* Desktop: pin below header / beside admin nav; only content scrolls */
        "lg:fixed lg:inset-y-0 lg:top-(--header-height) lg:right-0 lg:left-(--sidebar-width) lg:z-20 lg:m-0 lg:flex-row lg:bg-[#f1f1f1]"
      )}
    >
      <aside
        className={cn(
          "shrink-0 border-b border-border bg-[#f1f1f1] px-6 pt-6 pb-4",
          "lg:h-full lg:w-56 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:pb-8 xl:w-60"
        )}
      >
        <h1 className="admin-page-title mb-4 text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030] lg:mb-6">
          Settings
        </h1>
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Button
                key={item.href}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                nativeButton={false}
                className={cn(
                  "h-8 shrink-0 justify-start px-3 text-[13px] font-medium",
                  !active && "text-muted-foreground"
                )}
                render={<Link href={item.href} />}
              >
                {item.name}
              </Button>
            );
          })}
        </nav>
      </aside>
      <Separator className="lg:hidden" />
      <div className="min-h-0 min-w-0 flex-1 px-6 pt-6 pb-8 lg:overflow-y-auto">
        <div className="w-full max-w-full lg:w-1/2">{children}</div>
      </div>
    </div>
  );
}
