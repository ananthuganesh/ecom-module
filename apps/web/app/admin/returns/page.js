"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminReturnsService } from "@/api";
import { adminOrderHref } from "@/utils/formatOrderNumber";
import { userErrorMessage } from "@/lib/userMessage";
import { toast } from "sonner";
import { Check, Loader2, PackageCheck, Search, X } from "lucide-react";
import { ReturnArrow } from "@/components/admin/LocalIcons";
import {
  AdminListLayout,
  AdminHeaderButton,
  AdminViewMenu,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createReturnColumns, isMutedReturnRow } from "./columns";

const PAGE_SIZE = 25;

const RETURN_VIEWS = [
  { value: "all", label: "All" },
  { value: "requested", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "picked_up", label: "Picked up" },
  { value: "received", label: "Received" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminReturnsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status") || "all";
  const qFromUrl = searchParams.get("q") || "";

  const [returns, setReturns] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [viewFilter, setViewFilter] = useState(statusFromUrl);
  const [searchQ, setSearchQ] = useState(qFromUrl);
  const [debouncedQ, setDebouncedQ] = useState(qFromUrl);
  const [sortBy, setSortBy] = useState("date");
  const [rowSelection, setRowSelection] = useState({});
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const fetchGen = useRef(0);

  const columns = useMemo(() => createReturnColumns(), []);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const selectedRows = useMemo(
    () => returns.filter((row) => selectedIds.includes(row._id)),
    [returns, selectedIds]
  );

  const canApprove = selectedRows.some((row) => row.status === "requested");
  const canReceive = selectedRows.some((row) =>
    ["approved", "picked_up"].includes(row.status)
  );

  useEffect(() => {
    setViewFilter(statusFromUrl);
    setSearchQ(qFromUrl);
    setDebouncedQ(qFromUrl);
  }, [statusFromUrl, qFromUrl]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const fetchPage = useCallback(
    async (pageNum, { append = false } = {}) => {
      const gen = ++fetchGen.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await adminReturnsService.list({
          status: viewFilter,
          q: debouncedQ,
          page: pageNum,
          pageSize: PAGE_SIZE,
        });
        if (gen !== fetchGen.current) return;
        const rows = data?.returns || [];
        setReturns((prev) => (append ? [...prev, ...rows] : rows));
        setPendingCount(data?.pendingCount || 0);
        setHasMore(pageNum < (data?.pages || 1));
        setPage(pageNum);
      } catch (error) {
        if (gen !== fetchGen.current) return;
        toast.error(userErrorMessage(error, "Couldn’t load returns"));
        if (!append) setReturns([]);
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [viewFilter, debouncedQ]
  );

  useEffect(() => {
    fetchPage(1, { append: false });
  }, [fetchPage]);

  const handleViewChange = (value) => {
    setViewFilter(value);
    setRowSelection({});
    const params = new URLSearchParams();
    if (value && value !== "all") params.set("status", value);
    if (qFromUrl.trim()) params.set("q", qFromUrl.trim());
    const qs = params.toString();
    router.replace(qs ? `/admin/returns?${qs}` : "/admin/returns");
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchPage(page + 1, { append: true });
  };

  const applyUpdated = (updated) => {
    if (!updated?._id) return;
    setReturns((prev) => prev.map((row) => (row._id === updated._id ? updated : row)));
  };

  const runBulk = async (rows, action, describe) => {
    setIsBulkLoading(true);
    let ok = 0;
    const problems = [];
    for (const row of rows) {
      try {
        const result = await action(row);
        applyUpdated(result?.return);
        ok += 1;
        const warning = describe?.(result, row);
        if (warning) problems.push(warning);
      } catch (error) {
        problems.push(`${row.number}: ${userErrorMessage(error, "failed")}`);
      }
    }
    setIsBulkLoading(false);
    setRowSelection({});
    if (ok) toast.success(`${ok} return${ok === 1 ? "" : "s"} updated`);
    if (problems.length) toast.error(problems[0]);
    fetchPage(1, { append: false });
  };

  const handleApprove = () =>
    runBulk(
      selectedRows.filter((row) => row.status === "requested"),
      (row) => adminReturnsService.approve(row._id),
      (result, row) =>
        result?.pickupBooked
          ? null
          : `${row.number}: Delhivery can’t collect — arrange pickup manually`
    );

  const handleReceived = () =>
    runBulk(
      selectedRows.filter((row) => ["approved", "picked_up"].includes(row.status)),
      (row) => adminReturnsService.markReceived(row._id),
      (result, row) =>
        result?.restockErrors?.length ? `${row.number}: ${result.restockErrors[0]}` : null
    );

  const handleReject = async () => {
    setRejectOpen(false);
    await runBulk(
      selectedRows.filter((row) => ["requested", "approved"].includes(row.status)),
      (row) => adminReturnsService.reject(row._id, rejectReason)
    );
    setRejectReason("");
  };

  const pageTitle = useMemo(
    () => (pendingCount > 0 ? `Returns · ${pendingCount} pending` : "Returns"),
    [pendingCount]
  );

  return (
    <AdminListLayout fill={false} title={pageTitle} icon={ReturnArrow}>
      <DataTable
        columns={columns}
        data={returns}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        getRowId={(row) => row._id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={(row) =>
          router.push(adminOrderHref({ _id: row.orderId, orderNumber: row.orderNumber }))
        }
        showSelectionCount={false}
        infiniteScroll
        rowHeightClass="h-8"
        columnsMenuSortOptions={[
          { value: "date", label: "Date" },
          { value: "customer", label: "Customer" },
          { value: "status", label: "Status" },
          { value: "refund", label: "Refund due" },
        ]}
        columnsMenuSortValue={sortBy}
        onColumnsMenuSortChange={setSortBy}
        getRowClassName={(row) =>
          isMutedReturnRow(row) ? "text-muted-foreground" : undefined
        }
        emptyTitle="No matching returns"
        emptyDescription="Try a different search or clear your filters."
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
                <AdminHeaderButton
                  variant="outline"
                  disabled={isBulkLoading || !canApprove}
                  onClick={handleApprove}
                >
                  {isBulkLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Approve
                </AdminHeaderButton>
                <AdminHeaderButton
                  variant="outline"
                  disabled={isBulkLoading || !canReceive}
                  onClick={handleReceived}
                >
                  <PackageCheck className="w-3.5 h-3.5" /> Mark received
                </AdminHeaderButton>
                <AdminHeaderButton
                  variant="outline"
                  disabled={isBulkLoading}
                  onClick={() => setRejectOpen(true)}
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </AdminHeaderButton>
              </div>
            </>
          ) : (
            <>
              <AdminViewMenu
                value={viewFilter}
                onChange={handleViewChange}
                options={RETURN_VIEWS}
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
            </>
          )
        }
      />

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reject {selectedIds.length} return{selectedIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The customer keeps the items and they become returnable again. Give a reason so
              support can explain the decision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason, e.g. worn beyond resale"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them open</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject}>Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminListLayout>
  );
}
