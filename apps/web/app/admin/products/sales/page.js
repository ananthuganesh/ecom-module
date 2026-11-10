"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "@/components/icons";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userMessage";
import { adminErpService } from "@/api";
import {
  AdminListLayout,
  AdminMetricRow,
  AdminViewMenu,
  AdminHeaderButton,
} from "@/components/admin/list";
import { Package } from "@/components/admin/LocalIcons";
import { DataTable } from "@/components/ui/data-table";
import { formatINR } from "@/utils/formatINR";
import { adminProductHref } from "@/utils/formatProductUrl";
import { downloadCsv, rowsToCsv } from "@/utils/downloadCsv";
import {
  SALES_CSV_HEADERS,
  SALES_RANGE_PRESETS,
  filterSalesRows,
  rangeError,
  rangeForPreset,
  reportParams,
  salesCsvFilename,
  salesCsvRows,
} from "@/lib/productSalesReport";
import { createSalesColumns } from "./columns";

const DATE_INPUT =
  "h-8 rounded-lg border border-border bg-card px-2 text-[13px] text-foreground focus:outline-none";

export default function ProductSalesReportPage() {
  const router = useRouter();
  const [preset, setPreset] = useState("30d");
  const [range, setRange] = useState(() => rangeForPreset("30d"));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(async (nextRange) => {
    const problem = rangeError(nextRange);
    if (problem) {
      toast.error(problem);
      return;
    }
    setLoading(true);
    try {
      setReport(await adminErpService.reports.productSales(reportParams(nextRange)));
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t load the sales report"));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const choosePreset = (value) => {
    setPreset(value);
    const next = rangeForPreset(value);
    // "Custom" keeps the current dates as a starting point.
    if (next) setRange(next);
  };

  const setCustomBound = (key, value) => {
    setPreset("custom");
    setRange((prev) => ({ ...prev, [key]: value || null }));
  };

  const rows = useMemo(() => report?.items || [], [report]);
  const filtered = useMemo(() => filterSalesRows(rows, searchTerm), [rows, searchTerm]);
  const totals = report?.totals || {};
  const columns = useMemo(() => createSalesColumns(), []);

  const exportCsv = () => {
    if (!filtered.length) {
      toast.message("Nothing to export for this period");
      return;
    }
    downloadCsv(salesCsvFilename(range), rowsToCsv(SALES_CSV_HEADERS, salesCsvRows(filtered)));
  };

  return (
    <AdminListLayout
      fill={false}
      title="Sales by product"
      icon={Package}
      description="Pieces sold per product on paid orders placed in the selected period (India time). Cancelled and abandoned orders are excluded; returns are shown separately."
      actions={
        <AdminHeaderButton onClick={exportCsv} disabled={loading}>
          <Download className="size-3.5" />
          Export CSV
        </AdminHeaderButton>
      }
      metrics={
        <AdminMetricRow
          items={[
            {
              value: Number(totals.unitsSold || 0).toLocaleString("en-IN"),
              label: "Pieces sold",
              tone: "blue",
            },
            {
              value: Number(totals.netUnits || 0).toLocaleString("en-IN"),
              label: `Net of ${Number(totals.returnedUnits || 0).toLocaleString("en-IN")} returned`,
              tone: "violet",
            },
            {
              value: Number(totals.orders || 0).toLocaleString("en-IN"),
              label: "Paid orders",
              tone: "amber",
            },
            {
              value: formatINR(totals.grossSales || 0),
              label: "Gross sales",
              tone: "rose",
            },
          ]}
        />
      }
    >
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        getRowId={(row) => row.productId || row.productName}
        onRowClick={(row) => {
          if (row.inCatalog && row.productId) {
            router.push(adminProductHref({ _id: row.productId, productUrlId: row.productUrlId }));
          }
        }}
        showSelectionCount={false}
        infiniteScroll
        rowHeightClass="h-14"
        pageSize={50}
        emptyTitle="No sales in this period"
        emptyDescription="Try a longer date range. Only paid orders count."
        toolbar={
          <>
            <AdminViewMenu value={preset} onChange={choosePreset} options={SALES_RANGE_PRESETS} />
            <div className="flex shrink-0 items-center gap-1.5">
              <input
                type="date"
                aria-label="From"
                value={range?.from || ""}
                max={range?.to || undefined}
                onChange={(e) => setCustomBound("from", e.target.value)}
                className={DATE_INPUT}
              />
              <span className="text-[13px] text-muted-foreground">to</span>
              <input
                type="date"
                aria-label="To"
                value={range?.to || ""}
                min={range?.from || undefined}
                onChange={(e) => setCustomBound("to", e.target.value)}
                className={DATE_INPUT}
              />
            </div>
            <form className="relative min-w-0 flex-1" onSubmit={(e) => e.preventDefault()}>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search product, size or colour"
                className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
              />
            </form>
          </>
        }
      />
    </AdminListLayout>
  );
}
