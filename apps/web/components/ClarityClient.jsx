"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Clarity project ids are short lowercase alphanumerics (e.g. "zkbn2bvhgc"). */
export function normalizeClarityId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[a-z0-9]{6,20}$/.test(id) ? id : "";
}

function injectClarity(id) {
  if (window.clarity && document.querySelector(`script[data-clarity="${id}"]`)) return;
  // Microsoft's snippet: queue calls until the tag loads.
  window.clarity =
    window.clarity ||
    function clarity() {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${id}`;
  script.dataset.clarity = id;
  document.head.appendChild(script);
}

/**
 * Microsoft Clarity (heatmaps / session recordings) on storefront pages only —
 * never /admin, where staff see customer data. Idle-deferred like GTM.
 */
export default function ClarityClient({ projectId }) {
  const pathname = usePathname();

  useEffect(() => {
    if (String(pathname || "").startsWith("/admin")) return undefined;
    const id = normalizeClarityId(projectId);
    if (!id) return undefined;

    let idleId;
    let timeoutId;
    const run = () => injectClarity(id);
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: 3000 });
    } else {
      timeoutId = window.setTimeout(run, 2500);
    }
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [projectId, pathname]);

  return null;
}
