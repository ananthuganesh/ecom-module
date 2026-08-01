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
  const token = (searchParams.get("token") || "").trim();
  const rehydrateFromRecovery = useCartStore((s) => s.rehydrateFromRecovery);
  const setUserInfo = useAuthStore((s) => s.setUserInfo);

  const [status, setStatus] = useState(token ? "loading" : "missing");
  const [error, setError] = useState("");
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await abandonedCheckoutService.recover(token);
        if (cancelled) return;

        rehydrateFromRecovery({
          items: data.items || [],
          shippingAddress: data.shippingAddress || {},
        });

        if (data.session?.token) {
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
  }, [token, rehydrateFromRecovery, setUserInfo, router]);

  return (
    <main className="min-h-screen bg-[#F9F9F5] flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-md border-2 border-black bg-white p-8 shadow-[8px_8px_0_#DF1721] text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
            <p className="mt-4 text-sm text-gray-600">Restoring your bag…</p>
          </>
        )}

        {status === "ok" && (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <BagIcon className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="mt-4 font-vina text-2xl uppercase tracking-tight">
              Bag restored
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {itemCount} item{itemCount === 1 ? "" : "s"} ready — taking you to
              checkout…
            </p>
          </>
        )}

        {(status === "missing" || status === "error") && (
          <>
            <h1 className="font-vina text-2xl uppercase tracking-tight">
              Link unavailable
            </h1>
            <p className="mt-3 text-sm text-gray-600">
              {error ||
                "This recovery link is missing or no longer valid. Your bag may have been completed or the link expired."}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/all-products"
                className="bg-black py-3 text-[12px] font-bold uppercase tracking-[0.2em] text-white hover:bg-[#DF1721]"
              >
                Continue shopping
              </Link>
              <Link
                href="/cart"
                className="text-[12px] font-bold uppercase tracking-[0.2em] text-gray-500 hover:text-[#DF1721]"
              >
                View bag
              </Link>
            </div>
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
        <main className="min-h-screen bg-[#F9F9F5] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </main>
      }
    >
      <RecoverContent />
    </Suspense>
  );
}
