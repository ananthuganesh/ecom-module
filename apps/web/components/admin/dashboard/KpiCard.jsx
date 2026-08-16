"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function sparkMaxIndex(data) {
  let best = 0;
  for (let i = 0; i < data.length; i += 1) {
    if ((data[i]?.value || 0) >= (data[best]?.value || 0)) best = i;
  }
  return best;
}

function MiniBarChart({ data }) {
  const points = data?.length ? data : Array.from({ length: 6 }, () => ({ value: 0 }));
  const max = Math.max(...points.map((point) => Number(point.value) || 0), 1);
  const peak = sparkMaxIndex(points);

  return (
    <div className="flex h-11 items-end gap-[3px]" aria-hidden>
      {points.map((point, index) => {
        const value = Number(point.value) || 0;
        const height = Math.max(18, Math.round((value / max) * 100));
        const active = index === peak;
        return (
          <span
            key={index}
            className="w-[5px] rounded-t-[3px]"
            style={{
              height: `${height}%`,
              backgroundImage: active
                ? "linear-gradient(to top, transparent 0%, var(--chart-1) 100%)"
                : "linear-gradient(to top, transparent 0%, color-mix(in oklab, var(--muted-foreground) 20%, transparent) 100%)",
            }}
          />
        );
      })}
    </div>
  );
}

function TrendLine({ change, comparedTo }) {
  const raw = typeof change === "string" ? change : change != null ? String(change) : "+0%";
  const delta = Number.parseFloat(raw);
  const isZero = !Number.isFinite(delta) || delta === 0;
  const up = Number.isFinite(delta) && delta > 0;
  const Icon = up || isZero ? ArrowUpRight : ArrowDownRight;
  const label = raw.replace(/^[+-]/, "");

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
      <span
        className={
          isZero
            ? "inline-flex items-center font-medium text-muted-foreground"
            : up
              ? "inline-flex items-center font-medium text-[#0c5132]"
              : "inline-flex items-center font-medium text-[#8e1f0b]"
        }
      >
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-muted-foreground">Compared to {comparedTo}</span>
    </p>
  );
}

export default function KpiCard({
  title,
  icon: Icon,
  value,
  change,
  comparedTo,
  sparkline,
}) {
  return (
    <Card className="@container/card bg-linear-to-t from-primary/5 to-card shadow-xs dark:bg-card">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-3.5" />
            </span>
          ) : null}
          <span className="font-heading text-sm font-medium">{title}</span>
        </div>
        <TrendLine change={change} comparedTo={comparedTo} />
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <div className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <MiniBarChart data={sparkline} />
      </CardContent>
    </Card>
  );
}

export function bucketSeries(series, key, buckets = 6) {
  const points = Array.isArray(series) ? series : [];
  if (!points.length) {
    return Array.from({ length: buckets }, () => ({ value: 0 }));
  }
  if (points.length <= buckets) {
    return points.map((point) => ({ value: Number(point?.[key]) || 0 }));
  }
  const size = Math.ceil(points.length / buckets);
  return Array.from({ length: buckets }, (_, index) => {
    const slice = points.slice(index * size, index * size + size);
    return {
      value: slice.reduce((sum, point) => sum + (Number(point?.[key]) || 0), 0),
    };
  });
}
