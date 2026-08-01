"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { adminOrderService } from "@/api";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Settings,
  TicketPercent,
  BarChart3,
  Folder,
  Truck,
} from "./LocalIcons";

/** L-shaped curved connector; tip centered with submenu text. */
function SubmenuArrow({ className = "" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={`text-black/30 ${className}`}
      aria-hidden
    >
      <path
        d="M 2 1 V 5 C 2 8 4 8 6 8 H 11"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 8 5 L 11 8 L 8 11"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Smooth expand/collapse without remounting.
 * Uses grid-template-rows so siblings slide instead of popping.
 */
function Collapse({ open, children }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        open ? "" : "pointer-events-none"
      }`}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={`transition-opacity duration-150 ease-out ${
            open ? "opacity-100 delay-75" : "opacity-0"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function parseHref(href) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  return { path, params };
}

function hrefIsActive(href, pathname, searchParams) {
  const { path, params } = parseHref(href);
  if (pathname !== path) return false;

  const keys = [...params.keys()];
  if (keys.length === 0) {
    return (
      !searchParams.get("status") &&
      !searchParams.get("scope") &&
      !searchParams.get("shippingStatus")
    );
  }

  const matches = keys.every((key) => {
    const expected = params.get(key);
    const actual = searchParams.get(key);
    return decodeURIComponent(expected || "") === decodeURIComponent(actual || "");
  });
  if (!matches) return false;

  for (const extra of ["status", "scope", "shippingStatus"]) {
    if (!params.has(extra) && searchParams.get(extra)) return false;
  }
  return true;
}

function isMenuFamilyActive(item, pathname, searchParams) {
  if (
    item.subItems?.some((sub) => {
      if (hrefIsActive(sub.href, pathname, searchParams)) return true;
      return sub.subItems?.some((nested) =>
        hrefIsActive(nested.href, pathname, searchParams)
      );
    })
  ) {
    return true;
  }

  const { path, params } = parseHref(item.href);
  const keys = [...params.keys()];
  if (keys.length === 0 && pathname.startsWith(`${path}/`)) return true;
  return hrefIsActive(item.href, pathname, searchParams);
}

const menuItems = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  {
    name: "Orders",
    href: "/admin/orders",
    icon: ShoppingBag,
    subItems: [
      { name: "Abandoned carts", href: "/admin/orders/abandoned" },
    ],
  },
  {
    name: "Shipment",
    href: "/admin/shipments",
    icon: Truck,
    subItems: [
      { name: "Awaiting", href: "/admin/shipments?shippingStatus=Awaiting%20Shipment" },
      { name: "Ready to ship", href: "/admin/shipments?shippingStatus=Ready%20To%20Ship" },
      { name: "In transit", href: "/admin/shipments?shippingStatus=In%20Transit" },
      { name: "Delivered", href: "/admin/shipments?shippingStatus=Delivered" },
      { name: "Failed", href: "/admin/shipments?shippingStatus=Shipping%20Sync%20Failed" },
    ],
  },
  {
    name: "Products",
    href: "/admin/products",
    icon: Package,
    subItems: [
      { name: "Inventory", href: "/admin/products/inventory" },
      { name: "Collections", href: "/admin/collections" },
    ],
  },
  { name: "Customers", href: "/admin/customers", icon: Users },
  { name: "Discounts", href: "/admin/discounts", icon: TicketPercent },
  {
    name: "Content",
    href: "/admin/content",
    icon: Folder,
  },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
];

const settingsItem = {
  name: "Settings",
  href: "/admin/settings/general",
  icon: Settings,
};

export default function AdminSidebar(props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedMenus, setExpandedMenus] = useState({});
  const [unfulfilledCount, setUnfulfilledCount] = useState(0);

  const isActiveHref = (href) => hrefIsActive(href, pathname, searchParams);

  const refreshOrderCounts = useCallback(async () => {
    try {
      const data = await adminOrderService.getCounts();
      setUnfulfilledCount(Number(data?.unfulfilled) || 0);
    } catch {
      /* keep last known count */
    }
  }, []);

  useEffect(() => {
    refreshOrderCounts();
    const onFocus = () => refreshOrderCounts();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(refreshOrderCounts, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refreshOrderCounts]);

  useEffect(() => {
    if (pathname.startsWith("/admin/orders")) {
      refreshOrderCounts();
    }
  }, [pathname, refreshOrderCounts]);

  useEffect(() => {
    const next = {};
    menuItems.forEach((item) => {
      if (!item.subItems?.length) return;
      if (isMenuFamilyActive(item, pathname, searchParams)) {
        next[item.name] = true;
      }
    });
    setExpandedMenus(next);
  }, [pathname, searchParams]);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const hasSubItems = item.subItems?.length > 0;
                const isActive = !hasSubItems && isActiveHref(item.href);
                const familyActive = isMenuFamilyActive(item, pathname, searchParams);
                const isExpanded = !!expandedMenus[item.name];
                const subMatchIndex = item.subItems
                  ? item.subItems.findIndex(
                      (sub) =>
                        isActiveHref(sub.href) ||
                        sub.subItems?.some((nested) => isActiveHref(nested.href)) ||
                        pathname.startsWith(`${parseHref(sub.href).path}/`)
                    )
                  : -1;
                const parentPath = parseHref(item.href).path;
                const isDetailOfParent =
                  pathname.startsWith(`${parentPath}/`) && subMatchIndex < 0;
                const parentIsSelected =
                  (isActiveHref(item.href) || isDetailOfParent) && subMatchIndex < 0;
                const activeSubIndex =
                  (isActiveHref(item.href) || isDetailOfParent) && subMatchIndex < 0
                    ? -1
                    : subMatchIndex;
                const lineHeightPx =
                  activeSubIndex < 0 ? 0 : activeSubIndex * 28 + 14;

                if (!hasSubItems) {
                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        tooltip={item.name}
                      >
                        <item.icon
                          active={isActive}
                          className="size-[18px] shrink-0"
                        />
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.name} className="space-y-0.5">
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={parentIsSelected}
                      tooltip={item.name}
                    >
                      <item.icon
                        active={familyActive}
                        className="size-[18px] shrink-0"
                      />
                      <span>{item.name}</span>
                    </SidebarMenuButton>
                    {item.name === "Orders" && unfulfilledCount > 0 ? (
                      <SidebarMenuBadge className="right-2 top-1.5 h-[1.25rem] min-w-[1.25rem] rounded-md bg-[#e3e3e3] px-1.5 text-[12px] font-[550] leading-none tabular-nums text-[#303030] peer-hover/menu-button:bg-[#d4d4d4] peer-hover/menu-button:text-[#303030] peer-data-active/menu-button:bg-[#e3e3e3] peer-data-active/menu-button:text-[#303030]">
                        {unfulfilledCount > 99 ? "99+" : unfulfilledCount}
                      </SidebarMenuBadge>
                    ) : null}

                    <Collapse open={isExpanded}>
                      <div className="relative space-y-0.5 pb-0.5">
                        {lineHeightPx > 0 && (
                          <div
                            className="pointer-events-none absolute top-0 z-10 bg-black/10"
                            style={{
                              left: "21.25px",
                              width: "1px",
                              height: `${lineHeightPx}px`,
                            }}
                          />
                        )}

                        {item.subItems.map((sub) => {
                          const isSubActive = isActiveHref(sub.href);
                          return (
                            <Link
                              key={sub.name}
                              href={sub.href}
                              data-active={isSubActive ? "true" : undefined}
                              className={`group relative flex h-7 items-center rounded-lg border-l-2 border-transparent py-0 pl-[38px] pr-3 text-[0.8125rem] transition-colors ${
                                isSubActive
                                  ? "bg-[#fafafa] font-[550] text-[#303030]"
                                  : "font-[450] text-[#616161] hover:bg-[#f1f1f1] hover:text-[#303030]"
                              }`}
                            >
                              <div
                                className={`pointer-events-none absolute top-1/2 left-[18px] z-20 flex -translate-y-1/2 items-center transition-opacity ${
                                  isSubActive
                                    ? "opacity-100"
                                    : "opacity-0 group-hover:opacity-100"
                                }`}
                              >
                                <SubmenuArrow />
                              </div>
                              <span className="truncate leading-5 tracking-normal">
                                {sub.name}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </Collapse>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href={settingsItem.href} />}
                  isActive={pathname.startsWith("/admin/settings")}
                  tooltip={settingsItem.name}
                >
                  <settingsItem.icon
                    active={pathname.startsWith("/admin/settings")}
                    className="size-[18px] shrink-0"
                  />
                  <span>{settingsItem.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
