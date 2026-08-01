"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminOrderService, adminGa4Service } from "@/api";
import AdminKpiCard from "@/components/admin/AdminKpiCard";
import { AdminDateRangeButton } from "@/components/admin/list";

const API_RANGES = {
    "7days": "7d",
    "30days": "30d",
    "90days": "90d",
    "12months": "365d",
};

const RANGE_PRESETS = [
    { value: "7days", label: "Last 7 days" },
    { value: "30days", label: "Last 30 days" },
    { value: "90days", label: "Last 90 days" },
    { value: "12months", label: "Last 12 months" },
];

function fmtInt(n) {
    return Number(n || 0).toLocaleString("en-IN");
}

function fmtPct(rate) {
    const v = Number(rate || 0);
    // GA bounceRate is 0–1
    const pct = v <= 1 ? v * 100 : v;
    return `${pct.toFixed(1)}%`;
}

export default function AnalyticsDashboard() {
    const [timeRange, setTimeRange] = useState("30days");
    const [stats, setStats] = useState(null);
    const [ga, setGa] = useState(null);
    const [loading, setLoading] = useState(true);
    const [gaLoading, setGaLoading] = useState(true);
    const [error, setError] = useState("");
    const rangeLabel = timeRange === "12months" ? "12 months" : timeRange.replace("days", " days");
    const apiRange = API_RANGES[timeRange];

    useEffect(() => {
        let cancelled = false;
        async function loadStats() {
            setLoading(true);
            setError("");
            try {
                const data = await adminOrderService.getStats({ range: apiRange });
                if (!cancelled) setStats(data);
            } catch (err) {
                console.error("Failed to load analytics:", err);
                if (!cancelled) setError("Analytics could not be loaded. Please try again.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadStats();
        return () => {
            cancelled = true;
        };
    }, [apiRange]);

    useEffect(() => {
        let cancelled = false;
        async function loadGa() {
            setGaLoading(true);
            try {
                const data = await adminGa4Service.getReport({ range: apiRange });
                if (!cancelled) setGa(data);
            } catch (err) {
                console.error("Failed to load GA4 report:", err);
                if (!cancelled) {
                    setGa({
                        available: false,
                        configured: false,
                        error: "Could not load Google Analytics",
                        topPages: [],
                        sources: [],
                    });
                }
            } finally {
                if (!cancelled) setGaLoading(false);
            }
        }
        loadGa();
        return () => {
            cancelled = true;
        };
    }, [apiRange]);

    const cards = [
        { name: "Total Sales", value: `₹${Number(stats?.totalRevenue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: stats?.trends?.revenue ?? "+0%" },
        { name: "Orders Created", value: Number(stats?.totalOrders ?? 0).toLocaleString("en-IN"), change: stats?.trends?.orders ?? "+0%" },
        { name: "Total Customers", value: Number(stats?.totalCustomers ?? 0).toLocaleString("en-IN"), change: stats?.trends?.customers ?? "+0%" },
        { name: "Average Order Value", value: `₹${Number(stats?.avgOrderValue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: stats?.trends?.avgValue ?? "+0%" },
    ];
    const maxRevenue = Math.max(...(stats?.series ?? []).map((point) => Number(point.revenue) || 0), 1);
    const channelRevenue = Math.max(Number(stats?.totalRevenue) || 0, 1);
    const maxPageViews = Math.max(...(ga?.topPages ?? []).map((p) => Number(p.pageViews) || 0), 1);
    const maxSourceSessions = Math.max(...(ga?.sources ?? []).map((s) => Number(s.sessions) || 0), 1);

    const trafficCards = [
        { name: "Sessions", value: fmtInt(ga?.kpis?.sessions) },
        { name: "Users", value: fmtInt(ga?.kpis?.users) },
        { name: "Page views", value: fmtInt(ga?.kpis?.pageViews) },
        { name: "Bounce rate", value: ga?.kpis ? fmtPct(ga.kpis.bounceRate) : "—" },
    ];

    return (
        <div className="w-full">
            <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Analytics & Reports</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Store sales from orders · website traffic from Google Analytics</p>
                </div>
                <AdminDateRangeButton
                    value={{ preset: timeRange }}
                    onChange={(next) => setTimeRange(next.preset)}
                    presets={RANGE_PRESETS}
                />
            </div>

            {loading && <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground mb-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…</div>}
            {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600 mb-8">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {cards.map((card, index) => (
                    <AdminKpiCard
                        key={card.name}
                        index={index}
                        name={card.name}
                        value={card.value}
                        change={card.change}
                        vsLabel={`vs previous ${rangeLabel}`}
                    />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-2 bg-muted border border-border p-6 rounded-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xs font-medium text-primary">Sales Over Time</h3>
                            <p className="text-[13px] text-muted-foreground font-medium">Revenue metrics history</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"><div className="w-2.5 h-2.5 bg-primary rounded-sm" /><span>Current Period</span></div>
                    </div>
                    <div className="h-64 flex items-end justify-between gap-2 md:gap-4 pt-6 border-b border-border pb-1">
                        {(stats?.series ?? []).map((point) => (
                            <div key={point.date} className="flex-1 flex flex-col items-center group relative cursor-pointer min-w-0">
                                <div className="absolute bottom-full mb-2 bg-foreground text-primary-foreground text-[13px] font-medium px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">₹{Number(point.revenue || 0).toLocaleString("en-IN")} · {point.orders} orders</div>
                                <div className="w-full bg-primary/20 hover:bg-primary transition-colors rounded-t-sm" style={{ height: `${Math.max((Number(point.revenue || 0) / maxRevenue) * 220, point.revenue ? 3 : 0)}px` }} />
                                <span className="text-[13px] text-muted-foreground font-medium mt-2 truncate max-w-full">{point.date.slice(5)}</span>
                            </div>
                        ))}
                        {!loading && !stats?.series?.length && <p className="m-auto text-sm text-muted-foreground">No sales in this period.</p>}
                    </div>
                </div>

                <div className="bg-muted border border-border p-6 rounded-2xl">
                    <h3 className="text-xs font-medium text-primary mb-1">Sales by Channel</h3>
                    <p className="text-[13px] text-muted-foreground font-medium mb-6">Attribution of store checkouts</p>
                    <div className="space-y-4">
                        {(stats?.channels ?? []).map((channel) => {
                            const percentage = Math.round((Number(channel.revenue || 0) / channelRevenue) * 100);
                            return (
                                <div key={channel.source} className="space-y-1.5">
                                    <div className="flex justify-between items-center text-xs"><span className="font-medium text-muted-foreground capitalize">{channel.source}</span><span className="font-medium text-primary">{percentage}% (₹{Number(channel.revenue || 0).toLocaleString("en-IN")})</span></div>
                                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${percentage}%` }} /></div>
                                </div>
                            );
                        })}
                        {!loading && !stats?.channels?.length && <p className="text-sm text-muted-foreground">No channel data in this period.</p>}
                    </div>
                </div>
            </div>

            <div className="bg-muted border border-border rounded-2xl overflow-hidden mb-10">
                <div className="p-5 border-b border-border bg-muted/50"><h3 className="text-xs font-medium text-primary">Top Performing Products</h3><p className="mt-0.5 text-sm text-muted-foreground">Most ordered inventory catalog listings</p></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead><tr className="border-b border-border text-[13px] font-medium text-muted-foreground bg-muted/30"><th className="p-4">Product Catalog Title</th><th className="p-4 text-center">Items Sold</th><th className="p-4 text-center">Revenue Generated</th></tr></thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            {(stats?.topProducts ?? []).map((product) => <tr key={product.productId} className="hover:bg-muted/50 transition-colors"><td className="p-4 font-medium text-primary">{product.name}</td><td className="p-4 text-center text-foreground font-medium">{product.quantity}</td><td className="p-4 text-center text-foreground font-medium">₹{Number(product.revenue || 0).toLocaleString("en-IN")}</td></tr>)}
                            {!loading && !stats?.topProducts?.length && <tr><td colSpan="3" className="p-8 text-center text-sm text-muted-foreground">No product sales in this period.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Website traffic (GA4) */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                    <h2 className="text-[18px] leading-6 font-medium text-foreground">Website traffic</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">Google Analytics · same date range</p>
                </div>
                {typeof ga?.realtime?.activeUsers === "number" && ga?.available && (
                    <p className="text-[13px] font-medium text-emerald-700">
                        {fmtInt(ga.realtime.activeUsers)} users right now
                    </p>
                )}
            </div>

            {gaLoading && (
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground mb-8">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading traffic…
                </div>
            )}

            {!gaLoading && !ga?.available && (
                <div className="rounded-2xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground mb-8">
                    {ga?.error || "Google Analytics is not configured."}{" "}
                    Set <code className="text-xs">GA4_PROPERTY_ID</code> and credentials in the API environment.
                </div>
            )}

            {!gaLoading && ga?.available && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {trafficCards.map((card, index) => (
                            <AdminKpiCard
                                key={card.name}
                                index={index}
                                name={card.name}
                                value={card.value}
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        <div className="bg-muted border border-border p-6 rounded-2xl">
                            <h3 className="text-xs font-medium text-primary mb-1">Top pages</h3>
                            <p className="text-[13px] text-muted-foreground font-medium mb-5">By page views</p>
                            <div className="space-y-3">
                                {(ga.topPages ?? []).map((page) => (
                                    <div key={page.path} className="space-y-1">
                                        <div className="flex justify-between gap-3 text-xs">
                                            <span className="font-medium text-muted-foreground truncate" title={page.path}>{page.path}</span>
                                            <span className="font-medium text-primary shrink-0">{fmtInt(page.pageViews)}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${Math.round((Number(page.pageViews) / maxPageViews) * 100)}%` }} />
                                        </div>
                                    </div>
                                ))}
                                {!ga.topPages?.length && <p className="text-sm text-muted-foreground">No page data in this period.</p>}
                            </div>
                        </div>

                        <div className="bg-muted border border-border p-6 rounded-2xl">
                            <h3 className="text-xs font-medium text-primary mb-1">Traffic sources</h3>
                            <p className="text-[13px] text-muted-foreground font-medium mb-5">By sessions</p>
                            <div className="space-y-3">
                                {(ga.sources ?? []).map((src) => (
                                    <div key={src.source} className="space-y-1">
                                        <div className="flex justify-between gap-3 text-xs">
                                            <span className="font-medium text-muted-foreground truncate capitalize">{src.source}</span>
                                            <span className="font-medium text-primary shrink-0">{fmtInt(src.sessions)}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${Math.round((Number(src.sessions) / maxSourceSessions) * 100)}%` }} />
                                        </div>
                                    </div>
                                ))}
                                {!ga.sources?.length && <p className="text-sm text-muted-foreground">No source data in this period.</p>}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
