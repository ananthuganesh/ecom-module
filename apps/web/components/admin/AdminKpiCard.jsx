"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shared admin KPI card — same look on Home and Analytics.
 */
export default function AdminKpiCard({
  name,
  value,
  change,
  vsLabel,
  detail,
  index = 0,
}) {
  const hasChange = typeof change === "string" && change.length > 0;
  const negative = hasChange && change.startsWith("-");

  return (
    <Card className="gap-0 py-0" size="sm">
      <CardContent className="p-5">
        <span className="text-xs font-medium text-muted-foreground">{name}</span>
        <h3 className="mt-1 mb-1.5 text-lg font-medium text-foreground">{value}</h3>
      {detail ? (
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{detail}</p>
      ) : null}
      {hasChange ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              negative ? "text-destructive" : "text-primary"
            }`}
          >
            {negative ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {change}
          </span>
          {vsLabel ? (
            <span className="text-xs font-medium text-muted-foreground">{vsLabel}</span>
          ) : null}
        </div>
      ) : null}
      </CardContent>
    </Card>
  );
}
