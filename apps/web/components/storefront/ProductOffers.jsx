"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "@/components/icons";
import { CheckIcon } from "@/components/icons/storeIcons";
import { couponService } from "@/api";
import { offerLines } from "@/lib/couponOffers";
import { rememberCopiedCoupon } from "@/lib/copiedCoupon";

function CopyGlyph({ className }) {
  return <Copy className={className} />;
}

/**
 * "Active offers" on the product page: featured codes (tap to copy) and featured
 * automatic discounts (applied at checkout, nothing to copy) that apply to this
 * product. Renders nothing when there are none.
 */
export default function ProductOffers({ productId }) {
  const [offers, setOffers] = useState([]);
  const [copied, setCopied] = useState(null);
  const copiedTimer = useRef(null);

  useEffect(() => {
    if (!productId) return undefined;
    let cancelled = false;
    couponService
      .getForProduct(productId)
      .then((rows) => {
        if (!cancelled) setOffers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // Offers are a nice-to-have; never block the product page on them.
        if (!cancelled) setOffers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const copy = async (code) => {
    // Checkout pre-applies it, so shoppers don't have to paste it.
    rememberCopiedCoupon(code);
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(code);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 1800);
  };

  if (!offers.length) return null;

  return (
    <section className="mt-6" aria-label="Active offers">
      <p className="mb-2.5 text-[12px] font-medium text-gray-600">Active offers</p>
      <div className="flex snap-x gap-2.5 overflow-x-auto pt-2.5 pb-1 [scrollbar-width:none]">
        {offers.map((offer) => {
          const lines = offerLines(offer);
          const isCopied = !offer.automatic && copied === offer.code;
          return (
            <div
              key={offer.code || offer.id}
              className="relative flex w-[10.5rem] shrink-0 snap-start flex-col items-center rounded-lg border border-emerald-600/40 bg-gradient-to-b from-emerald-50 to-emerald-100/70 px-3 pt-4 pb-3 text-center"
            >
              {offer.badge ? (
                <span className="absolute -top-2.5 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-sm bg-black px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap text-white uppercase">
                  {offer.badge}
                </span>
              ) : null}
              <p className="line-clamp-2 text-[14px] leading-snug font-semibold text-black">
                {offer.automatic && offer.title ? offer.title : lines.title}
              </p>
              <span aria-hidden className="my-2 h-px w-full bg-emerald-600/20" />
              <p className="text-[13px] font-semibold text-emerald-700">{lines.subtitle}</p>
              {offer.automatic ? (
                <p className="mt-auto pt-2.5 text-[12px] font-bold text-black">{lines.footer}</p>
              ) : (
              <button
                type="button"
                onClick={() => copy(offer.code)}
                aria-label={isCopied ? `Copied ${offer.code}` : `Copy code ${offer.code}`}
                className="mt-auto inline-flex items-center gap-1 pt-2.5 text-[12px] font-bold text-black hover:text-emerald-700"
              >
                {isCopied ? (
                  <>
                    Copied <CheckIcon className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Code: {offer.code} <CopyGlyph className="h-3.5 w-3.5 text-gray-500" />
                  </>
                )}
              </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
