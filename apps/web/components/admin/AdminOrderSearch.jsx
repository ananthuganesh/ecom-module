"use client";

import { formatOrderNumber, adminOrderHref } from "@/utils/formatOrderNumber";
import { adminOrderService } from "@/api";
import { unwrapPage } from "@/utils/unwrapPage";
import { Search, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

function labelFor(order) {
  const id = formatOrderNumber(order, 8) || "Order";
  const name =
    order.shippingAddress?.name ||
    order.customerId?.name ||
    order.customerId?.email ||
    "Customer";
  const awb = order.awb || order.awbCode || "";
  return { id, name, awb };
}

export default function AdminOrderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await adminOrderService.getAll({ q: needle, limit: 8 });
        if (!cancelled) {
          const { items } = unwrapPage(data);
          setResults(items.slice(0, 8));
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const go = (order) => {
    setOpen(false);
    setQ("");
    setResults([]);
    router.push(adminOrderHref(order));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const needle = q.trim();
    if (!needle) return;
    if (results.length === 1) {
      go(results[0]);
      return;
    }
    setOpen(false);
    router.push(`/admin/orders?q=${encodeURIComponent(needle)}`);
  };

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-[40rem]">
      <form onSubmit={onSubmit} className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#aaa]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search"
          autoComplete="off"
          className="h-[38px] w-full rounded-lg border border-[#585858] bg-[#303030] pr-3 pl-10 text-sm font-medium text-[rgb(220,220,220)] outline-none placeholder:text-[rgb(220,220,220)]/70 transition-colors hover:border-[#707070] hover:bg-[#373737] focus:border-[#eee] focus:bg-[#1a1a1a] focus:ring-0 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </form>
      {open && q.trim().length >= 2 && (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-[#ffffff17] bg-[#1a1a1a] text-[#eee] shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-[#aaa]">
              <Spinner className="size-3.5" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyTitle className="text-xs text-[#eee]">No matching orders</EmptyTitle>
                <EmptyDescription className="text-xs text-[#aaa]">
                  Try a different search or clear your filters.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((order) => {
                const { id, name, awb } = labelFor(order);
                return (
                  <li key={order._id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start rounded-none px-3 py-2.5 text-left text-[#eee] hover:bg-[#222] hover:text-[#eee]"
                      onClick={() => go(order)}
                    >
                      <Package className="mt-0.5 size-3.5 shrink-0 text-[#aaa]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{id}</span>
                        <span className="block truncate text-xs text-[#aaa]">
                          {name}
                          {awb ? ` · AWB ${awb}` : ""}
                        </span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
