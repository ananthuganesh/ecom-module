"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";
import { settingsReturnPath } from "@/components/admin/settingsNav";

export { SETTINGS_NAV } from "@/components/admin/settingsNav";

/**
 * Settings pages. The settings menu and the way back live in the sidebar
 * (it slides in over the main menu); Esc also leaves settings.
 */
export default function SettingsShell({ children }) {
  const router = useRouter();

  const close = useCallback(() => {
    if (useProductSaveBarStore.getState().blockNavigation()) return;
    router.push(settingsReturnPath());
  }, [router]);

  // Esc leaves settings, unless a dialog/menu is open (it closes that instead).
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return <div className="mx-auto w-full max-w-5xl min-w-0">{children}</div>;
}
