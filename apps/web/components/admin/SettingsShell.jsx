"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import {
  SettingsStore,
  SettingsUsers,
  SettingsBell,
  SettingsPolicies,
  SettingsAiAgent,
  SettingsPayment,
  SettingsEmailApi,
  SettingsSeoMarketing,
  Truck,
  Sparkles,
} from "@/components/admin/LocalIcons";

const SETTINGS_RETURN_KEY = "admin-settings-return";

export const SETTINGS_NAV = [
  { name: "General", href: "/admin/settings/general", icon: SettingsStore },
  { name: "SEO / Marketing", href: "/admin/settings/seo-marketing", icon: SettingsSeoMarketing },
  { name: "Users", href: "/admin/settings/users", icon: SettingsUsers, adminOnly: true },
  { name: "Shipping", href: "/admin/settings/shipping", icon: Truck },
  { name: "Notifications", href: "/admin/settings/notifications", icon: SettingsBell },
  { name: "Payment", href: "/admin/settings/integrations/payment", icon: SettingsPayment },
  { name: "Email API", href: "/admin/settings/integrations/email", icon: SettingsEmailApi },
  { name: "Whatsapp API", href: "/admin/settings/integrations/aisensy", icon: Sparkles },
  { name: "Ai Agent", href: "/admin/settings/ai-agent", icon: SettingsAiAgent },
  { name: "Policies", href: "/admin/settings/policies", icon: SettingsPolicies },
];

function settingsReturnPath() {
  try {
    const stored = sessionStorage.getItem(SETTINGS_RETURN_KEY) || "";
    if (stored.startsWith("/admin") && !stored.startsWith("/admin/settings")) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "/admin/dashboard";
}

export default function SettingsShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const userInfo = useAdminAuthStore((s) => s.userInfo);
  const isAdmin = Boolean(userInfo?.isAdmin);
  const nav = SETTINGS_NAV.filter((item) => !item.adminOnly || isAdmin);
  const displayName = userInfo?.name || "Admin";
  const displayEmail = userInfo?.email || "";
  const initials = displayName.charAt(0).toUpperCase();

  const close = useCallback(() => {
    router.push(settingsReturnPath());
  }, [router]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <button
        type="button"
        onClick={close}
        aria-label="Close settings"
        className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-lg text-[#303030] hover:bg-[#e3e3e3]"
      >
        <X className="size-5" strokeWidth={2} />
      </button>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-3 pr-14 md:gap-6 md:px-4 md:py-4 md:pr-14">
        <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-56 xl:w-60">
            <div className="flex items-center gap-3 px-1">
              <Avatar className="size-10 rounded-lg after:rounded-lg after:border-[#e3e3e3]">
                {userInfo?.avatar ? (
                  <AvatarImage
                    src={userInfo.avatar}
                    alt={displayName}
                    className="rounded-lg"
                  />
                ) : null}
                <AvatarFallback className="rounded-lg bg-[#e3e3e3] text-sm font-[550] text-[#303030]">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-[550] leading-5 text-[#303030]">
                  {displayName}
                </p>
                {displayEmail ? (
                  <p className="truncate text-[12px] font-[450] leading-4 text-[#616161]">
                    {displayEmail}
                  </p>
                ) : null}
              </div>
            </div>
            <Card className="w-full gap-0 overflow-visible rounded-xl py-1">
            <nav className="flex flex-col gap-[2px] p-1">
              {nav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-lg px-2 text-[0.8125rem] leading-5",
                      active
                        ? "bg-[#fafafa] font-[550] text-[#303030]"
                        : "font-[450] text-[#616161] hover:bg-[#f1f1f1] hover:text-[#303030]"
                    )}
                  >
                    {item.icon ? (
                      <item.icon
                        active={active}
                        className="size-5 shrink-0 text-[#4a4a4a]"
                        aria-hidden
                      />
                    ) : null}
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            </Card>
          </div>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
