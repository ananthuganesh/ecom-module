"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

/** Canonical Whatsapp API settings live under Settings → Whatsapp API. */
export default function AiSensyRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/settings/integrations/aisensy");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );
}
