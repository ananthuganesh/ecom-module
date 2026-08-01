"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Label, LabelList, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart, XAxis, YAxis } from "recharts";
import { adminOrderService } from "@/api";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DataTable } from "@/components/ui/data-table";
import { recentOrderColumns } from "@/components/admin/dashboard/recent-order-columns";
import { bestSellingColumns } from "@/components/admin/dashboard/best-selling-columns";
import { Spinner } from "@/components/ui/spinner";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { AdminDateRangeButton } from "@/components/admin/list";

const RANGE_OPTIONS = [
  { value: "7days", api: "7d", label: "Last 7 days" },
  { value: "30days", api: "30d", label: "Last 30 days" },
  { value: "90days", api: "90d", label: "Last 90 days" },
  { value: "12months", api: "365d", label: "Last 12 months" },
];

const RANGE_PRESETS = RANGE_OPTIONS.map(({ value, label }) => ({ value, label }));

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
};

const locationChartConfig = {
  sales: {
    label: "Sales",
    color: "var(--foreground)",
  },
  label: {
    color: "var(--background)",
  },
};

const revenueChartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
};

const radialChartConfig = {
  rate: {
    label: "Abandoned rate",
  },
  abandoned: {
    label: "Abandoned",
    color: "var(--chart-2)",
  },
};

function TrendBadge({ change }) {
  const raw = typeof change === "string" ? change : "+0%";
  const negative = raw.startsWith("-");
  const Icon = negative ? TrendingDownIcon : TrendingUpIcon;
  return (
    <Badge variant="outline">
      <Icon />
      {raw.replace(/^[+-]/, "")}
    </Badge>
  );
}

function formatINR(value, compact = false) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  });
}

