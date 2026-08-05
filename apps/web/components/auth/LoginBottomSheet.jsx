"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/icons/storeIcons";
import BrandLogo from "@/components/BrandLogo";
import CustomerOtpForm from "@/components/auth/CustomerOtpForm";

/**
 * Mobile OTP sign-in bottom sheet (storefront style).
 * Closes only via the X button — not backdrop / Escape.
 */
export default function LoginBottomSheet({ open, onClose, onSuccess, title = "Sign in" }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "unset";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[170] bg-black/50 backdrop-blur-sm md:hidden"
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-x-0 bottom-0 z-[180] flex max-h-[min(92dvh,640px)] flex-col rounded-t-2xl border border-gray-200 bg-white shadow-2xl md:hidden"
          >
            <div className="flex shrink-0 flex-col items-center px-5 pt-3 pb-2">
              <div className="mb-3 h-1 w-10 rounded-full bg-gray-300" aria-hidden="true" />
              <div className="flex w-full items-center justify-between gap-3">
                <BrandLogo href={null} height={28} priority className="shrink-0" />
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 transition-colors hover:bg-gray-100"
                  aria-label="Close sign in"
                >
                  <CloseIcon size={20} className="text-gray-600" />
                </button>
              </div>
              <h2 className="mt-3 w-full text-left text-lg font-semibold tracking-tight text-gray-900">
                {title}
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <CustomerOtpForm
                idPrefix="sheet-otp"
                onSuccess={(data) => {
                  onSuccess?.(data);
                }}
              />
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
