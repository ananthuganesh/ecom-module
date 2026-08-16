"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { adminOrderService } from "@/api";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DataTable } from "@/components/ui/data-table";
import { recentOrderColumns } from "@/components/admin/dashboard/recent-order-columns";
import { bestSellingColumns } from "@/components/admin/dashboard/best-selling-columns";
import ChannelPerformanceCard from "@/components/admin/dashboard/ChannelPerformanceCard";
import NeedsAttentionCard from "@/components/admin/dashboard/NeedsAttentionCard";
import KpiCard, { bucketSeries } from "@/components/admin/dashboard/KpiCard";
import DashboardSkeleton from "@/components/admin/dashboard/DashboardSkeleton";
import {
  IndianRupee,
  Percent,
  Repeat,
  ShoppingBag,
  UserPlus,
  Wallet,
} from "lucide-react";
import { AdminDateRangeButton } from "@/components/admin/list";
import { useAdminDashboardStore } from "@/store/useAdminDashboardStore";

const RANGE_OPTIONS = [
  { value: "7days", api: "7d", label: "Last 7 days" },
  { value: "30days", api: "30d", label: "Last 30 days" },
  { value: "90days", api: "90d", label: "Last 90 days" },
  { value: "12months", api: "365d", label: "Last 12 months" },
];

const chartConfig = {
  metrics: {
    label: "Metrics",
  },
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
  orders: {
    label: "Orders",
    color: "var(--chart-2)",
  },
  aov: {
    label: "AOV",
    color: "var(--chart-3)",
  },
};

const LOCATION_COLORS = [
  "var(--foreground)",
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--muted-foreground)",
];

