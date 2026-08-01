"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function isAdminPath(pathname) {
  return String(pathname || "").startsWith("/admin");
}

/**
 * Storefront GTM on all public pages including /checkout and /checkout/success.
 * Skips /admin only. Needed so begin_checkout / add_payment_info / purchase tags fire
 * even on direct land or hard refresh.
 */
export default function GtmClient({ gtmId }) {
  const pathname = usePathname();

  useEffect(() => {
    if (isAdminPath(pathname)) return;

    const id = String(gtmId || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");
    if (!id.startsWith("GTM-")) return;
    if (typeof window === "undefined") return;
    if (document.querySelector(`script[data-gtm="${id}"]`)) return;
    if (
      document.getElementById("gtm-base") ||
      document.querySelector(`script[src*="gtm.js?id=${id}"]`)
    ) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
    script.dataset.gtm = id;
    document.head.insertBefore(script, document.head.firstChild);
  }, [gtmId, pathname]);

  return null;
}
