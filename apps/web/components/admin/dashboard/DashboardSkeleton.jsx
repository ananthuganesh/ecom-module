"use client";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  IndianRupee,
  Percent,
  Repeat,
  ShoppingBag,
  UserPlus,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

function Bone({ className, style }) {
  return <div className={cn("admin-shimmer rounded-md", className)} style={style} />;
}

function KpiCardSkeleton({ title, icon: Icon }) {
  return (
    <Card className="@container/card bg-linear-to-t from-primary/5 to-card dark:bg-card">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-3.5" />
            </span>
          ) : null}
          <span className="font-heading text-sm font-medium">{title}</span>
        </div>
        <Bone className="h-3 w-40" />
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <Bone className="h-8 w-24" />
        <div className="flex h-11 items-end gap-[3px]" aria-hidden>
          {[38, 56, 44, 72, 50, 64].map((height, index) => (
            <Bone
              key={index}
              className="w-[5px] rounded-t-[3px] rounded-b-none"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ListCardSkeleton({ title, description, rows = 5, showMeta = true, showValue = false }) {
  return (
    <Card className="flex h-full flex-col @container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ul className="space-y-3">
          {Array.from({ length: rows }, (_, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Bone className="size-2.5 shrink-0 rounded-full" />
                  <Bone className={cn("h-4", index % 2 ? "w-28" : "w-24")} />
                </div>
                {showMeta ? (
                  <Bone className={cn("mt-1 ml-[18px] h-3", index % 2 ? "w-40" : "w-32")} />
                ) : null}
              </div>
              {showValue ? <Bone className="mt-0.5 h-4 w-8" /> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TableCardSkeleton({ title, description, variant = "orders" }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex h-10 items-center gap-3 border-b border-border/60 last:border-b-0"
            >
              {variant === "products" ? (
                <>
                  <Bone className="size-10 shrink-0 rounded-md" />
                  <Bone className="h-4 min-w-0 flex-1" />
                  <Bone className="h-4 w-10" />
                  <Bone className="h-4 w-16" />
                </>
              ) : (
                <>
                  <Bone className="h-4 w-16" />
                  <Bone className="h-4 min-w-0 flex-1" />
                  <Bone className="h-4 w-14" />
                  <Bone className="h-4 w-16" />
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardSkeleton({ rangeLabel, periodLabel }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4 md:gap-6">
      <span className="sr-only">Loading dashboard</span>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <KpiCardSkeleton title="Total revenue" icon={IndianRupee} />
        <KpiCardSkeleton title="Orders" icon={ShoppingBag} />
        <KpiCardSkeleton title="Average order value" icon={Wallet} />
        <KpiCardSkeleton title="Conversion rate" icon={Percent} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-2">
        <Card className="@container/card flex min-h-0 flex-col lg:col-span-2 lg:row-span-2">
          <CardHeader>
            <CardTitle>Performance overview</CardTitle>
            <CardDescription>vs {rangeLabel}</CardDescription>
            <CardAction>
              <div className="flex overflow-hidden rounded-lg ring-1 ring-foreground/10">
                {["Revenue", "Orders", "AOV"].map((label) => (
                  <div
                    key={label}
                    className="flex min-w-[4.75rem] flex-col items-start gap-1.5 px-2.5 py-1.5"
                  >
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Bone className="h-3.5 w-12" />
                  </div>
                ))}
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-[13.5rem] flex-1 items-end gap-1.5 pt-2">
              {[42, 58, 36, 74, 48, 66, 40, 80, 54, 62, 44, 70].map((height, index) => (
                <Bone
                  key={index}
                  className="min-w-0 flex-1 rounded-t-md rounded-b-none"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <KpiCardSkeleton title="New customers" icon={UserPlus} />
        <KpiCardSkeleton title="Returning customers" icon={Repeat} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ListCardSkeleton
          title="Sales by Location"
          description={`Top 5 cities · ${periodLabel}`}
          rows={5}
          showMeta
        />
        <ListCardSkeleton
          title="Channel performance"
          description={`Checkout sources · ${periodLabel}`}
          rows={4}
          showMeta
          showValue
        />
        <ListCardSkeleton
          title="Needs attention"
          description="Orders requiring attention"
          rows={4}
          showMeta={false}
          showValue
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TableCardSkeleton
          title="Recent Orders"
          description="Latest store orders"
          variant="orders"
        />
        <TableCardSkeleton
          title="Best Selling Products"
          description={`Top products · ${periodLabel}`}
          variant="products"
        />
      </div>
    </div>
  );
}
