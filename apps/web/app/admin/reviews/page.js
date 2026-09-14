"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminReviewsService } from "@/api";
import { userErrorMessage } from "@/lib/userMessage";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Search } from "lucide-react";
import { Package } from "@/components/admin/LocalIcons";
import {
  AdminListLayout,
  AdminHeaderButton,
  AdminViewMenu,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import { createReviewColumns, isMutedReviewRow } from "./columns";

const PAGE_SIZE = 25;

const REVIEW_VIEWS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

const RATING_VIEWS = [
  { value: "", label: "Any rating" },
  { value: "5", label: "5 stars" },
  { value: "4", label: "4 stars" },
  { value: "3", label: "3 stars" },
  { value: "2", label: "2 stars" },
  { value: "1", label: "1 star" },
];

export default function AdminReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status") || "all";
  const ratingFromUrl = searchParams.get("rating") || "";

  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [viewFilter, setViewFilter] = useState(statusFromUrl);
  const [ratingFilter, setRatingFilter] = useState(ratingFromUrl);
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [rowSelection, setRowSelection] = useState({});
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const fetchGen = useRef(0);

  const columns = useMemo(() => createReviewColumns(), []);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );
  const selectedRows = useMemo(
    () => reviews.filter((row) => selectedIds.includes(row._id)),
    [reviews, selectedIds]
  );
  const canHide = selectedRows.some((row) => row.status !== "hidden");
  const canPublish = selectedRows.some((row) => row.status === "hidden");

  useEffect(() => {
    setViewFilter(statusFromUrl);
    setRatingFilter(ratingFromUrl);
  }, [statusFromUrl, ratingFromUrl]);

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
        const data = await adminReviewsService.list({
          status: viewFilter,
          rating: ratingFilter,
          q: debouncedQ,
          page: pageNum,
          pageSize: PAGE_SIZE,
        });
        if (gen !== fetchGen.current) return;
        const rows = data?.reviews || [];
        setReviews((prev) => (append ? [...prev, ...rows] : rows));
        setTotal(data?.total || 0);
        setHasMore(pageNum < (data?.pages || 1));
        setPage(pageNum);
      } catch (error) {
        if (gen !== fetchGen.current) return;
        toast.error(userErrorMessage(error, "Couldn’t load reviews"));
        if (!append) setReviews([]);
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [viewFilter, ratingFilter, debouncedQ]
  );

  useEffect(() => {
    fetchPage(1, { append: false });
  }, [fetchPage]);

  const replaceUrl = (status, rating) => {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (rating) params.set("rating", rating);
    const qs = params.toString();
    router.replace(qs ? `/admin/reviews?${qs}` : "/admin/reviews");
  };

  const handleViewChange = (value) => {
    setViewFilter(value);
    setRowSelection({});
    replaceUrl(value, ratingFilter);
  };

  const handleRatingChange = (value) => {
    setRatingFilter(value);
    setRowSelection({});
    replaceUrl(viewFilter, value);
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchPage(page + 1, { append: true });
  };

  const runBulk = async (rows, action, verb) => {
    setIsBulkLoading(true);
    let ok = 0;
    const problems = [];
    for (const row of rows) {
      try {
        await action(row._id);
        ok += 1;
      } catch (error) {
        problems.push(userErrorMessage(error, `Couldn’t update a review`));
      }
    }
    setIsBulkLoading(false);
    setRowSelection({});
    if (ok) toast.success(`${ok} review${ok === 1 ? "" : "s"} ${verb}`);
    if (problems.length) toast.error(problems[0]);
    fetchPage(1, { append: false });
  };

  const handleHide = () =>
    runBulk(
      selectedRows.filter((row) => row.status !== "hidden"),
      adminReviewsService.hide,
      "hidden"
    );

  const handlePublish = () =>
    runBulk(
      selectedRows.filter((row) => row.status === "hidden"),
      adminReviewsService.publish,
      "published"
    );

  const pageTitle = total > 0 ? `Reviews · ${total}` : "Reviews";

  return (
    <AdminListLayout fill={false} title={pageTitle} icon={Package}>
      <DataTable
        columns={columns}
        data={reviews}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        getRowId={(row) => row._id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        showSelectionCount={false}
        infiniteScroll
        rowHeightClass="h-8"
        columnsMenuSortOptions={[
          { value: "date", label: "Date" },
          { value: "rating", label: "Rating" },
          { value: "product", label: "Product" },
        ]}
        columnsMenuSortValue={sortBy}
        onColumnsMenuSortChange={setSortBy}
        getRowClassName={(row) =>
          isMutedReviewRow(row) ? "text-muted-foreground" : undefined
        }
        emptyTitle="No matching reviews"
        emptyDescription="Reviews appear here as verified buyers post them."
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
                  disabled={isBulkLoading || !canHide}
                  onClick={handleHide}
                >
                  {isBulkLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  Hide
                </AdminHeaderButton>
                <AdminHeaderButton
                  variant="outline"
                  disabled={isBulkLoading || !canPublish}
                  onClick={handlePublish}
                >
                  <Eye className="w-3.5 h-3.5" /> Publish
                </AdminHeaderButton>
              </div>
            </>
          ) : (
            <>
              <AdminViewMenu
                value={viewFilter}
                onChange={handleViewChange}
                options={REVIEW_VIEWS}
              />
              <AdminViewMenu
                value={ratingFilter}
                onChange={handleRatingChange}
                options={RATING_VIEWS}
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
                  placeholder="Search review text or customer"
                  className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
                />
              </form>
            </>
          )
        }
      />
    </AdminListLayout>
  );
}
