import { Suspense } from "react";
import CustomerLoginClient from "@/components/auth/CustomerLoginClient";
import { Spinner } from "@/components/ui/spinner";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <Spinner className="size-5" />
        </div>
      }
    >
      <CustomerLoginClient />
    </Suspense>
  );
}
