import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { Spinner } from "@/components/ui/spinner";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <div className="flex min-h-40 items-center justify-center">
              <Spinner className="size-5" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
