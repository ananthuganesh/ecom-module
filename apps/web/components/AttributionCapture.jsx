"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttributionFromLocation } from "@/lib/attribution";

function AttributionCaptureInner() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    captureAttributionFromLocation({ pathname, search });
  }, [pathname, searchParams]);

  return null;
}

export default function AttributionCapture() {
  return (
    <Suspense fallback={null}>
      <AttributionCaptureInner />
    </Suspense>
  );
}
