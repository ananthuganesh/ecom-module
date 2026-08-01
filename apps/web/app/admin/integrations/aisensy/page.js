"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AisensyIntegrationsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings/integrations/aisensy");
  }, [router]);
  return null;
}