function formatINR(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatTrend(current, previous) {
  const now = Number(current) || 0;
  const before = Number(previous) || 0;
  if (!before) return now ? "+100.0%" : "+0%";
  const change = ((now - before) / before) * 100;
  if (!change) return "+0%";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function formatDayLabel(value, withYear = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return withYear ? String(value) : String(value).slice(5);
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function titleCase(value) {
  return String(value).replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function dashboardRangeKey(dateFilter, rangeMeta, isCustomRange) {
  if (isCustomRange) {
    return `custom:${dateFilter.from}:${dateFilter.to || dateFilter.from}`;
  }
  return rangeMeta.api;
}

function periodCopy(dateFilter, rangeMeta, isCustomRange) {
  if (!isCustomRange) {
    return {
      comparedTo: dateFilter.preset === "12months"
        ? "previous 12 months"
        : `previous ${String(dateFilter.preset).replace("days", " days")}`,
      period: rangeMeta.label.toLowerCase(),
    };
  }
  const from = dateFilter.from || "";
  const to = dateFilter.to || dateFilter.from || "";
  return {
    comparedTo: "previous period",
    period: from && to && from !== to ? `${from} – ${to}` : from || "custom range",
  };
}

export default function AdminDashboardPage() {
  const [dateFilter, setDateFilter] = useState(
    () => useAdminDashboardStore.getState().dateFilter || { preset: "7days" }
  );
  const [statsData, setStatsData] = useState(() => useAdminDashboardStore.getState().statsData);
  const [recentOrders, setRecentOrders] = useState(
    () => useAdminDashboardStore.getState().recentOrders || []
  );
  const [attentionCounts, setAttentionCounts] = useState(
    () => useAdminDashboardStore.getState().attentionCounts
  );
  const [loading, setLoading] = useState(() => !useAdminDashboardStore.getState().statsData);
  const [activeChart, setActiveChart] = useState("revenue");

  const isCustomRange = dateFilter.preset === "custom" && Boolean(dateFilter.from);
  const rangeMeta = RANGE_OPTIONS.find((o) => o.value === dateFilter.preset) || RANGE_OPTIONS[0];
  const rangeKey = dashboardRangeKey(dateFilter, rangeMeta, isCustomRange);
  const { comparedTo: rangeLabel, period: periodLabel } = periodCopy(
    dateFilter,
    rangeMeta,
    isCustomRange
  );

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastLoadedAt = 0;

    const statsParams = isCustomRange
      ? { dateFrom: dateFilter.from, dateTo: dateFilter.to || dateFilter.from }
      : { range: rangeMeta.api };

    const load = async ({ silent = false } = {}) => {
      if (inFlight) return;
      if (silent && Date.now() - lastLoadedAt < 8_000) return;
      inFlight = true;
      if (!silent) setLoading(true);
      try {
        const [stats, orders, counts] = await Promise.all([
          adminOrderService.getStats(statsParams),
          adminOrderService.getAll({ limit: 5 }),
          adminOrderService.getCounts().catch(() => null),
        ]);
        if (cancelled) return;
        lastLoadedAt = Date.now();
        const list = Array.isArray(orders)
          ? orders
          : Array.isArray(orders?.items)
            ? orders.items
            : Array.isArray(orders?.data)
              ? orders.data
              : [];
        const recent = list.slice(0, 5);
        setStatsData(stats);
        setAttentionCounts(counts || null);
        setRecentOrders(recent);
        useAdminDashboardStore.getState().saveSnapshot({
          cacheKey: rangeKey,
          statsData: stats,
          recentOrders: recent,
          attentionCounts: counts || null,
          dateFilter,
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        if (!cancelled && !silent) toast.error("Failed to load dashboard data");
      } finally {
        inFlight = false;
        if (!cancelled && !silent) setLoading(false);
      }
    };

    const cached = useAdminDashboardStore.getState();
    load({ silent: cached.cacheKey === rangeKey && Boolean(cached.statsData) });

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") load({ silent: true });
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    const pollId = window.setInterval(refreshIfVisible, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [isCustomRange, dateFilter, rangeMeta.api, rangeKey]);

  const paid = Number(statsData?.paidOrders ?? 0);
  const revenue = Number(statsData?.totalRevenue ?? 0);
  const avgOrderValue = Number(
    statsData?.avgOrderValue ?? (paid ? revenue / paid : 0)
  );
  const abandoned = Number(statsData?.abandonedOrders ?? 0);
  const conversionRate = paid + abandoned ? (paid / (paid + abandoned)) * 100 : 0;
  const prevPaid = Number(statsData?.previous?.paidOrders ?? 0);
  const prevAbandoned = Number(statsData?.previous?.abandonedOrders ?? 0);
  const prevConversion =
    prevPaid + prevAbandoned ? (prevPaid / (prevPaid + prevAbandoned)) * 100 : 0;

  const seriesData = useMemo(
    () =>
      (statsData?.series ?? []).map((point) => {
        const pointRevenue = Number(point.revenue) || 0;
        const pointOrders = Number(point.orders) || 0;
        return {
          date: point.date,
          revenue: pointRevenue,
          orders: pointOrders,
          aov: pointOrders ? pointRevenue / pointOrders : 0,
        };
      }),
    [statsData?.series]
  );

  const chartData = useMemo(() => {
    if (seriesData.length <= 60) return seriesData;
    const step = Math.ceil(seriesData.length / 48);
    return seriesData.filter((_, index) => index % step === 0);
  }, [seriesData]);

  const sparkOrders = useMemo(() => bucketSeries(seriesData, "orders"), [seriesData]);
  const sparkRevenue = useMemo(() => bucketSeries(seriesData, "revenue"), [seriesData]);
  const sparkAov = useMemo(() => bucketSeries(seriesData, "aov"), [seriesData]);

  const performanceTotals = {
    revenue,
    orders: paid,
    aov: avgOrderValue,
  };

  const locationData = useMemo(() => {
    const merged = new Map();
    for (const row of statsData?.byLocation ?? []) {
      const raw = String(row.location || "").trim();
      if (!raw || raw.toLowerCase() === "unknown") continue;
      const location = titleCase(raw);
      const prev = merged.get(location) || { location, sales: 0, orders: 0 };
      prev.sales += Number(row.sales) || 0;
      prev.orders += Number(row.orders) || 0;
      merged.set(location, prev);
    }
    return [...merged.values()]
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)
      .map((row, index) => ({
        ...row,
        color: LOCATION_COLORS[index] || LOCATION_COLORS[4],
      }));
  }, [statsData?.byLocation]);

  const bestSelling = useMemo(() => {
    return (statsData?.topProducts ?? []).slice(0, 5).map((row, index) => ({
      id: row.productId || `product-${index}`,
      name: row.name || "Product",
      image: row.image || "",
      quantity: Number(row.quantity) || 0,
      revenue: Number(row.revenue) || 0,
    }));
  }, [statsData?.topProducts]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          Dashboard
        </h2>
        <AdminDateRangeButton
          value={dateFilter}
          onChange={(next) => {
            const value = {
              preset: next?.preset || "7days",
              from: next?.from,
              to: next?.to,
            };
            setDateFilter(value);
            useAdminDashboardStore.getState().setDateFilter(value);
          }}
          presets={RANGE_OPTIONS}
          allowCustom
        />
      </div>

      {loading && !statsData ? (
        <DashboardSkeleton rangeLabel={rangeLabel} periodLabel={periodLabel} />
      ) : (
        <>
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <KpiCard
          title="Total revenue"
          icon={IndianRupee}
          value={`₹${formatINR(revenue)}`}
          change={statsData?.trends?.revenue}
          comparedTo={rangeLabel}
          sparkline={sparkRevenue}
        />
        <KpiCard
          title="Orders"
          icon={ShoppingBag}
          value={paid.toLocaleString("en-IN")}
          change={statsData?.trends?.orders}
          comparedTo={rangeLabel}
          sparkline={sparkOrders}
        />
        <KpiCard
          title="Average order value"
          icon={Wallet}
          value={`₹${formatINR(avgOrderValue)}`}
          change={statsData?.trends?.avgValue}
          comparedTo={rangeLabel}
          sparkline={sparkAov}
        />
        <KpiCard
          title="Conversion rate"
          icon={Percent}
          value={`${conversionRate.toFixed(1)}%`}
          change={formatTrend(conversionRate, prevConversion)}
          comparedTo={rangeLabel}
          sparkline={sparkOrders}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-2">
        <Card className="@container/card flex min-h-0 flex-col lg:col-span-2 lg:row-span-2">
          <CardHeader>
            <CardTitle>Performance overview</CardTitle>
            <CardDescription>vs {rangeLabel}</CardDescription>
            <CardAction>
              <div className="flex overflow-hidden rounded-lg ring-1 ring-foreground/10">
                {["revenue", "orders", "aov"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    data-active={activeChart === key}
                    className="flex min-w-[4.75rem] flex-col items-start gap-0.5 px-2.5 py-1.5 text-left data-[active=true]:bg-muted/50"
                    onClick={() => setActiveChart(key)}
                  >
                    <span className="text-xs text-muted-foreground">
                      {chartConfig[key].label}
                    </span>
                    <span className="text-sm font-semibold leading-none tabular-nums">
                      {key === "orders"
                        ? performanceTotals.orders.toLocaleString("en-IN")
                        : `₹${formatINR(performanceTotals[key])}`}
                    </span>
                  </button>
                ))}
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            {chartData.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                No sales in this period.
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="aspect-auto min-h-0 w-full flex-1">
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ left: 8, right: 8, top: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="performanceBarFade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={`var(--color-${activeChart})`} stopOpacity={1} />
                      <stop offset="100%" stopColor={`var(--color-${activeChart})`} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    height={22}
                    minTickGap={32}
                    tickFormatter={(value) => formatDayLabel(value)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="w-[150px]"
                        nameKey="metrics"
                        labelFormatter={(value) => formatDayLabel(value, true)}
                        formatter={(value) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">
                              {chartConfig[activeChart]?.label || activeChart}
                            </span>
                            <span className="font-medium tabular-nums text-foreground">
                              {activeChart === "orders"
                                ? Number(value).toLocaleString("en-IN")
                                : `₹${formatINR(value)}`}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey={activeChart}
                    fill="url(#performanceBarFade)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <KpiCard
          title="New customers"
          icon={UserPlus}
          value={Number(statsData?.newCustomers || 0).toLocaleString("en-IN")}
          change={statsData?.trends?.customers}
          comparedTo={rangeLabel}
          sparkline={sparkOrders}
        />
        <KpiCard
          title="Returning customers"
          icon={Repeat}
          value={Number(statsData?.returningCustomers || 0).toLocaleString("en-IN")}
          change={statsData?.trends?.returningCustomers}
          comparedTo={rangeLabel}
          sparkline={sparkOrders}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex h-full flex-col @container/card">
          <CardHeader>
            <CardTitle>Sales by Location</CardTitle>
            <CardDescription>
              Top 5 cities · {periodLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {locationData.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                No location data in this period.
              </div>
            ) : (
              <ul className="space-y-3">
                {locationData.map((row) => {
                  const aov = row.orders ? Math.round(row.sales / row.orders) : 0;
                  return (
                    <li key={row.location} className="flex items-start gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                            aria-hidden
                          />
                          <span className="font-heading text-sm font-medium text-foreground">
                            {row.location}
                          </span>
                        </div>
                        <div className="mt-1 pl-[18px] text-xs text-muted-foreground">
                          {row.orders.toLocaleString("en-IN")} orders · ₹{formatINR(row.sales)} · ₹
                          {formatINR(aov)} AOV
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <ChannelPerformanceCard
          channels={statsData?.channelPerformance}
          fallbackChannels={statsData?.channels}
          description={`Checkout sources · ${periodLabel}`}
        />

        <NeedsAttentionCard counts={attentionCounts} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="@container/card min-w-0">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest store orders</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <DataTable
              columns={recentOrderColumns}
              data={recentOrders}
              pageSize={5}
              showFooter={false}
              showToolbar={false}
              showColumnsMenu={false}
              loading={loading}
              emptyTitle="No recent orders"
              emptyDescription="New orders will show up here."
              className="gap-2"
              tableClassName="min-w-0 table-fixed"
            />
          </CardContent>
        </Card>

        <Card className="@container/card min-w-0">
          <CardHeader>
            <CardTitle>Best Selling Products</CardTitle>
            <CardDescription>
              Top products · {periodLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <DataTable
              columns={bestSellingColumns}
              data={bestSelling}
              pageSize={5}
              showFooter={false}
              showToolbar={false}
              showColumnsMenu={false}
              loading={loading}
              emptyTitle="No product sales"
              emptyDescription="Top sellers will show up here."
              className="gap-2"
              tableClassName="min-w-0 table-fixed"
            />
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
