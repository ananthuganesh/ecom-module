"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminOrderService, adminShippingService } from "@/api";
import { printPdfBlob } from "@/utils/printPdfBlob";
import { adminOrderHref, formatOrderNumber } from "@/utils/formatOrderNumber";
import { downloadCsv, rowsToCsv } from "@/utils/downloadCsv";
import { unwrapPage } from "@/utils/unwrapPage";
import { Download, Loader2, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { userErrorFromAxios, userErrorMessage } from "@/lib/userMessage";
import { Truck } from "@/components/admin/LocalIcons";
import {
  AdminListLayout,
  AdminHeaderButton,
  AdminViewMenu,
  AdminDateRangeButton,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import {
  STATUS_LABELS,
  createOrderColumns,
  isMutedFulfillmentRow,
} from "@/app/admin/orders/columns";

const PAGE_SIZE = 25;

const TERMINAL_SHIP_STATUSES = new Set([
  "delivered",
  "cancelled",
  "canceled",
  "returned",
]);

const SHIPMENT_VIEWS = [
  { value: "all", label: "All" },
  { value: "Awaiting Shipment", label: "Awaiting" },
  { value: "Ready To Ship", label: "Ready to ship" },
  { value: "In Transit", label: "In transit" },
  { value: "Delivered", label: "Delivered" },
  { value: "Shipping Sync Failed", label: "Failed" },
];

function orderNeedsDtdcSync(order) {
  const awb = String(order?.awbCode || order?.awb || "").trim();
  const ref = String(order?.transactionDetails?.dtdc?.reference_number || "").trim();
  if (!awb && !ref) return false;
  if (order?.isDelivered) return false;
  const ship = String(order?.shippingStatus || "").trim().toLowerCase();
  if (TERMINAL_SHIP_STATUSES.has(ship)) return false;
  const status = String(order?.status || "").trim().toLowerCase();
  if (TERMINAL_SHIP_STATUSES.has(status)) return false;
  return true;
}

function mergeSyncedOrders(prev, updatedList) {
  if (!updatedList?.length) return prev;
  const byId = new Map(updatedList.map((o) => [String(o._id), o]));
  return prev.map((row) => {
    const next = byId.get(String(row._id));
    return next ? { ...row, ...next } : row;
  });
}

export default function AdminShipmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shippingStatusFromUrl = searchParams.get("shippingStatus") || "all";
  const qFromUrl = searchParams.get("q") || "";

  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewFilter, setViewFilter] = useState(shippingStatusFromUrl);
  const [datePreset, setDatePreset] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [searchQ, setSearchQ] = useState(qFromUrl);
  const [debouncedQ, setDebouncedQ] = useState(qFromUrl);
  const [rowSelection, setRowSelection] = useState({});
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [isPrintingLabels, setIsPrintingLabels] = useState(false);
  const fetchGen = useRef(0);
  const softSyncGen = useRef(0);

  const selectedOrderIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const softSyncOrders = useCallback(async (list, gen) => {
    const ids = (list || []).filter(orderNeedsDtdcSync).map((o) => o._id).filter(Boolean);
    if (!ids.length) return;
    try {
      const res = await adminShippingService.syncStatuses(ids);
      if (gen !== fetchGen.current || softSyncGen.current !== gen) return;
      const updated = Array.isArray(res?.updated) ? res.updated : [];
      if (updated.length) {
        setOrders((prev) => mergeSyncedOrders(prev, updated));
      }
    } catch (error) {
      // Soft refresh is best-effort — don't toast on every page load failure
      console.warn("Shipment status soft-sync failed:", error);
    }
  }, []);

  useEffect(() => {
    setViewFilter(shippingStatusFromUrl);
    setSearchQ(qFromUrl);
    setDebouncedQ(qFromUrl);
  }, [shippingStatusFromUrl, qFromUrl]);

  // Removed sidebar/view — send old deep links to All shipments
  useEffect(() => {
    if (shippingStatusFromUrl !== "Out for Delivery") return;
    const params = new URLSearchParams();
    if (qFromUrl.trim()) params.set("q", qFromUrl.trim());
    const qs = params.toString();
    router.replace(qs ? `/admin/shipments?${qs}` : "/admin/shipments");
  }, [shippingStatusFromUrl, qFromUrl, router]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const handleViewChange = (value) => {
    setViewFilter(value);
    const params = new URLSearchParams();
    if (value && value !== "all") params.set("shippingStatus", value);
    if (qFromUrl.trim()) params.set("q", qFromUrl.trim());
    const qs = params.toString();
    router.replace(qs ? `/admin/shipments?${qs}` : "/admin/shipments");
  };

  const buildParams = useCallback(
    (pageNum) => {
      const params = {
        page: pageNum,
        limit: PAGE_SIZE,
        scope: "shipment",
      };
      if (viewFilter && viewFilter !== "all") {
        params.shippingStatus = viewFilter;
      }
      if (datePreset && datePreset !== "all") params.datePreset = datePreset;
      if (debouncedQ) params.q = debouncedQ;
      return params;
    },
    [viewFilter, datePreset, debouncedQ]
  );

  const fetchPage = useCallback(
    async (pageNum, { append } = {}) => {
      const gen = ++fetchGen.current;
      softSyncGen.current = gen;
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
        // Soft refresh: DB first, then DTDC for open AWBs on this batch
        void softSyncOrders(list, gen);
      } catch (error) {
        if (gen !== fetchGen.current) return;
        console.error("Error fetching shipments:", error);
        if (!append) setOrders([]);
        setHasMore(false);
        toast.error("Failed to fetch shipments");
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildParams, softSyncOrders]
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
      if (sortBy === "shipStatus") {
        return String(a.shippingStatus || "").localeCompare(String(b.shippingStatus || ""));
      }
      if (sortBy === "awb") {
        return String(a.awbCode || a.awb || "").localeCompare(String(b.awbCode || b.awb || ""));
      }
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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

  const columns = useMemo(() => createOrderColumns({ isShipmentScope: true }), []);

  const pageTitle =
    viewFilter !== "all" && STATUS_LABELS[viewFilter]
      ? STATUS_LABELS[viewFilter]
      : "Shipments";

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
      "Ship status",
      "AWB",
      "Courier",
    ];
    const rows = selected.map((order) => {
      const ship = order.shippingAddress || {};
      const shipStatus = String(order.shippingStatus || "").trim();
      return {
        Order: formatOrderNumber(order) || order._id || "",
        Date: order.createdAt
          ? new Date(order.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "",
        Customer: ship.name || order.customerId?.name || order.customerName || "",
        Email: order.customerId?.email || ship.email || "",
        Phone: order.customerId?.phone || ship.phone || "",
        City: ship.city || "",
        State: ship.state || "",
        "Ship status": STATUS_LABELS[shipStatus] || shipStatus,
        AWB: order.awbCode || order.awb || "",
        Courier: order.courierName || order.courier || "DTDC",
      };
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`shipments-${stamp}.csv`, rowsToCsv(headers, rows));
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };

  const handleBulkPrintLabels = async () => {
    if (!selectedOrderIds.length || isPrintingLabels) return;
    setIsPrintingLabels(true);
    setIsBulkLoading(true);
    try {
      const { blob, printed, skipped, errors } =
        await adminShippingService.downloadLabelsBulk(selectedOrderIds);
      if (!(blob instanceof Blob) || blob.type?.includes("json")) {
        let detail = "No printable DTDC labels in selection";
        try {
          const text = await blob.text();
          const parsed = JSON.parse(text);
          if (parsed?.detail) detail = String(parsed.detail);
        } catch {
          /* ignore */
        }
        toast.error(
          userErrorMessage(detail, "No printable labels in this selection")
        );
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
      setRowSelection({});
      fetchPage(1, { append: false });
    } catch (error) {
      toast.error(await userErrorFromAxios(error, "Couldn’t print labels"));
    } finally {
      setIsPrintingLabels(false);
      setIsBulkLoading(false);
    }
  };

  return (
    <AdminListLayout fill={false} title={pageTitle} icon={Truck}>
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
        columnsMenuSortOptions={[
          { value: "date", label: "Date" },
          { value: "customer", label: "Customer" },
          { value: "shipStatus", label: "Ship status" },
          { value: "awb", label: "AWB" },
        ]}
        columnsMenuSortValue={sortBy}
        onColumnsMenuSortChange={setSortBy}
        getRowClassName={(order) =>
          isMutedFulfillmentRow(order) ? "text-muted-foreground" : undefined
        }
        emptyTitle="No matching shipments"
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
              </div>
            </>
          ) : (
            <>
              <AdminViewMenu
                value={viewFilter}
                onChange={handleViewChange}
                options={SHIPMENT_VIEWS}
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
              <AdminDateRangeButton value={datePreset} onChange={setDatePreset} />
            </>
          )
        }
      />
    </AdminListLayout>
  );
}