export default function AdminDashboardPage() {
  const [timeRange, setTimeRange] = useState("30days");
  const [statsData, setStatsData] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState("revenue");

  const rangeMeta = RANGE_OPTIONS.find((o) => o.value === timeRange) || RANGE_OPTIONS[1];
  const rangeLabel =
    timeRange === "12months" ? "previous 12 months" : `previous ${timeRange.replace("days", " days")}`;

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [stats, orders] = await Promise.all([
          adminOrderService.getStats({ range: rangeMeta.api }),
          adminOrderService.getAll({ limit: 5 }),
        ]);
        if (!cancelled) {
          setStatsData(stats);
          const list = Array.isArray(orders)
            ? orders
            : Array.isArray(orders?.items)
              ? orders.items
              : Array.isArray(orders?.data)
                ? orders.data
                : [];
          setRecentOrders(list.slice(0, 5));
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        if (!cancelled) toast.error("Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [rangeMeta.api]);

  const paid = Number(statsData?.paidOrders ?? 0);
  const revenue = Number(statsData?.totalRevenue ?? 0);
  const customers = Number(statsData?.totalCustomers ?? 0);
  const abandoned = Number(statsData?.abandonedOrders ?? 0);
  const abandonedRate = Number(statsData?.abandonedRate ?? 0);
  const prev = statsData?.previous || {};
  const radialRate = Math.max(0, Math.min(100, abandonedRate));
  const radialData = [
    {
      name: "abandoned",
      rate: radialRate,
      fill: "var(--color-abandoned)",
    },
  ];
  const radialEndAngle = Math.max(12, (radialRate / 100) * 360);

  const chartData = useMemo(() => {
    const series = statsData?.series ?? [];
    if (series.length > 60) {
      const step = Math.ceil(series.length / 48);
      return series.filter((_, i) => i % step === 0);
    }
    return series;
  }, [statsData?.series]);

  const performanceTotals = useMemo(
    () => ({
      revenue: chartData.reduce((acc, curr) => acc + (Number(curr.revenue) || 0), 0),
      orders: chartData.reduce((acc, curr) => acc + (Number(curr.orders) || 0), 0),
    }),
    [chartData]
  );

  const locationData = useMemo(() => {
    return (statsData?.byLocation ?? []).map((row) => ({
      location: row.location,
      sales: Number(row.sales) || 0,
      orders: Number(row.orders) || 0,
    }));
  }, [statsData?.byLocation]);

  const bestSelling = useMemo(() => {
    return (statsData?.topProducts ?? []).slice(0, 5).map((row, index) => ({
      id: row.productId || `product-${index}`,
      productId: row.productId || "",
      name: row.name || "Product",
      quantity: Number(row.quantity) || 0,
      revenue: Number(row.revenue) || 0,
    }));
  }, [statsData?.topProducts]);

  const revenueBars = useMemo(() => {
    const series = statsData?.series ?? [];
    if (!series.length) return [];

    if (series.length <= 14) {
      return series.map((point) => ({
        label: String(point.date).slice(5),
        revenue: Number(point.revenue) || 0,
      }));
    }

    const byMonth = new Map();
    for (const point of series) {
      const key = String(point.date).slice(0, 7);
      byMonth.set(key, (byMonth.get(key) || 0) + (Number(point.revenue) || 0));
    }
    return [...byMonth.entries()].map(([key, value]) => ({
      label: key.slice(5),
      revenue: value,
    }));
  }, [statsData?.series]);

  if (loading && !statsData) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
            Sales overview
          </h2>
          <p className="text-[0.8125rem] font-[450] leading-5 text-[#616161]">
            Your current sales summary and activity
          </p>
        </div>
        <AdminDateRangeButton
          value={{ preset: timeRange }}
          onChange={(next) => setTimeRange(next.preset)}
          presets={RANGE_PRESETS}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Total sales</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-4xl">
              {paid.toLocaleString("en-IN")}
            </CardTitle>
            <CardAction>
              <TrendBadge change={statsData?.trends?.orders} />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Paid orders this period
            </div>
            <div className="text-muted-foreground">
              Last period: {(prev.paidOrders ?? 0).toLocaleString("en-IN")}
            </div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>New customers</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-4xl">
              {customers.toLocaleString("en-IN")}
            </CardTitle>
            <CardAction>
              <TrendBadge change={statsData?.trends?.customers} />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Customer acquisition
            </div>
            <div className="text-muted-foreground">
              Last period: {(prev.customers ?? 0).toLocaleString("en-IN")}
            </div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Abandoned cart rate</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-4xl">
              {abandonedRate.toFixed(1)}%
            </CardTitle>
            <CardAction>
              <TrendBadge change={statsData?.trends?.abandonedRate} />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {abandoned.toLocaleString("en-IN")} abandoned carts
            </div>
            <div className="text-muted-foreground">
              Last period: {Number(prev.abandonedRate ?? 0).toFixed(1)}%
            </div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Total revenue</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-4xl">
              ₹{formatINR(revenue)}
            </CardTitle>
            <CardAction>
              <TrendBadge change={statsData?.trends?.revenue} />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Revenue this period
            </div>
            <div className="text-muted-foreground">
              Last period: ₹{formatINR(prev.revenue ?? 0)}
            </div>
          </CardFooter>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="py-0 @container/card lg:col-span-2">
          <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
            <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-0!">
              <CardTitle>Performance overview</CardTitle>
              <CardDescription>vs {rangeLabel}</CardDescription>
            </div>
            <div className="flex">
              {["revenue", "orders"].map((key) => (
                <button
                  key={key}
                  type="button"
                  data-active={activeChart === key}
                  className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
                  onClick={() => setActiveChart(key)}
                >
                  <span className="text-xs text-muted-foreground">
                    {chartConfig[key].label}
                  </span>
                  <span className="text-lg leading-none font-bold tabular-nums sm:text-2xl">
                    {key === "revenue"
                      ? `₹${formatINR(performanceTotals.revenue)}`
                      : performanceTotals.orders.toLocaleString("en-IN")}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:p-6">
            {chartData.length === 0 ? (
              <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
                No sales in this period.
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ left: 12, right: 12 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      if (Number.isNaN(date.getTime())) return String(value).slice(5);
                      return date.toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="w-[150px]"
                        nameKey="metrics"
                        labelFormatter={(value) => {
                          const date = new Date(value);
                          if (Number.isNaN(date.getTime())) return String(value);
                          return date.toLocaleDateString("en-IN", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          });
                        }}
                        formatter={(value) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">
                              {chartConfig[activeChart]?.label || activeChart}
                            </span>
                            <span className="font-medium tabular-nums text-foreground">
                              {activeChart === "revenue"
                                ? `₹${formatINR(value)}`
                                : Number(value).toLocaleString("en-IN")}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey={activeChart}
                    fill={`var(--color-${activeChart})`}
                    radius={4}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col @container/card">
          <CardHeader className="items-center pb-0">
            <CardTitle>Abandoned carts</CardTitle>
            <CardDescription>{rangeMeta.label}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 items-center pb-0">
            <ChartContainer
              config={radialChartConfig}
              className="mx-auto aspect-square max-h-[250px] w-full"
            >
              <RadialBarChart
                data={radialData}
                endAngle={radialEndAngle}
                innerRadius={65}
                outerRadius={95}
              >
                <PolarGrid
                  gridType="circle"
                  radialLines={false}
                  stroke="none"
                  className="first:fill-muted last:fill-background"
                  polarRadius={[86, 74]}
                />
                <RadialBar dataKey="rate" background />
                <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-4xl font-bold"
                            >
                              {radialRate.toFixed(1)}%
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 24}
                              className="fill-muted-foreground"
                            >
                              Abandoned
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }}
                  />
                </PolarRadiusAxis>
              </RadialBarChart>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex-col gap-2 text-xs">
            <div className="flex items-center gap-2 leading-none font-medium">
              {abandoned.toLocaleString("en-IN")} abandoned carts
              <TrendingUpIcon className="size-4" />
            </div>
            <div className="leading-none text-muted-foreground">
              Last period: {Number(prev.abandonedRate ?? 0).toFixed(1)}%
            </div>
          </CardFooter>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Sales by Location</CardTitle>
            <CardDescription>
              Top states · {rangeMeta.label.toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {locationData.length === 0 ? (
              <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
                No location data in this period.
              </div>
            ) : (
              <ChartContainer config={locationChartConfig} className="aspect-auto h-[220px] w-full">
                <BarChart
                  accessibilityLayer
                  data={locationData}
                  layout="vertical"
                  margin={{ right: 40, left: 4 }}
                >
                  <CartesianGrid horizontal={false} />
                  <YAxis
                    dataKey="location"
                    type="category"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    hide
                  />
                  <XAxis dataKey="sales" type="number" hide />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        formatter={(value, _name, item) => (
                          <div className="flex w-full flex-col gap-1">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">Sales</span>
                              <span className="font-medium tabular-nums text-foreground">
                                ₹{formatINR(value)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">Orders</span>
                              <span className="font-medium tabular-nums text-foreground">
                                {Number(item?.payload?.orders || 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="sales" fill="var(--color-sales)" radius={4}>
                    <LabelList
                      dataKey="location"
                      position="insideLeft"
                      offset={8}
                      className="fill-(--color-label)"
                      fontSize={12}
                    />
                    <LabelList
                      dataKey="sales"
                      position="right"
                      offset={8}
                      className="fill-foreground"
                      fontSize={12}
                      formatter={(value) => `₹${formatINR(value, true)}`}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-xs">
            <div className="flex gap-2 leading-none font-medium">
              {locationData[0]
                ? `${locationData[0].location} leads with ₹${formatINR(locationData[0].sales, true)}`
                : "No leading location yet"}
              <TrendingUpIcon className="size-4 shrink-0" />
            </div>
            <div className="leading-none text-muted-foreground">
              Top {locationData.length || 0} locations by revenue
            </div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Total Revenue</CardTitle>
            <CardDescription>{rangeMeta.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueBars.length === 0 ? (
              <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
                No revenue in this period.
              </div>
            ) : (
              <ChartContainer config={revenueChartConfig} className="aspect-auto h-[220px] w-full">
                <BarChart accessibilityLayer data={revenueBars}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">Revenue</span>
                            <span className="font-medium tabular-nums text-foreground">
                              ₹{formatINR(value)}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={8} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-xs">
            <div className="flex gap-2 leading-none font-medium">
              ₹{formatINR(revenue, true)} total
              <TrendingUpIcon className="size-4" />
            </div>
            <div className="leading-none text-muted-foreground">
              Paid revenue for selected range
            </div>
          </CardFooter>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="@container/card lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest store orders</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href="/admin/orders" />} nativeButton={false}>
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={recentOrderColumns}
              data={recentOrders}
              pageSize={5}
              showFooter={false}
              loading={loading}
              emptyTitle="No recent orders"
              emptyDescription="New orders will show up here."
              className="gap-2"
            />
          </CardContent>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Best Selling Products</CardTitle>
            <CardDescription>
              Top products · {rangeMeta.label.toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={bestSellingColumns}
              data={bestSelling}
              pageSize={5}
              showFooter={false}
              loading={loading}
              emptyTitle="No product sales"
              emptyDescription="Top sellers will show up here."
              className="gap-2"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
