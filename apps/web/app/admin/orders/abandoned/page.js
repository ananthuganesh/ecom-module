"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { abandonedCheckoutService } from "@/api";
import { Search, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv, rowsToCsv } from "@/utils/downloadCsv";
import { formatAdminDateTime } from "@/utils/formatAdminDateTime";
import { unwrapPage } from "@/utils/unwrapPage";
import {
  AdminListLayout,
  AdminHeaderButton,
  AdminViewMenu,
  AdminDateRangeButton,
} from "@/components/admin/list";
import { ShoppingBag } from "@/components/admin/LocalIcons";
import { DataTable } from "@/components/ui/data-table";
import {
  createAbandonedColumns,
  emailStatus,
  recoveryStatus,
  whatsappStatus,
} from "./columns";
import { abandonedListKey, useAdminAbandonedStore } from "@/store/useAdminAbandonedStore";

function customerLabel(details) {
  const d = details || {};
  const name = String(d.name || "").trim();
  if (name) return name;
  const email = String(d.email || "").trim();
  if (email) return email;
  const phone = String(d.phone || "").trim();
  if (phone) return phone;
  return "Guest";
}

const PAGE_SIZE = 25;

function formatCheckoutId(id) {
  const s = String(id || "").trim();
  if (!s) return "";
  const short = s.length > 8 ? s.slice(-8).toUpperCase() : s.toUpperCase();
  return `#${short}`;
}

function mapCheckoutToRow(checkout) {
  const items = (checkout.items || []).map((i) => ({
    name: i.name || i.productName || "Item",
    quantity: Number(i.quantity ?? i.qty ?? 0),
    qty: Number(i.quantity ?? i.qty ?? 0),
    price: Number(i.price || 0),
    image: i.image || "",
  }));
  return {
    kind: "checkout",
    _id: checkout._id,
    checkoutId: checkout._id,
    checkoutLabel: formatCheckoutId(checkout._id),
    recoveryUrl: checkout.recoveryUrl || null,
    customerDetails: checkout.customerDetails || {},
    items,
    orderItems: items,
    totalAmount: Number(checkout.totalAmount || 0),
    lastActivityAt: checkout.lastActivityAt || checkout.updatedAt || checkout.createdAt,
    status: checkout.status || "abandoned",
    recoverySentAt: checkout.recoverySentAt || null,
    recoveryLastResult: checkout.recoveryLastResult || null,
    emailSentAt:
      checkout.emailSentAt ||
      checkout.recoveryLastResult?.emailSentAt ||
      null,
    emailStatus: checkout.emailStatus || null,
    whatsappSentAt:
      checkout.whatsappSentAt ||
      checkout.recoveryLastResult?.whatsappSentAt ||
      null,
    whatsappStatus: checkout.whatsappStatus || null,
  };
}

