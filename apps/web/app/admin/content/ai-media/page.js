"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — redirect to AI Studio */
export default function AiMediaRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/content/ai-studio");
  }, [router]);
  return null;
}
