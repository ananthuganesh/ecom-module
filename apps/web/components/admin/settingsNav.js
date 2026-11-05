import {
  SettingsStore,
  SettingsUsers,
  SettingsBell,
  SettingsPolicies,
  SettingsPayment,
  SettingsEmailApi,
  SettingsSeoMarketing,
  SettingsWhatsapp,
  Truck,
} from "@/components/admin/LocalIcons";

export const SETTINGS_RETURN_KEY = "admin-settings-return";

export const SETTINGS_NAV = [
  { name: "General", href: "/admin/settings/general", icon: SettingsStore },
  { name: "SEO / Marketing", href: "/admin/settings/seo-marketing", icon: SettingsSeoMarketing },
  { name: "Users", href: "/admin/settings/users", icon: SettingsUsers, adminOnly: true },
  { name: "Shipping", href: "/admin/settings/shipping", icon: Truck },
  { name: "Notifications", href: "/admin/settings/notifications", icon: SettingsBell },
  { name: "Payment", href: "/admin/settings/integrations/payment", icon: SettingsPayment },
  { name: "Email Marketing", href: "/admin/settings/integrations/email", icon: SettingsEmailApi },
  { name: "Whatsapp Marketing", href: "/admin/settings/integrations/aisensy", icon: SettingsWhatsapp },
  { name: "Policies", href: "/admin/settings/policies", icon: SettingsPolicies },
];

/** Settings entries this staff member can see. */
export function settingsNavFor(userInfo) {
  const isAdmin = Boolean(userInfo?.isAdmin);
  return SETTINGS_NAV.filter((item) => !item.adminOnly || isAdmin);
}

export function isSettingsItemActive(item, pathname) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Last non-settings admin page (stored by AdminShell), to leave settings to. */
export function settingsReturnPath() {
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
