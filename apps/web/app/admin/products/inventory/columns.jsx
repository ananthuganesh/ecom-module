"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import SafeImage from "@/components/SafeImage";

/**
 * Shopify inventory buckets:
 * - On hand = unavailable + committed + available (total at location)
 * - Available = can be sold
 * - Committed = part of an unfulfilled order
 * - Unavailable = not for sale and not committed
 * - Incoming = on its way to this location (not part of on hand)
 */
export function inventoryBuckets(row) {
  const onHand = Number(row.onHand ?? row.quantity ?? 0);
  const committed = Number(row.committed ?? row.reserved ?? 0);
  const unavailable = Number(row.unavailable ?? 0);
  const incoming = Number(row.incoming ?? 0);
  const available = Math.max(
    0,
    Number.isFinite(Number(row.available))
      ? Number(row.available)
      : onHand - committed - unavailable
  );
  return { onHand, committed, unavailable, available, incoming };
}

const COLUMN_HELP = {
  onHand:
    "Total stock at this location (unavailable + committed + available).",
  available: "Stock that can be sold.",
  committed: "Stock reserved for open orders.",
  unavailable:
    "Stock not for sale and not reserved.",
  incoming: "Stock incoming to this location.",
};

function QtyHeader({ label, help }) {
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
        {label}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-pretty">
        {help}
      </TooltipContent>
    </Tooltip>
  );
}

function QtyCell({ value }) {
  return (
    <span className="text-[13px] font-medium tabular-nums text-foreground">
      {Number(value || 0)}
    </span>
  );
}

function selectColumn() {
  return {
    id: "select",
    size: 40,
    meta: { className: "w-10" },
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
  };
}

export function createInventoryColumns() {
  return [
    selectColumn(),
    {
      id: "product",
      size: 280,
      meta: { className: "w-[280px]" },
      accessorFn: (row) => row.productName || "",
      header: "Product",
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-border bg-muted">
              <SafeImage
                src={item.productImage}
                alt={item.productName || "Product"}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {item.productName || "Product"}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: "sku",
      size: 140,
      meta: { className: "w-[140px]" },
      accessorFn: (row) => row.variantSku || "",
      header: "SKU",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] font-medium text-muted-foreground">
          {row.original.variantSku || ""}
        </span>
      ),
    },
    {
      id: "unavailable",
      size: 108,
      meta: { label: "Unavailable", className: "w-[108px]" },
      accessorFn: (row) => inventoryBuckets(row).unavailable,
      header: () => (
        <QtyHeader label="Unavailable" help={COLUMN_HELP.unavailable} />
      ),
      cell: ({ row }) => (
        <QtyCell value={inventoryBuckets(row.original).unavailable} />
      ),
    },
    {
      id: "committed",
      size: 108,
      meta: { label: "Committed", className: "w-[108px]" },
      accessorFn: (row) => inventoryBuckets(row).committed,
      header: () => (
        <QtyHeader label="Committed" help={COLUMN_HELP.committed} />
      ),
      cell: ({ row }) => (
        <QtyCell value={inventoryBuckets(row.original).committed} />
      ),
    },
    {
      id: "available",
      size: 108,
      meta: { label: "Available", className: "w-[108px]" },
      accessorFn: (row) => inventoryBuckets(row).available,
      header: () => (
        <QtyHeader label="Available" help={COLUMN_HELP.available} />
      ),
      cell: ({ row }) => (
        <QtyCell value={inventoryBuckets(row.original).available} />
      ),
    },
    {
      id: "onHand",
      size: 96,
      meta: { label: "On hand", className: "w-24" },
      accessorFn: (row) => inventoryBuckets(row).onHand,
      header: () => <QtyHeader label="On hand" help={COLUMN_HELP.onHand} />,
      cell: ({ row }) => (
        <QtyCell value={inventoryBuckets(row.original).onHand} />
      ),
    },
    {
      id: "incoming",
      size: 96,
      meta: { label: "Incoming", className: "w-24" },
      accessorFn: (row) => inventoryBuckets(row).incoming,
      header: () => (
        <QtyHeader label="Incoming" help={COLUMN_HELP.incoming} />
      ),
      cell: ({ row }) => (
        <QtyCell value={inventoryBuckets(row.original).incoming} />
      ),
    },
  ];
}
