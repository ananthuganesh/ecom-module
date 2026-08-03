"use client";

import { LogOut, MapPin, Settings, ShieldCheck } from "lucide-react";
import {
  AccountIcon,
  BagIcon,
  CloseIcon,
  StoreIcon,
} from "@/components/icons/storeIcons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

const SIDEBAR_LINKS = [
  { name: "Overview", href: "/account", icon: StoreIcon },
  { name: "My Orders", href: "/account/orders", icon: BagIcon },
  { name: "Saved Addresses", href: "/account/addresses", icon: MapPin },
  { name: "Account Settings", href: "/account/settings", icon: Settings },
  { name: "Security", href: "/account/security", icon: ShieldCheck },
];

function isLinkActive(pathname, href) {
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardSidebar({ isOpen, setIsOpen }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, userInfo } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const initials = (userInfo?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-[1010] bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-[1011] flex w-72 flex-col border-r border-black bg-white transition-transform duration-300 ease-out lg:relative lg:z-0 lg:translate-x-0 lg:border lg:border-black ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-2 text-gray-400 transition-colors hover:text-black lg:hidden"
          aria-label="Close menu"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="border-b border-black px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center bg-[#DF1721] text-lg font-black tracking-wide text-white">
            {initials || <AccountIcon className="h-7 w-7" />}
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
            Urban Aana
          </p>
          <h2 className="mt-2 truncate text-sm font-bold uppercase tracking-[0.12em] text-black">
            {userInfo?.name || "Member"}
          </h2>
          <p className="mt-1 truncate text-[12px] text-gray-500">{userInfo?.email}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {SIDEBAR_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 border-l-4 px-6 py-3.5 text-[12px] font-bold uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "border-[#DF1721] bg-black text-white"
                    : "border-transparent text-gray-500 hover:bg-[#F9F9F5] hover:text-black"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-[#f87171]" : ""}`} />
                <span>{link.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-black bg-[#F9F9F5] p-3">
          <Link
            href="/"
            className="flex w-full items-center gap-3 px-3 py-3 text-[12px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:text-[#DF1721]"
          >
            <StoreIcon className="h-4 w-4" />
            <span>Back to shop</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-3 text-[12px] font-bold uppercase tracking-[0.16em] text-[#DF1721] transition-colors hover:bg-white"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
