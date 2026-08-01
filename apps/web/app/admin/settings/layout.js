"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const SETTINGS_NAV = [
  { name: "General", href: "/admin/settings/general" },
  { name: "Warehouses", href: "/admin/settings/warehouses" },
  { name: "Users", href: "/admin/settings/users" },
  { name: "Shipping and delivery", href: "/admin/settings/shipping" },
  { name: "Taxes and duties", href: "/admin/settings/taxes" },
  { name: "Notifications", href: "/admin/settings/notifications" },
  { name: "Roles", href: "/admin/settings/roles" },
  { name: "Audit logs", href: "/admin/settings/audit-logs" },
  { name: "AiSensy", href: "/admin/settings/integrations/aisensy" },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="relative -mx-6 -mt-6 h-full min-h-full md:-mx-8 md:-mt-8">
      <div className="flex h-full min-h-full flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-border px-6 pt-6 pb-4 lg:w-56 lg:border-r lg:border-b-0 xl:w-60 lg:px-6 lg:pb-8">
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030] mb-4 lg:mb-6">Settings</h1>
          <ScrollArea className="lg:h-[calc(100vh-10rem)]">
            <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {SETTINGS_NAV.map((item) => {
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
          </ScrollArea>
        </aside>
        <Separator className="lg:hidden" />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pt-6 pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}
