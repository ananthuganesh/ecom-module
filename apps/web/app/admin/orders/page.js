"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  adminCompanyProfileService,
  adminErpService,
  adminOrderService,
  adminShippingService,
} from "@/api";
import { printHtml } from "@/utils/printHtml";
import { printPdfBlob } from "@/utils/printPdfBlob";
import { buildMultiInvoicePrintHtml } from "@/utils/buildInvoicePrintHtml";
import { displayCustomerName } from "@/utils/displayCustomerName";
import { adminOrderHref, formatOrderNumber } from "@/utils/formatOrderNumber";
import { formatAdminDateTime, parseAdminDate } from "@/utils/formatAdminDateTime";
import { downloadCsv, rowsToCsv } from "@/utils/downloadCsv";
import { unwrapPage } from "@/utils/unwrapPage";
import { Download, FileText, Loader2, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { ShoppingBag } from "@/components/admin/LocalIcons";
import {
  AdminListLayout,
  AdminHeaderButton,
  AdminViewMenu,
  AdminDateRangeButton,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import {
  canFulfillOrder,
  canPrintOrderInvoice,
  canPrintOrderLabel,
  createOrderColumns,
  isMutedFulfillmentRow,
  resolveFulfillmentDisplay,
  paymentLabel,
} from "./columns";
import { ordersListKey, useAdminOrdersStore } from "@/store/useAdminOrdersStore";

const PAGE_SIZE = 25;

export default function AdminOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scopeFromUrl = searchParams.get("scope") || "";
  const shippingStatusFromUrl = searchParams.get("shippingStatus") || "";
  const qFromUrl = searchParams.get("q") || "";
  const cached = useAdminOrdersStore.getState();
  const initialSearch = qFromUrl || cached.searchQ || "";
  const initialDate = cached.dateFilter || { preset: "all" };
  const initialView = cached.viewFilter || "all";
  const initialHide = Boolean(cached.hideArchived);
  const initialKey = ordersListKey({
    viewFilter: initialView,
    hideArchived: initialHide,
    dateFilter: initialDate,
    q: initialSearch,
  });
  const cacheHit = cached.cacheKey === initialKey && Array.isArray(cached.orders) && cached.orders.length > 0;

  const [orders, setOrders] = useState(() => (cacheHit ? cached.orders : []));
  const [page, setPage] = useState(() => (cacheHit ? cached.page || 1 : 1));
  const [hasMore, setHasMore] = useState(() => (cacheHit ? Boolean(cached.hasMore) : false));
  const [loading, setLoading] = useState(() => !cacheHit);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dateFilter, setDateFilter] = useState(() => initialDate);
  const [viewFilter, setViewFilter] = useState(() => initialView);
  const [hideArchived, setHideArchived] = useState(() => initialHide);
  const [sortBy, setSortBy] = useState(() => cached.sortBy || "date");
  const [searchQ, setSearchQ] = useState(() => initialSearch);
  const [debouncedQ, setDebouncedQ] = useState(() => initialSearch);
  const [rowSelection, setRowSelection] = useState({});
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [isPrintingInvoices, setIsPrintingInvoices] = useState(false);
  const [isPrintingLabels, setIsPrintingLabels] = useState(false);
  const fetchGen = useRef(0);

  const selectedOrderIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const handleDateFilterChange = (next) => {
    const value =
      typeof next === "string"
        ? { preset: next }
        : {
            preset: next?.preset || (next?.from ? "custom" : "all"),
            from: next?.from || undefined,
            to: next?.to || undefined,
          };
    setDateFilter(value);
    useAdminOrdersStore.getState().patch({ dateFilter: value });
  };

  // Legacy /admin/orders?scope=shipment → /admin/shipments
  useEffect(() => {
    if (pathname !== "/admin/orders" || scopeFromUrl !== "shipment") return;
    const params = new URLSearchParams();
    if (shippingStatusFromUrl) params.set("shippingStatus", shippingStatusFromUrl);
    if (qFromUrl.trim()) params.set("q", qFromUrl.trim());
    const qs = params.toString();
    router.replace(qs ? `/admin/shipments?${qs}` : "/admin/shipments");
  }, [pathname, scopeFromUrl, shippingStatusFromUrl, qFromUrl, router]);

  // Drop unused ?status= / ?shippingStatus= deep links on Orders
  useEffect(() => {
    if (pathname !== "/admin/orders") return;
    if (!searchParams.has("status") && !searchParams.has("shippingStatus")) return;
    if (scopeFromUrl === "shipment") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    params.delete("shippingStatus");
    const qs = params.toString();
    router.replace(qs ? `/admin/orders?${qs}` : "/admin/orders");
  }, [pathname, searchParams, scopeFromUrl, router]);

  useEffect(() => {
    if (!qFromUrl) return;
    setSearchQ(qFromUrl);
    setDebouncedQ(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const buildParams = useCallback(
    (pageNum) => {
      const params = {
        page: pageNum,
        limit: PAGE_SIZE,
      };
      if (viewFilter && viewFilter !== "all") params.view = viewFilter;
      if (hideArchived) params.hideArchived = true;
      if (dateFilter?.from && dateFilter?.to) {
        params.dateFrom = dateFilter.from;
        params.dateTo = dateFilter.to;
      } else if (dateFilter?.preset && dateFilter.preset !== "all" && dateFilter.preset !== "custom") {
        params.datePreset = dateFilter.preset;
      }
      if (debouncedQ) params.q = debouncedQ;
      return params;
    },
    [viewFilter, hideArchived, dateFilter, debouncedQ]
  );

  const ordersRef = useRef([]);
  ordersRef.current = orders;
  const loadingMoreRef = useRef(false);
  loadingMoreRef.current = loadingMore;
  const lastLoadedAtRef = useRef(0);

  const listKey = ordersListKey({
    viewFilter,
    hideArchived,
    dateFilter,
    q: debouncedQ,
  });

  const fetchPage = useCallback(
    async (pageNum, { append, silent } = {}) => {
      if (silent && loadingMoreRef.current) return;
      if (silent && Date.now() - lastLoadedAtRef.current < 8_000) return;
      const gen = ++fetchGen.current;
      if (append) setLoadingMore(true);
      else if (!silent) setLoading(true);
      try {
        const data = await adminOrderService.getAll(buildParams(pageNum));
        if (gen !== fetchGen.current) return;
        lastLoadedAtRef.current = Date.now();
        const { items, hasMore: more } = unwrapPage(data, { fallbackLimit: PAGE_SIZE });
        const list = items.filter((o) => o.status !== "abandoned");
        const prev = ordersRef.current;
        let next = list;
        if (append) {
          const seen = new Set(prev.map((o) => o._id));
          next = [...prev, ...list.filter((o) => !seen.has(o._id))];
        } else if (silent && prev.length > list.length) {
          const seen = new Set();
          next = [];
          for (const row of list) {
            next.push(row);
            seen.add(row._id);
          }
          for (const row of prev) {
            if (!seen.has(row._id)) next.push(row);
          }
        }
        setOrders(next);
        if (append) {
          setPage(pageNum);
          setHasMore(more);
        } else if (!(silent && prev.length > list.length)) {
          setPage(1);
          setHasMore(more);
        }
        const store = useAdminOrdersStore.getState();
        store.saveSnapshot({
          cacheKey: listKey,
          orders: next,
          page: append ? pageNum : silent && prev.length > list.length ? store.page : 1,
          hasMore: append ? more : silent && prev.length > list.length ? store.hasMore : more,
          dateFilter,
          viewFilter,
          hideArchived,
          sortBy: store.sortBy,
          searchQ: debouncedQ,
        });
      } catch (error) {
        if (gen !== fetchGen.current) return;
        console.error("Error fetching admin orders:", error);
        if (!append && !silent) {
          setOrders([]);
          setHasMore(false);
          toast.error("Failed to fetch orders");
        }
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildParams, listKey, dateFilter, viewFilter, hideArchived, debouncedQ]
  );

  useEffect(() => {
    setRowSelection({});
    const hit =
      useAdminOrdersStore.getState().cacheKey === listKey &&
      (useAdminOrdersStore.getState().orders || []).length > 0;
    fetchPage(1, { append: false, silent: hit });

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        fetchPage(1, { append: false, silent: true });
      }
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    const pollId = window.setInterval(refreshIfVisible, 45_000);
    return () => {
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [fetchPage, listKey]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    return fetchPage(page + 1, { append: true });
  }, [hasMore, loading, loadingMore, page, fetchPage]);

  const displayOrders = useMemo(() => {
    const sorted = [...orders].sort((a, b) => {
      if (sortBy === "customer") {
        const an = String(
          a.shippingAddress?.name || a.customerId?.name || a.customerName || ""
        ).toLowerCase();
        const bn = String(
          b.shippingAddress?.name || b.customerId?.name || b.customerName || ""
        ).toLowerCase();
        return an.localeCompare(bn);
      }
      if (sortBy === "total") {
        return (
          (Number(b.finalPrice ?? b.total) || 0) - (Number(a.finalPrice ?? a.total) || 0)
        );
      }
      if (sortBy === "payment") {
        const ap = String(a.paymentStatus || a.transactionDetails?.paymentStatus || "");
        const bp = String(b.paymentStatus || b.transactionDetails?.paymentStatus || "");
        return ap.localeCompare(bp);
      }
      if (sortBy === "fulfillment") {
        return resolveFulfillmentDisplay(a).label.localeCompare(
          resolveFulfillmentDisplay(b).label
        );
      }
      const at = parseAdminDate(a.createdAt)?.getTime() || 0;
      const bt = parseAdminDate(b.createdAt)?.getTime() || 0;
      return bt - at;
    });
    return sorted;
  }, [orders, sortBy]);

  useEffect(() => {
    const ids = new Set(displayOrders.map((o) => o._id));
    setRowSelection((prev) => {
      let changed = false;
      const next = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value && ids.has(key)) next[key] = true;
        else if (value) changed = true;
      }
      return changed || Object.keys(next).length !== Object.keys(prev).length ? next : prev;
    });
  }, [displayOrders]);

  const columns = useMemo(() => createOrderColumns(), []);

  const selectedOrders = useMemo(() => {
    const ids = new Set(selectedOrderIds.map(String));
    return displayOrders.filter((order) => ids.has(String(order._id)));
  }, [displayOrders, selectedOrderIds]);

  const canFulfillSelected = selectedOrders.some(canFulfillOrder);
  const canPrintSelectedInvoices = selectedOrders.some(canPrintOrderInvoice);
  const canPrintSelectedLabels = selectedOrders.some(canPrintOrderLabel);

  const handleExportSelected = () => {
    if (!selectedOrderIds.length) return;
    const selected = displayOrders.filter((o) => selectedOrderIds.includes(o._id));
    if (!selected.length) {
      toast.error("No rows to export");
      return;
    }
    const headers = [
      "Order",
      "Date",
      "Customer",
      "Email",
      "Phone",
      "City",
      "State",
      "Total",
      "Payment",
      "Fulfilment",
      "AWB",
      "Items",
    ];
    const rows = selected.map((order) => {
      const ship = order.shippingAddress || {};
      const pay =
        order.paymentStatus || order.transactionDetails?.paymentStatus || "pending";
      const fulfillment = resolveFulfillmentDisplay(order);
      const items = order.items || order.orderItems || [];
      const itemCount = items.reduce(
        (sum, it) => sum + (Number(it.quantity ?? it.qty) || 0),
        0
      );
      return {
        Order: formatOrderNumber(order) || order._id || "",
        Date: formatAdminDateTime(order.createdAt),
        Customer: displayCustomerName(order, ""),
        Email: order.customerId?.email || ship.email || "",
        Phone: order.customerId?.phone || ship.phone || "",
        City: ship.city || "",
        State: ship.state || "",
        Total: Number(order.finalPrice ?? order.total ?? 0).toFixed(2),
        Payment: paymentLabel(pay),
        Fulfilment: fulfillment.label,
        AWB: order.awbCode || order.awb || "",
        Items: itemCount || items.length || 0,
      };
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`orders-${stamp}.csv`, rowsToCsv(headers, rows));
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };

  const mergeUpdatedOrders = (updated) => {
    if (!updated.length) return;
    const byId = new Map(updated.map((order) => [String(order._id), order]));
    setOrders((prev) => {
      const next = prev.map((order) => byId.get(String(order._id)) || order);
      useAdminOrdersStore.getState().patch({ orders: next });
      return next;
    });
  };

  const handleBulkMarkFulfilled = async () => {
    const ids = selectedOrders.filter(canFulfillOrder).map((order) => order._id);
    if (!ids.length || isFulfilling) return;
    setIsFulfilling(true);
    setIsBulkLoading(true);
    try {
      const CONCURRENCY = 4;
      let cursor = 0;
      let failed = 0;
      const updated = [];
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, ids.length) },
        async () => {
          while (cursor < ids.length) {
            const id = ids[cursor];
            cursor += 1;
            try {
              const response = await adminShippingService.createShipment(id);
              if (response?.order) updated.push(response.order);
              try {
                const existing = await adminErpService.salesInvoices.byOrder(id);
                if (!existing) await adminErpService.salesInvoices.fromOrder(id);
              } catch {
                /* print invoice can still create later */
              }
            } catch {
              failed += 1;
            }
          }
        }
      );
      await Promise.all(workers);
      mergeUpdatedOrders(updated);
      if (!updated.length) {
        toast.error("Could not mark orders as fulfilled");
        return;
      }
      toast.success(
        failed
          ? `Marked ${updated.length} fulfilled (${failed} failed)`
          : `Marked ${updated.length} order${updated.length === 1 ? "" : "s"} as fulfilled`
      );
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.message || "Fulfillment failed");
    } finally {
      setIsFulfilling(false);
      setIsBulkLoading(false);
    }
  };

  const handleBulkPrintLabels = async () => {
    const ids = selectedOrders.filter(canPrintOrderLabel).map((order) => order._id);
    if (!ids.length || isPrintingLabels) return;
    setIsPrintingLabels(true);
    setIsBulkLoading(true);
    try {
      const { blob, printed, skipped, errors } =
        await adminShippingService.downloadLabelsBulk(ids);
      if (!(blob instanceof Blob) || blob.type?.includes("json")) {
        let detail = "No printable DTDC labels in selection";
        try {
          const text = await blob.text();
          const parsed = JSON.parse(text);
          if (parsed?.detail) detail = String(parsed.detail);
        } catch {
          /* ignore */
        }
        toast.error(detail);
        return;
      }
      await printPdfBlob(blob, { autoPrint: true });
      const extra = [];
      if (skipped) extra.push(`${skipped} skipped`);
      if (errors) extra.push(`${errors} failed`);
      toast.success(
        extra.length
          ? `Printing ${printed} label${printed === 1 ? "" : "s"} (${extra.join(", ")})`
          : `Printing ${printed} label${printed === 1 ? "" : "s"}`
      );
    } catch (error) {
      let detail = error?.message || "Label print failed";
      const data = error?.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (parsed?.detail) detail = String(parsed.detail);
        } catch {
          /* ignore */
        }
      } else if (typeof data?.detail === "string") {
        detail = data.detail;
      }
      toast.error(detail);
    } finally {
      setIsPrintingLabels(false);
      setIsBulkLoading(false);
    }
  };

  const handleBulkPrintInvoices = async () => {
    if (!selectedOrderIds.length || isPrintingInvoices) return;
    const printableIds = selectedOrders.filter(canPrintOrderInvoice).map((order) => order._id);
    if (!printableIds.length) {
      toast.error("Invoice is available after the order is marked as fulfilled");
      return;
    }
    setIsPrintingInvoices(true);
    setIsBulkLoading(true);
    try {
      let companyRaw = {};
      try {
        companyRaw = (await adminCompanyProfileService.get()) || {};
      } catch {
        /* defaults in builder */
      }
      const company = {
        name: companyRaw.tradeName || companyRaw.legalName || "Urban Aana",
        legalName: companyRaw.legalName,
        tradeName: companyRaw.tradeName,
        gstin: companyRaw.gstin,
        phone: companyRaw.phone,
        email: companyRaw.email,
        website: companyRaw.website || companyRaw.siteUrl,
        addressLine1: companyRaw.addressLine1,
        addressLine2: companyRaw.addressLine2,
        city: companyRaw.city,
        stateName: companyRaw.stateName,
        pincode: companyRaw.pincode,
        country: companyRaw.country || "India",
        stateCode: companyRaw.stateCode,
      };

      const ids = [...printableIds];
      const orderById = new Map(orders.map((o) => [o._id, o]));
      const CONCURRENCY = 8;
      let cursor = 0;
      let failed = 0;
      const collected = [];

      const loadOne = async (id) => {
        let order = orderById.get(id) || null;
        if (!order) {
          order = await adminOrderService.getById(id).catch(() => null);
        }
        if (!order) return null;

        let invoice = null;
        try {
          invoice = await adminErpService.salesInvoices.byOrder(id);
          // Only create when missing — avoids an extra POST on every bulk print.
          if (!invoice) {
            invoice = await adminErpService.salesInvoices.fromOrder(id);
          }
        } catch {
          /* print from order lines if invoice create fails */
        }
        if (!invoice && !(order.items || []).length) return null;
        return { order, invoice, company };
      };

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, ids.length) },
        async () => {
          while (cursor < ids.length) {
            const id = ids[cursor];
            cursor += 1;
            const entry = await loadOne(id);
            if (entry) collected.push(entry);
            else failed += 1;
          }
        }
      );
      await Promise.all(workers);

      // Keep selection order for predictable print stack.
      const byId = new Map(collected.map((e) => [e.order._id, e]));
      const entries = ids.map((id) => byId.get(id)).filter(Boolean);

      if (!entries.length) {
        toast.error("No printable invoices in selection");
        return;
      }

      const html = buildMultiInvoicePrintHtml(entries);
      const invoiceNames = entries
        .map(
          (e) =>
            e.invoice?.number ||
            e.order?.invoiceNumber ||
            e.order?.orderNumber ||
            null
        )
        .filter(Boolean);
      let title;
      if (invoiceNames.length === 1) {
        title = invoiceNames[0];
      } else if (invoiceNames.length > 1 && invoiceNames.length <= 3) {
        title = invoiceNames.join("_");
      } else if (invoiceNames.length > 3) {
        title = `${invoiceNames[0]}_and_${invoiceNames.length - 1}_more`;
      } else {
        title = `Invoices_${entries.length}`;
      }
      await printHtml(html, { title });
      toast.success(
        failed
          ? `Downloaded ${entries.length} invoice${entries.length === 1 ? "" : "s"} (${failed} skipped)`
          : `Downloaded ${entries.length} invoice${entries.length === 1 ? "" : "s"}`
      );
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.message || "Invoice print failed");
    } finally {
      setIsPrintingInvoices(false);
      setIsBulkLoading(false);
    }
  };

  return (
    <AdminListLayout fill={false} title="Orders" icon={ShoppingBag}>
      <DataTable
        columns={columns}
        data={displayOrders}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        getRowId={(row) => row._id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={(order) => router.push(adminOrderHref(order))}
        showSelectionCount={false}
        infiniteScroll
        rowHeightClass="h-8"
        showColumnsMenuHideArchived
        columnsMenuHideArchived={hideArchived}
        onColumnsMenuHideArchivedChange={(value) => {
          setHideArchived(value);
          useAdminOrdersStore.getState().patch({ hideArchived: value });
        }}
        columnsMenuSortOptions={[
          { value: "date", label: "Date" },
          { value: "customer", label: "Customer" },
          { value: "total", label: "Total" },
          { value: "payment", label: "Payment status" },
          { value: "fulfillment", label: "Fulfilment status" },
        ]}
        columnsMenuSortValue={sortBy}
        onColumnsMenuSortChange={(value) => {
          setSortBy(value);
          useAdminOrdersStore.getState().patch({ sortBy: value });
        }}
        getRowClassName={(order) =>
          isMutedFulfillmentRow(order) ? "text-muted-foreground" : undefined
        }
        emptyTitle="No matching orders"
        emptyDescription="Try a different search or clear your filters."
        pageSize={PAGE_SIZE}
        toolbar={
          selectedOrderIds.length > 0 ? (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">
                  {selectedOrderIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => setRowSelection({})}
                  className="text-[13px] font-[550] text-[#005bd3] hover:underline"
                >
                  Clear
                </button>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <AdminHeaderButton variant="outline" onClick={handleExportSelected}>
                  <Download className="w-3.5 h-3.5" /> Export
                </AdminHeaderButton>
                {canFulfillSelected ? (
                  <AdminHeaderButton
                    variant="primary"
                    disabled={isBulkLoading || isFulfilling}
                    onClick={handleBulkMarkFulfilled}
                  >
                    {isFulfilling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    {isFulfilling ? "Booking…" : "Mark as fulfilled"}
                  </AdminHeaderButton>
                ) : null}
                {canPrintSelectedLabels ? (
                  <AdminHeaderButton
                    variant="outline"
                    disabled={isBulkLoading || isPrintingLabels}
                    onClick={handleBulkPrintLabels}
                  >
                    {isPrintingLabels ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    {isPrintingLabels ? "Preparing…" : "Print labels"}
                  </AdminHeaderButton>
                ) : null}
                {canPrintSelectedInvoices ? (
                  <AdminHeaderButton
                    variant="outline"
                    disabled={isBulkLoading || isPrintingInvoices}
                    onClick={handleBulkPrintInvoices}
                  >
                    {isPrintingInvoices ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    {isPrintingInvoices ? "Preparing…" : "Print invoices"}
                  </AdminHeaderButton>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <AdminViewMenu
                value={viewFilter}
                onChange={(value) => {
                  setViewFilter(value);
                  useAdminOrdersStore.getState().patch({ viewFilter: value });
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "unfulfilled", label: "Unfulfilled" },
                  { value: "unpaid", label: "Unpaid" },
                  { value: "open", label: "Open" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              <form
                className="relative min-w-0 flex-1"
                onSubmit={(e) => e.preventDefault()}
              >
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search and filter"
                  className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
                />
              </form>
              <AdminDateRangeButton
                value={dateFilter}
                onChange={handleDateFilterChange}
                allowCustom
              />
            </>
          )
        }
      />
    </AdminListLayout>
  );
}
