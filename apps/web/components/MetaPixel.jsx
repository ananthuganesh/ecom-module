"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackingService } from "@/api";
import { setMetaServerMirror } from "@/lib/metaPixel";

const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";

// At import, not in an effect: a product page's ViewContent can fire first.
setMetaServerMirror(trackingService.metaEvent);

function isAdminPath(pathname) {
  return String(pathname || "").startsWith("/admin");
}

function loadFbevents() {
  if (document.querySelector(`script[src="${FBEVENTS_SRC}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = FBEVENTS_SRC;
  document.head.appendChild(script);
}

/**
 * Loads the Meta Pixel queued by the inline bootstrap in app/layout.js, and
 * tracks a PageView on every client-side navigation. Idle-deferred like GTM;
 * events fired before it loads wait in the fbq queue.
 */
export default function MetaPixel({ pixelId }) {
  const pathname = usePathname();
  const lastPath = useRef(null);

  useEffect(() => {
    if (!pixelId || isAdminPath(pathname) || !window.__uaMetaPixelId) return;

    let idleId;
    let timeoutId;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(loadFbevents, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(loadFbevents, 1000);
    }
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [pixelId, pathname]);

  useEffect(() => {
    if (!pixelId || isAdminPath(pathname) || typeof window.fbq !== "function") return;
    // The bootstrap already sent the first page's PageView.
    if (lastPath.current !== null && lastPath.current !== pathname) {
      window.fbq("track", "PageView");
    }
    lastPath.current = pathname;
  }, [pixelId, pathname]);

  return null;
}
