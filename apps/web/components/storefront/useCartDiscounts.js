"use client";

import { useEffect, useState } from "react";
import { couponService } from "@/api";

/**
 * Automatic discounts the server gives this cart right now (no code, no
 * shipping — the pincode isn't known in the cart). For display only: checkout
 * and order placement recompute everything.
 */
export function useCartDiscounts(items, { enabled = true } = {}) {
  const [state, setState] = useState({ discounts: [], goods: 0 });
  const key = JSON.stringify((items || []).map((i) => [i._id, i.qty || 1]));

  useEffect(() => {
    const lines = JSON.parse(key);
    if (!enabled || !lines.length) {
      setState({ discounts: [], goods: 0 });
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      couponService
        .preview(lines.map(([product, qty]) => ({ product, qty })))
        .then((data) => {
          if (cancelled) return;
          const discounts = (data?.discounts || []).filter((d) => Number(d.amount) > 0);
          setState({ discounts, goods: Number(data?.goodsDiscount) || 0 });
        })
        .catch(() => {
          // A nice-to-have: never block the cart on it.
          if (!cancelled) setState({ discounts: [], goods: 0 });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, enabled]);

  return state;
}
