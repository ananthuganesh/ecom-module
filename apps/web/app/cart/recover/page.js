"use client";

import { Loader2 } from "lucide-react";
import { BagIcon } from "@/components/icons/storeIcons";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { abandonedCheckoutService } from "@/api";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { persistAuth } from "@/lib/persistAuth";
import { userErrorMessage } from "@/lib/userMessage";

const TOKEN_STORAGE_KEY = "cart_recover_token";

/** Pull recovery token from href, including double-encoded `token%3D…`. */
function extractRecoverToken(href) {
  const raw = String(href || "");
  const match = raw.match(/[?&]token(?:=|%3D)([^&?#]+)/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return String(match[1]).trim();
    }
  }
  return "";
}

function readStoredToken() {
  try {
    return (sessionStorage.getItem(TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function storeToken(token) {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

function clearStoredToken() {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function RecoverShell({ children }) {
  return (
    <main className="min-h-screen bg-[#F9F9F5] flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-md text-center">{children}</div>
    </main>
  );
}

function RecoverContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rehydrateFromRecovery = useCartStore((s) => s.rehydrateFromRecovery);
  const setUserInfo = useAuthStore((s) => s.setUserInfo);
  const tokenParam = (searchParams.get("token") || "").trim();

  // Always identical on server + first client paint to avoid hydration mismatch.
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    const token =
      tokenParam ||
      extractRecoverToken(window.location.href) ||
      readStoredToken();

    if (!token) {
      setStatus("missing");
      return;
    }

    storeToken(token);
    let cancelled = false;
    let redirectTimer = null;

    (async () => {
      try {
        const data = await abandonedCheckoutService.recover(token);
        if (cancelled) return;

        clearStoredToken();

        rehydrateFromRecovery({
          items: data.items || [],
          shippingAddress: data.shippingAddress || {},
        });

        if (data.session) {
          setUserInfo(data.session);
          persistAuth(data.session);
        }

        const count = (data.items || []).reduce(
          (n, i) => n + (Number(i.qty) || 1),
          0
        );
        setItemCount(count);
        setStatus("ok");

        redirectTimer = setTimeout(() => {
          if (!cancelled) router.replace(count > 0 ? "/checkout" : "/cart");
        }, 900);
      } catch (err) {
        if (cancelled) return;
        clearStoredToken();
        setStatus("error");
        setError(
          userErrorMessage(
            err,
            "This recovery link is invalid or has expired."
          )
        );
      }
    })();

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
     
  }, [tokenParam]);

  if (status === "loading") {
    return (
      <RecoverShell>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-black" />
        <p className="mt-4 text-sm font-medium text-gray-600">Restoring your bag…</p>
      </RecoverShell>
    );
  }

  if (status === "ok") {
    return (
      <RecoverShell>
        <BagIcon className="mx-auto h-10 w-10 text-black" />
        <h1 className="mt-4 font-vina text-3xl uppercase tracking-tight">Bag restored</h1>
        <p className="mt-2 text-sm text-gray-600">
          {itemCount} {itemCount === 1 ? "item" : "items"} ready — continuing to checkout…
        </p>
      </RecoverShell>
    );
  }

  return (
    <RecoverShell>
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
    </RecoverShell>
  );
}

export default function CartRecoverPage() {
  return (
    <Suspense
      fallback={
        <RecoverShell>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-black" />
          <p className="mt-4 text-sm font-medium text-gray-600">Restoring your bag…</p>
        </RecoverShell>
      }
    >
      <RecoverContent />
    </Suspense>
  );
}
