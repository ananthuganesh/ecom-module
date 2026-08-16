"use client";

import SafeImage from "@/components/SafeImage";

function formatINR(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

export const bestSellingColumns = [
  {
    accessorKey: "name",
    header: "Product",
    cell: ({ row }) => {
      const name = row.getValue("name") || "Product";
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            <SafeImage src={row.original.image} alt={name} fill className="object-cover" />
          </div>
          <span className="truncate font-medium">{name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "quantity",
    header: () => <div className="text-right">Sold</div>,
    size: 64,
    meta: { label: "Sold" },
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {Number(row.getValue("quantity") || 0).toLocaleString("en-IN")}
      </div>
    ),
  },
  {
    accessorKey: "revenue",
    header: () => <div className="text-right">Revenue</div>,
    size: 88,
    meta: { label: "Revenue" },
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        ₹{formatINR(row.getValue("revenue"))}
      </div>
    ),
  },
];
