"use client";

import { Loader2 } from "lucide-react";
import {
  BagIcon
} from "@/components/icons/storeIcons";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { abandonedCheckoutService } from "@/api";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { persistAuth } from "@/lib/persistAuth";

function RecoverContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenFromQuery = (searchParams.get("token") || "").trim();
  const rehydrateFromRecovery = useCartStore((s) => s.rehydrateFromRecovery);
  const setUserInfo = useAuthStore((s) => s.setUserInfo);

  const [status, setStatus] = useState(tokenFromQuery ? "loading" : "missing");
  const [error, setError] = useState("");
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    if (!tokenFromQuery) return;

    // Drop token from the address bar before network work to limit Referer leakage.
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/cart/recover");
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await abandonedCheckoutService.recover(tokenFromQuery);
        if (cancelled) return;

        rehydrateFromRecovery({
          items: data.items || [],
          shippingAddress: data.shippingAddress || {},
        });

        if (data.session) {
          setUserInfo(data.session);
          persistAuth(data.session);
        } else if (data.knownUser?.hasPassword && data.knownUser?.email) {
          // Cart restored; password accounts must log in at checkout
          sessionStorage.setItem(
            "recover_login_email",
            String(data.knownUser.email)
          );
        }

        const count = (data.items || []).reduce(
          (n, i) => n + (Number(i.qty) || 1),
          0
        );
        setItemCount(count);
        setStatus("ok");

        // Brief confirmation then continue shopping flow
        setTimeout(() => {
          if (!cancelled) router.replace(count > 0 ? "/checkout" : "/cart");
        }, 900);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(
          err.response?.data?.detail ||
            err.response?.data?.message ||
            "This recovery link is invalid or has expired."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenFromQuery, rehydrateFromRecovery, setUserInfo, router]);

  return (
    <main className="min-h-screen bg-[#F9F9F5] flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-md text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-black" />
            <p className="mt-4 text-sm font-medium text-gray-600">Restoring your bag…</p>
          </>
        )}
        {status === "ok" && (
          <>
            <BagIcon className="mx-auto h-10 w-10 text-black" />
            <h1 className="mt-4 font-vina text-3xl uppercase tracking-tight">Bag restored</h1>
            <p className="mt-2 text-sm text-gray-600">
              {itemCount} {itemCount === 1 ? "item" : "items"} ready — continuing to checkout…
            </p>
          </>
        )}
        {(status === "missing" || status === "error") && (
          <>
            <h1 className="font-vina text-3xl uppercase tracking-tight">Link unavailable</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              {error ||
                "This recovery link is missing or no longer valid. Your bag may have been completed or the link expired."}
            </p>
            <Link
              href="/all-products"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-black px-6 text-xs font-extrabold uppercase tracking-widest text-white"
            >
              Continue shopping
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function CartRecoverPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#F9F9F5]">
          <Loader2 className="h-8 w-8 animate-spin text-black" />
        </main>
      }
    >
      <RecoverContent />
    </Suspense>
  );
}
