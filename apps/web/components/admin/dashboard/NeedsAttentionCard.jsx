"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ROWS = [
  {
    key: "pendingFulfillment",
    label: "Pending fulfillment",
    href: "/admin/orders?view=unfulfilled",
    color: "var(--chart-1)",
  },
  {
    key: "readyToShip",
    label: "Ready to ship",
    href: "/admin/shipments?shippingStatus=Ready%20To%20Ship",
    color: "var(--chart-2)",
  },
  {
    key: "paymentFailed",
    label: "Payment failed",
    href: "/admin/orders?view=unpaid",
    color: "var(--destructive)",
  },
  {
    key: "returnRequests",
    label: "Return request",
    href: "/admin/orders",
    color: "var(--chart-3)",
  },
];

export default function NeedsAttentionCard({ counts }) {
  const data = counts || {};

  return (
    <Card className="flex h-full flex-col @container/card">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Orders requiring attention</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ul className="space-y-3">
          {ROWS.map((row) => {
            const value =
              row.key === "pendingFulfillment"
                ? Number(data.pendingFulfillment ?? data.unfulfilled ?? 0)
                : Number(data[row.key] || 0);
            return (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center justify-between gap-3 rounded-md outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                      aria-hidden
                    />
                    <span className="font-heading text-sm font-medium text-foreground">
                      {row.label}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {value.toLocaleString("en-IN")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
