"use client";

function formatINR(value, compact = false) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  });
}

export const bestSellingColumns = [
  {
    accessorKey: "name",
    header: "Product",
    cell: ({ row }) => (
      <div className="flex h-8 items-center">
        <span className="block max-w-[140px] truncate font-medium">
          {row.getValue("name") || "Product"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "quantity",
    header: "Qty",
    meta: { label: "Qty" },
    cell: ({ row }) => (
      <div className="flex h-8 items-center justify-end tabular-nums">
        {Number(row.getValue("quantity") || 0).toLocaleString("en-IN")}
      </div>
    ),
  },
  {
    accessorKey: "revenue",
    header: "Revenue",
    meta: { label: "Revenue" },
    cell: ({ row }) => (
      <div className="flex h-8 items-center justify-end font-medium tabular-nums">
        ₹{formatINR(row.getValue("revenue"), true)}
      </div>
    ),
  },
];
