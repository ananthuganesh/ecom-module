"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { adminOrderService } from "@/api";
import { formatOrderNumber, adminOrderHref } from "@/utils/formatOrderNumber";
import { unwrapPage } from "@/utils/unwrapPage";
import { ArrowUpRight, Package, Search, SearchX } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";

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

/** Debounced order lookup; empty until the query has 2+ characters. */
function useOrderSearch(q) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await adminOrderService.getAll({ q: needle, limit: 8 });
        if (!cancelled) setResults(unwrapPage(data).items.slice(0, 8));
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

  return { results, loading };
}

/**
 * Sidebar search: a pill styled like the active nav item that opens a
 * search window (also on ⌘K / Ctrl+K).
 */
export default function AdminSearchDialog() {
  const router = useRouter();
  const blockNavigation = useProductSaveBarStore((s) => s.blockNavigation);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [shortcut, setShortcut] = useState("Ctrl K");
  const { results, loading } = useOrderSearch(q);
  const needle = q.trim();

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut("⌘K");
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onOpenChange = (next) => {
    setOpen(next);
    if (!next) setQ("");
  };

  const goTo = (href) => {
    onOpenChange(false);
    if (blockNavigation()) return; // unsaved changes — stay and shake the save bar
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger className="admin-nav-search">
        <Search className="admin-nav-search-icon" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Search</span>
        <kbd className="admin-nav-search-shortcut" aria-hidden>
          {shortcut}
        </kbd>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="admin-search-backdrop" />
        <DialogPrimitive.Popup data-admin-shell className="admin-search-dialog">
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search orders by number, customer or AWB.
          </DialogPrimitive.Description>

          <CommandPrimitive shouldFilter={false} loop className="flex min-h-0 flex-col">
            <div className="admin-search-input-row">
              <Search className="size-5 shrink-0 text-(--p-color-icon-secondary)" aria-hidden />
              <CommandPrimitive.Input
                autoFocus
                value={q}
                onValueChange={setQ}
                placeholder="Search orders by number, customer or AWB"
                className="admin-search-input"
              />
              {loading ? <Spinner className="size-4 text-(--p-color-icon-secondary)" /> : null}
              <kbd className="admin-search-esc">esc</kbd>
            </div>

            {needle.length >= 2 ? (
              <CommandPrimitive.List className="admin-search-list">
                {!loading && results.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <SearchX className="size-6 text-(--p-color-icon-secondary)" aria-hidden />
                    <p className="m-0 text-[0.8125rem] font-medium text-(--p-color-text)">
                      No orders match “{needle}”
                    </p>
                    <p className="m-0 text-xs text-(--p-color-text-secondary)">
                      Try an order number, customer name, phone or AWB.
                    </p>
                  </div>
                ) : null}

                {results.length > 0 ? (
                  <CommandPrimitive.Group heading="Orders" className="admin-search-group">
                    {results.map((order) => {
                      const { id, name, awb } = labelFor(order);
                      return (
                        <CommandPrimitive.Item
                          key={order._id}
                          value={String(order._id)}
                          onSelect={() => goTo(adminOrderHref(order))}
                          className="admin-search-item"
                        >
                          <span className="admin-search-item-icon">
                            <Package className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.8125rem] font-medium text-(--p-color-text)">
                              {id}
                            </span>
                            <span className="block truncate text-xs text-(--p-color-text-secondary)">
                              {name}
                              {awb ? ` · AWB ${awb}` : ""}
                            </span>
                          </span>
                        </CommandPrimitive.Item>
                      );
                    })}
                  </CommandPrimitive.Group>
                ) : null}

                <CommandPrimitive.Group className="admin-search-group">
                  <CommandPrimitive.Item
                    value="__all__"
                    onSelect={() => goTo(`/admin/orders?q=${encodeURIComponent(needle)}`)}
                    className="admin-search-item"
                  >
                    <span className="admin-search-item-icon">
                      <ArrowUpRight className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-(--p-color-text)">
                      See all orders matching “{needle}”
                    </span>
                  </CommandPrimitive.Item>
                </CommandPrimitive.Group>
              </CommandPrimitive.List>
            ) : (
              <p className="m-0 px-5 py-8 text-center text-xs text-(--p-color-text-secondary)">
                Type at least 2 characters to search orders.
              </p>
            )}
          </CommandPrimitive>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
