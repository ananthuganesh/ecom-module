"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  adminCompanyProfileService,
  adminErpService,
  adminOrderService,
} from "@/api";
import { printHtml } from "@/utils/printHtml";
import { buildMultiInvoicePrintHtml } from "@/utils/buildInvoicePrintHtml";
import { adminOrderHref, formatOrderNumber } from "@/utils/formatOrderNumber";
import { formatAdminDateTime, parseAdminDate } from "@/utils/formatAdminDateTime";
import { downloadCsv, rowsToCsv } from "@/utils/downloadCsv";
import { unwrapPage } from "@/utils/unwrapPage";
import { Download, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AdminListLayout,
  AdminHeaderButton,
  AdminViewMenu,
  AdminDateRangeButton,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import {
  createOrderColumns,
  isMutedFulfillmentRow,
  resolveFulfillmentDisplay,
  paymentLabel,
} from "./columns";

const PAGE_SIZE = 25;

export default function AdminOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scopeFromUrl = searchParams.get("scope") || "";
  const shippingStatusFromUrl = searchParams.get("shippingStatus") || "";
  const qFromUrl = searchParams.get("q") || "";

  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dateFilter, setDateFilter] = useState({ preset: "all" });
  const [viewFilter, setViewFilter] = useState("all");
  const [hideArchived, setHideArchived] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [searchQ, setSearchQ] = useState(qFromUrl);
  const [debouncedQ, setDebouncedQ] = useState(qFromUrl);
  const [rowSelection, setRowSelection] = useState({});
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [isPrintingInvoices, setIsPrintingInvoices] = useState(false);
  const fetchGen = useRef(0);

  const selectedOrderIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const handleDateFilterChange = (next) => {
    if (typeof next === "string") {
      setDateFilter({ preset: next });
      return;
    }
    setDateFilter({
      preset: next?.preset || (next?.from ? "custom" : "all"),
      from: next?.from || undefined,
      to: next?.to || undefined,
    });
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

  const fetchPage = useCallback(
    async (pageNum, { append } = {}) => {
      const gen = ++fetchGen.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await adminOrderService.getAll(buildParams(pageNum));
        if (gen !== fetchGen.current) return;
        const { items, hasMore: more } = unwrapPage(data, { fallbackLimit: PAGE_SIZE });
        const list = items.filter((o) => o.status !== "abandoned");
        setOrders((prev) => {
          if (!append) return list;
          const seen = new Set(prev.map((o) => o._id));
          return [...prev, ...list.filter((o) => !seen.has(o._id))];
        });
        setPage(pageNum);
        setHasMore(more);
      } catch (error) {
        if (gen !== fetchGen.current) return;
        console.error("Error fetching admin orders:", error);
        if (!append) setOrders([]);
        setHasMore(false);
        toast.error("Failed to fetch orders");
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildParams]
  );

  useEffect(() => {
    setRowSelection({});
    fetchPage(1, { append: false });
  }, [fetchPage]);

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
        Customer: ship.name || order.customerId?.name || order.customerName || "",
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

  const handleBulkPrintInvoices = async () => {
    if (!selectedOrderIds.length || isPrintingInvoices) return;
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

      const ids = [...selectedOrderIds];
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
    <AdminListLayout fill={false} title="Orders">
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
        onColumnsMenuHideArchivedChange={setHideArchived}
        columnsMenuSortOptions={[
          { value: "date", label: "Date" },
          { value: "customer", label: "Customer" },
          { value: "total", label: "Total" },
          { value: "payment", label: "Payment status" },
          { value: "fulfillment", label: "Fulfilment status" },
        ]}
        columnsMenuSortValue={sortBy}
        onColumnsMenuSortChange={setSortBy}
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
              </div>
            </>
          ) : (
            <>
              <AdminViewMenu
                value={viewFilter}
                onChange={setViewFilter}
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
