"use client";

import { useEffect, useRef, useState } from "react";
import {
  countdownParts,
  saleCountdownTarget,
  showLiveCountdown,
} from "@/lib/saleSchedule";

const pad = (n) => String(n).padStart(2, "0");

function TimeBox({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="grid h-10 w-11 place-items-center rounded-md bg-[#DF1721] text-base font-bold tabular-nums text-white sm:h-11 sm:w-12 sm:text-lg">
        {pad(value)}
      </span>
      <span className="text-[9px] font-semibold tracking-wider text-[#DF1721]/80 uppercase">
        {label}
      </span>
    </div>
  );
}

/**
 * Live-sale banner for the product page. In the sale's final 24 hours it counts
 * down to the real end (the price really reverts then); before that it is just
 * the "Sale offer" label. Calls ``onEnded`` once when the end passes.
 */
export default function SaleOfferCard({ sale, onEnded }) {
  const [now, setNow] = useState(null);
  const endedRef = useRef(false);
  // Counts to when this stretch really stops: today's flash window close, or the sale end.
  const target = saleCountdownTarget(sale);
  const left = now == null ? null : countdownParts(target, now);
  const hasEnd = Boolean(target);
  const ended = hasEnd && now != null && !left;
  const liveTimer = showLiveCountdown(left);

  useEffect(() => {
    // Client clock only — avoids a server/client mismatch on first paint.
    setNow(Date.now());
    if (!hasEnd) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasEnd, target]);

  // A page left open overnight gets the next day's window after its refresh.
  useEffect(() => {
    endedRef.current = false;
  }, [target]);

  useEffect(() => {
    if (ended && !endedRef.current) {
      endedRef.current = true;
      onEnded?.();
    }
  }, [ended, onEnded]);

  if (!sale?.live || ended) return null;

  return (
    <section
      aria-label="Sale offer"
      className="mt-5 rounded-xl border border-[#DF1721]/25 bg-[#fff5f5] p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-bold tracking-[0.14em] text-[#DF1721] uppercase">
          <span aria-hidden>🔥</span> Sale offer
        </p>
        {liveTimer ? (
          <div className="flex items-start gap-1.5" role="timer" aria-live="off">
            <TimeBox value={left.hours} label="Hrs" />
            <TimeBox value={left.minutes} label="Min" />
            <TimeBox value={left.seconds} label="Sec" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
