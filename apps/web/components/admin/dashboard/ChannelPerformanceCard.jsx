"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CHANNEL_COLORS = {
  direct: "var(--foreground)",
  instagram: "var(--chart-2)",
  facebook: "var(--chart-1)",
  others: "var(--muted-foreground)",
};

const CHANNELS = [
  { key: "direct", label: "Direct" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "others", label: "Others" },
];

function formatINR(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatShare(value, total) {
  if (!total) return "0.0%";
  const pct = (Number(value || 0) / total) * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

function emptyChannel({ key, label }) {
  return { key, label, orders: 0, revenue: 0 };
}

function bucketFromRaw(raw) {
  const rolled = Object.fromEntries(CHANNELS.map((ch) => [ch.key, emptyChannel(ch)]));
  for (const row of raw || []) {
    const s = String(row.source || "direct").trim().toLowerCase();
    let key = "others";
    if (!s || ["direct", "(direct)", "none", "n/a", "(none)"].includes(s)) key = "direct";
    else if (s.includes("instagram") || s === "ig") key = "instagram";
    else if (s.includes("facebook") || ["fb", "meta"].includes(s) || s.includes("fbclid")) {
      key = "facebook";
    }
    rolled[key].orders += Number(row.orders || 0);
    rolled[key].revenue += Number(row.revenue || 0);
  }
  return Object.values(rolled);
}

export default function ChannelPerformanceCard({
  channels,
  fallbackChannels,
  description,
}) {
  const source =
    Array.isArray(channels) && channels.length
      ? channels
      : bucketFromRaw(fallbackChannels);
  const rows = (source.length
    ? source
    : CHANNELS.map(emptyChannel)
  ).map((row) => ({
    ...row,
    color: CHANNEL_COLORS[row.key] || CHANNEL_COLORS.others,
  }));
  const totalRevenue = rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);

  return (
    <Card className="flex h-full flex-col @container/card">
      <CardHeader>
        <CardTitle>Channel performance</CardTitle>
        <CardDescription>
          {description || "Where checkouts came from"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.key} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                  <span className="font-heading text-sm font-medium text-foreground">
                    {row.label}
                  </span>
                </div>
                <div className="mt-1 pl-[18px] text-xs text-muted-foreground">
                  {Number(row.orders || 0).toLocaleString("en-IN")} orders · ₹
                  {formatINR(row.revenue)}
                </div>
              </div>
              <span className="shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                {formatShare(row.revenue, totalRevenue)}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  of revenue
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
