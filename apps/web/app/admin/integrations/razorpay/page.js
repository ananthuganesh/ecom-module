"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RazorpayRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings/integrations/razorpay");
  }, [router]);
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );
}
