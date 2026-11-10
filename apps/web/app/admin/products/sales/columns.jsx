"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import SafeImage from "@/components/SafeImage";
import { formatINR } from "@/utils/formatINR";
import { variantSummary } from "@/lib/productSalesReport";

function HelpHeader({ label, help, right = true }) {
  return (
    <div className={right ? "text-right" : undefined}>
      <Tooltip>
        <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
          {label}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-pretty">
          {help}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function Num({ value, strong = false }) {
  return (
    <div
      className={`text-right text-[13px] tabular-nums ${
        strong ? "font-semibold text-foreground" : "font-medium text-foreground"
      }`}
    >
      {Number(value || 0).toLocaleString("en-IN")}
    </div>
  );
}

export function createSalesColumns() {
  return [
    {
      id: "rank",
      size: 44,
      header: "#",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {row.index + 1}
        </span>
      ),
    },
    {
      id: "product",
      size: 300,
      meta: { className: "w-[300px]" },
      accessorFn: (row) => row.productName || "",
      header: "Product",
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original;
        const variants = variantSummary(item.variants);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-muted">
              <SafeImage
                src={item.image}
                alt={item.productName || "Product"}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {item.productName || "Product"}
              </span>
              <span
                className="block truncate text-[12px] text-muted-foreground"
                title={variants}
              >
                {item.inCatalog === false ? "Not in catalogue · " : ""}
                {variants || "—"}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: "unitsSold",
      accessorFn: (row) => Number(row.unitsSold || 0),
      header: () => (
        <HelpHeader
          label="Pieces sold"
          help="Units on paid orders placed in this period. Cancelled and abandoned orders are left out."
        />
      ),
      cell: ({ row }) => <Num value={row.original.unitsSold} strong />,
    },
    {
      id: "returnedUnits",
      accessorFn: (row) => Number(row.returnedUnits || 0),
      header: () => (
        <HelpHeader
          label="Returned"
          help="Pieces from these orders that came back (return received)."
        />
      ),
      cell: ({ row }) => <Num value={row.original.returnedUnits} />,
    },
    {
      id: "netUnits",
      accessorFn: (row) => Number(row.netUnits || 0),
      header: () => <div className="text-right">Net pieces</div>,
      cell: ({ row }) => <Num value={row.original.netUnits} />,
    },
    {
      id: "orders",
      accessorFn: (row) => Number(row.orders || 0),
      header: () => <div className="text-right">Orders</div>,
      cell: ({ row }) => <Num value={row.original.orders} />,
    },
    {
      id: "grossSales",
      accessorFn: (row) => Number(row.grossSales || 0),
      header: () => (
        <HelpHeader
          label="Gross sales"
          help="Selling price × pieces, before coupons, delivery and gift fees."
        />
      ),
      cell: ({ row }) => (
        <div className="text-right text-[13px] font-medium tabular-nums text-foreground">
          {formatINR(row.original.grossSales)}
        </div>
      ),
    },
  ];
}