export default function AbandonedCheckoutsPage() {
  const searchParams = useSearchParams();
  const qFromUrl = searchParams.get("q") || "";
  const cached = useAdminAbandonedStore.getState();
  const initialSearch = qFromUrl || cached.searchQ || "";
  const initialView = cached.viewFilter || "abandoned";
  const initialDate = cached.datePreset || "all";
  const initialKey = abandonedListKey({
    viewFilter: initialView,
    datePreset: initialDate,
    q: initialSearch,
  });
  const cacheHit = cached.cacheKey === initialKey && Array.isArray(cached.rows) && cached.rows.length > 0;

  const [rows, setRows] = useState(() => (cacheHit ? cached.rows : []));
  const [page, setPage] = useState(() => (cacheHit ? cached.page || 1 : 1));
  const [hasMore, setHasMore] = useState(() => (cacheHit ? Boolean(cached.hasMore) : false));
  const [loading, setLoading] = useState(() => !cacheHit);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQ, setSearchQ] = useState(() => initialSearch);
  const [debouncedQ, setDebouncedQ] = useState(() => initialSearch.trim());
  const [viewFilter, setViewFilter] = useState(() => initialView);
  const [datePreset, setDatePreset] = useState(() => initialDate);
  const [rowSelection, setRowSelection] = useState({});
  const fetchGen = useRef(0);
  const rowsRef = useRef([]);
  rowsRef.current = rows;
  const loadingMoreRef = useRef(false);
  loadingMoreRef.current = loadingMore;
  const lastLoadedAtRef = useRef(0);

  useEffect(() => {
    if (!qFromUrl) return;
    setSearchQ(qFromUrl);
    setDebouncedQ(qFromUrl.trim());
  }, [qFromUrl]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const rowKey = (item) => String(item._id);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const listKey = abandonedListKey({
    viewFilter,
    datePreset,
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
        const checkoutParams = {
          page: pageNum,
          limit: PAGE_SIZE,
        };
        if (viewFilter && viewFilter !== "all") checkoutParams.status = viewFilter;
        if (datePreset && datePreset !== "all") checkoutParams.datePreset = datePreset;
        if (debouncedQ) checkoutParams.q = debouncedQ;

        const checkoutsRes = await abandonedCheckoutService.getAll(checkoutParams);
        if (gen !== fetchGen.current) return;
        lastLoadedAtRef.current = Date.now();

        const checkoutsPage = unwrapPage(checkoutsRes, { fallbackLimit: PAGE_SIZE });
        const checkoutRows = checkoutsPage.items.map(mapCheckoutToRow);
        const more = Boolean(checkoutsPage.hasMore);
        const prev = rowsRef.current;
        let next = checkoutRows;
        if (append) {
          const seen = new Set(prev.map(rowKey));
          next = [...prev, ...checkoutRows.filter((r) => !seen.has(rowKey(r)))];
        } else if (silent && prev.length > checkoutRows.length) {
          const seen = new Set();
          next = [];
          for (const row of checkoutRows) {
            next.push(row);
            seen.add(rowKey(row));
          }
          for (const row of prev) {
            if (!seen.has(rowKey(row))) next.push(row);
          }
        }
        setRows(next);
        if (append) {
          setPage(pageNum);
          setHasMore(more);
        } else if (!(silent && prev.length > checkoutRows.length)) {
          setPage(1);
          setHasMore(more);
        }
        const store = useAdminAbandonedStore.getState();
        store.saveSnapshot({
          cacheKey: listKey,
          rows: next,
          page: append ? pageNum : silent && prev.length > checkoutRows.length ? store.page : 1,
          hasMore: append ? more : silent && prev.length > checkoutRows.length ? store.hasMore : more,
          viewFilter,
          datePreset,
          searchQ: debouncedQ,
        });
      } catch (error) {
        if (gen !== fetchGen.current) return;
        console.error("Error fetching abandoned list:", error);
        if (!append && !silent) {
          toast.error("Failed to load abandoned carts");
          setRows([]);
          setHasMore(false);
        }
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [viewFilter, datePreset, debouncedQ, listKey]
  );

  useEffect(() => {
    setRowSelection({});
    const hit =
      useAdminAbandonedStore.getState().cacheKey === listKey &&
      (useAdminAbandonedStore.getState().rows || []).length > 0;
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

  useEffect(() => {
    const ids = new Set(rows.map(rowKey));
    setRowSelection((prev) => {
      let changed = false;
      const next = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value && ids.has(key)) next[key] = true;
        else if (value) changed = true;
      }
      return changed || Object.keys(next).length !== Object.keys(prev).length ? next : prev;
    });
  }, [rows]);

  const columns = useMemo(() => createAbandonedColumns(), []);

  const handleExportSelected = async () => {
    if (!selectedIds.length) return;
    const selected = rows.filter((row) => selectedIds.includes(rowKey(row)));
    if (!selected.length) {
      toast.error("No rows to export");
      return;
    }

    const withLinks = await Promise.all(
      selected.map(async (item) => {
        if (item.recoveryUrl) return item;
        try {
          const res = await abandonedCheckoutService.getRecoveryLink(item._id);
          return { ...item, recoveryUrl: res?.recoveryUrl || null };
        } catch {
          return item;
        }
      })
    );

    const headers = [
      "Checkout",
      "Date",
      "Customer",
      "Email",
      "Phone",
      "Recovery",
      "Email status",
      "WhatsApp",
      "Items",
      "Total",
      "Recovery URL",
    ];
    const csvRows = withLinks.map((item) => {
      const c = item.customerDetails || {};
      const items = item.items || item.orderItems || [];
      const itemCount = items.reduce(
        (sum, it) => sum + (Number(it.quantity ?? it.qty) || 0),
        0
      );
      return {
        Checkout: item.checkoutLabel || "",
        Date: formatAdminDateTime(item.lastActivityAt),
        Customer: customerLabel(c),
        Email: c.email || "",
        Phone: c.phone || "",
        Recovery: recoveryStatus(item),
        "Email status": emailStatus(item),
        WhatsApp: whatsappStatus(item),
        Items: itemCount || items.length || 0,
        Total: Number(item.totalAmount || 0).toFixed(2),
        "Recovery URL": item.recoveryUrl || "",
      };
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`abandoned-carts-${stamp}.csv`, rowsToCsv(headers, csvRows));
    toast.success(`Exported ${csvRows.length} row${csvRows.length === 1 ? "" : "s"}`);
  };

  return (
    <AdminListLayout fill={false} title="Abandoned carts" icon={ShoppingBag}>
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        getRowId={(row) => rowKey(row)}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        showSelectionCount={false}
        infiniteScroll
        rowHeightClass="h-8"
        emptyTitle="No abandoned carts found"
        emptyDescription="Try adjusting your filters."
        pageSize={PAGE_SIZE}
        toolbar={
          selectedIds.length > 0 ? (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">
                  {selectedIds.length} selected
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
              </div>
            </>
          ) : (
            <>
              <AdminViewMenu
                value={viewFilter}
                onChange={(value) => {
                  setViewFilter(value);
                  useAdminAbandonedStore.getState().patch({ viewFilter: value });
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "abandoned", label: "Abandoned" },
                  { value: "converted", label: "Converted" },
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
                value={datePreset}
                onChange={(next) => {
                  const value = typeof next === "string" ? next : next?.preset || "all";
                  setDatePreset(value);
                  useAdminAbandonedStore.getState().patch({ datePreset: value });
                }}
              />
            </>
          )
        }
      />
    </AdminListLayout>
  );
}
