"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { abandonedCheckoutService, adminOrderService } from "@/api";
import { Search, Download } from "lucide-react";
import { toast } from "sonner";
import { displayCustomerName } from "@/utils/displayCustomerName";
import { formatOrderNumber } from "@/utils/formatOrderNumber";
import { downloadCsv, rowsToCsv } from "@/utils/downloadCsv";
import { unwrapPage } from "@/utils/unwrapPage";
import {
  AdminListLayout,
  AdminHeaderButton,
  AdminViewMenu,
  AdminDateRangeButton,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import {
  createAbandonedColumns,
  emailStatus,
  recoveryStatus,
  whatsappStatus,
} from "./columns";

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

/** Unpaid payment-exit orders (previous abandoned list source). */
function mapOrderToRow(order) {
  const customer = order.customerId || {};
  const ship = order.shippingAddress || {};
  const items = (order.items || order.orderItems || []).map((i) => ({
    name: i.productName || i.name || "Item",
    quantity: Number(i.quantity ?? i.qty ?? 0),
    qty: Number(i.quantity ?? i.qty ?? 0),
    price: Number(i.price || 0),
    image: i.image || i.thumbnail || "",
  }));
  const abandonedAt =
    order.transactionDetails?.abandonedAt || order.updatedAt || order.createdAt;
  return {
    kind: "order",
    _id: order._id,
    checkoutId: null,
    checkoutLabel: formatOrderNumber(order) || "",
    recoveryUrl: null,
    customerDetails: {
      name: displayCustomerName(order),
      email: customer.email || ship.email || "",
      phone: customer.phone || ship.phone || "",
      address: ship.address || ship.addressLine1 || "",
      city: ship.city || "",
      state: ship.state || "",
      postalCode: ship.postalCode || ship.pincode || "",
    },
    items,
    orderItems: items,
    totalAmount: Number(order.finalPrice ?? order.total ?? 0),
    lastActivityAt: abandonedAt,
    status: "abandoned",
    recoverySentAt: null,
    recoveryLastResult: null,
    emailSentAt: null,
    emailStatus: null,
  };
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
    emailSentAt: checkout.emailSentAt || null,
    emailStatus: checkout.emailStatus || null,
  };
}

export default function AbandonedCheckoutsPage() {
  const searchParams = useSearchParams();
  const qFromUrl = searchParams.get("q") || "";
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQ, setSearchQ] = useState(qFromUrl);
  const [debouncedQ, setDebouncedQ] = useState(qFromUrl.trim());
  const [viewFilter, setViewFilter] = useState("abandoned");
  const [datePreset, setDatePreset] = useState("all");
  const [rowSelection, setRowSelection] = useState({});
  const fetchGen = useRef(0);

  useEffect(() => {
    setSearchQ(qFromUrl);
    setDebouncedQ(qFromUrl.trim());
  }, [qFromUrl]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const rowKey = (item) => `${item.kind}-${item._id}`;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const orderCacheRef = useRef([]);

  const fetchPage = useCallback(
    async (pageNum, { append } = {}) => {
      const gen = ++fetchGen.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const checkoutParams = {
          page: pageNum,
          limit: PAGE_SIZE,
        };
        if (viewFilter && viewFilter !== "all") checkoutParams.status = viewFilter;
        if (datePreset && datePreset !== "all") checkoutParams.datePreset = datePreset;
        if (debouncedQ) checkoutParams.q = debouncedQ;

        // Checkouts drive pagination. Abandoned orders are loaded once per filter
        // change (page 1) so dual independent pages cannot skip/duplicate rows.
        const loadOrders =
          !append && viewFilter !== "converted"
            ? adminOrderService
                .getAll({
                  status: "abandoned",
                  page: 1,
                  limit: 100,
                  ...(datePreset && datePreset !== "all" ? { datePreset } : {}),
                  ...(debouncedQ ? { q: debouncedQ } : {}),
                })
                .then((res) => {
                  const page = unwrapPage(res, { fallbackLimit: 100 });
                  let orderRows = page.items.map(mapOrderToRow);
                  if (viewFilter === "abandoned") {
                    orderRows = orderRows.filter((r) => r.status === "abandoned");
                  }
                  orderCacheRef.current = orderRows;
                })
                .catch((err) => {
                  console.error(err);
                  orderCacheRef.current = [];
                  toast.error("Could not load abandoned orders");
                })
            : Promise.resolve();

        const [checkoutsRes] = await Promise.all([
          abandonedCheckoutService.getAll(checkoutParams),
          loadOrders,
        ]);
        if (gen !== fetchGen.current) return;

        const checkoutsPage = unwrapPage(checkoutsRes, { fallbackLimit: PAGE_SIZE });
        const checkoutRows = checkoutsPage.items.map(mapCheckoutToRow);

        setRows((prev) => {
          if (!append) {
            return [...orderCacheRef.current, ...checkoutRows].sort(
              (a, b) =>
                new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0)
            );
          }
          const seen = new Set(prev.map(rowKey));
          return [
            ...prev,
            ...checkoutRows.filter((r) => !seen.has(rowKey(r))),
          ];
        });
        setPage(pageNum);
        setHasMore(Boolean(checkoutsPage.hasMore));
      } catch (error) {
        if (gen !== fetchGen.current) return;
        console.error("Error fetching abandoned list:", error);
        toast.error("Failed to load abandoned carts");
        if (!append) setRows([]);
        setHasMore(false);
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [viewFilter, datePreset, debouncedQ]
  );

  useEffect(() => {
    setRowSelection({});
    fetchPage(1, { append: false });
  }, [fetchPage]);

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
        if (item.kind !== "checkout" || item.recoveryUrl) return item;
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
        Date: item.lastActivityAt
          ? new Date(item.lastActivityAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "",
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
    <AdminListLayout fill={false} title="Abandoned carts">
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
                onChange={setViewFilter}
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
              <AdminDateRangeButton value={datePreset} onChange={setDatePreset} />
            </>
          )
        }
      />
    </AdminListLayout>
  );
}
